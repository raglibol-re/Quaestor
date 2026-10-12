// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Quaestor
/// @notice Hierarchical on-chain-enforced ERC-20 (USDC) budgets. A faithful EVM port of the
///         Quaestor Solana program: a pure accounting tree where the contract custodies the token
///         and budget nodes track accounting only (money is a single per-project vault balance).
/// @dev    Authority is always `_msgSender()` so an ERC-2771 relayer may forward meta-transactions.
contract Quaestor is ERC2771Context {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    uint8 public constant MAX_DEPTH = 4; // root depth = 0, deepest = 4
    uint8 public constant MAX_ALLOWLIST = 8;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------
    enum Status {
        Active, // 0
        Frozen, // 1
        Revoked // 2
    }

    struct Project {
        address owner;
        uint64 projectId;
        address mint;
        uint256 vaultBalance;
        bytes32 rootBudget;
        address feePayer;
        bytes32 label;
        bool exists;
    }

    struct Budget {
        bytes32 project;
        bytes32 parent; // bytes32(0) == root
        address agent;
        bytes32 label;
        uint8 depth;
        bool canDelegate;
        uint8 maxChildDepth;
        uint256 allocated;
        uint256 spent;
        uint256 reservedForChildren;
        bool hasPerTxLimit; // false => UNLIMITED
        uint256 perTxLimit;
        bool hasPeriodLimit; // false => UNLIMITED
        uint256 periodLimit;
        int64 periodSeconds;
        int64 periodStart;
        uint256 periodSpent;
        bool hasExpiry; // false => NEVER expires
        int64 expiresAt;
        Status status;
        address[8] allowlist;
        uint8 allowlistLen; // 0 => ANY recipient allowed
        uint16 childrenCount;
        bool exists;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    mapping(bytes32 => Project) private projects;
    mapping(bytes32 => Budget) private budgets;
    mapping(bytes32 => bytes32[]) private projectBudgetKeys;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error Unauthorized();
    error OwnerOnly();
    error NotActive();
    error AncestorNotActive();
    error Expired();
    error CannotDelegate();
    error MaxDepthExceeded();
    error MaxChildDepthExceeded();
    error InsufficientAvailable();
    error PerTxLimitExceeded();
    error PeriodLimitExceeded();
    error LimitTooLoose();
    error ExpiryTooLate();
    error RecipientNotAllowed();
    error AllowlistNotSubset();
    error AllowlistFull();
    error HasReservedChildren();
    error NotReclaimable();
    error WrongParent();
    error InvalidAmount();
    error AlreadyRevoked();
    error AlreadyExists();
    error ChainTooDeep();
    error NotAnAncestor(); // referenced by agentSetStatus (function #7) and its test

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event ProjectCreated(
        bytes32 indexed project, address owner, address mint, uint64 projectId, bytes32 rootBudget
    );
    event Deposited(bytes32 indexed project, address from, uint256 amount, uint256 rootAllocated);
    event BudgetAllocated(
        bytes32 indexed project, bytes32 parent, bytes32 child, address agent, uint256 amount, uint8 depth
    );
    event Spent(bytes32 indexed project, bytes32 budget, address agent, address recipient, uint256 amount);
    event StatusChanged(bytes32 indexed project, bytes32 budget, uint8 status);
    event Reclaimed(bytes32 indexed project, bytes32 parent, bytes32 child, uint256 amount);
    event Withdrawn(bytes32 indexed project, address to, uint256 amount);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    // =====================================================================
    // Key helpers (pure)
    // =====================================================================
    function projectKeyOf(address owner, uint64 id) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, id));
    }

    function budgetKeyOf(bytes32 project, address agent) public pure returns (bytes32) {
        return keccak256(abi.encode(project, agent));
    }

    // =====================================================================
    // Internal helpers
    // =====================================================================
    function _now() internal view returns (int64) {
        return int64(uint64(block.timestamp));
    }

    /// @dev CHECKED subtraction: reverts on underflow, enforcing spent + reserved <= allocated.
    function _available(Budget storage b) internal view returns (uint256) {
        return b.allocated - b.spent - b.reservedForChildren;
    }

    function available(bytes32 key) public view returns (uint256) {
        return _available(budgets[key]);
    }

    function _isExpired(Budget storage b) internal view returns (bool) {
        return b.hasExpiry && _now() >= b.expiresAt;
    }

    /// @dev limitWithin: if parent is UNLIMITED -> any child ok; else child MUST have a limit
    ///      AND childVal <= parentVal. An UNLIMITED child under a FINITE parent is REJECTED.
    function _limitWithin(bool hasChild, uint256 childVal, bool hasParent, uint256 parentVal)
        internal
        pure
        returns (bool)
    {
        if (!hasParent) return true;
        return hasChild && childVal <= parentVal;
    }

    /// @dev expiryWithin: if parent NEVER expires -> any child ok; else child MUST have expiry
    ///      AND childExpiry <= parentExpiry. A never-expiring child under an expiring parent is REJECTED.
    function _expiryWithin(bool hasChildExp, int64 childExp, bool hasParentExp, int64 parentExp)
        internal
        pure
        returns (bool)
    {
        if (!hasParentExp) return true;
        return hasChildExp && childExp <= parentExp;
    }

    /// @dev Walk ancestors (parent chain) bounded by MAX_DEPTH+1 iterations.
    function _checkAncestors(bytes32 key) internal view returns (bool allActive, bool anyRevoked) {
        allActive = true;
        anyRevoked = false;
        bytes32 cur = budgets[key].parent;
        for (uint256 i = 0; i <= MAX_DEPTH; i++) {
            if (cur == bytes32(0)) {
                return (allActive, anyRevoked);
            }
            Budget storage a = budgets[cur];
            if (a.status == Status.Revoked) {
                anyRevoked = true;
                allActive = false;
            } else if (a.status == Status.Frozen) {
                allActive = false;
            }
            if (a.hasExpiry && _now() >= a.expiresAt) {
                allActive = false;
            }
            cur = a.parent;
        }
        revert ChainTooDeep();
    }

    function _isAncestorAgent(bytes32 key, address who) internal view returns (bool) {
        bytes32 cur = budgets[key].parent;
        for (uint256 i = 0; i <= MAX_DEPTH; i++) {
            if (cur == bytes32(0)) {
                return false;
            }
            Budget storage a = budgets[cur];
            if (a.agent == who) {
                return true;
            }
            cur = a.parent;
        }
        revert ChainTooDeep();
    }

    function _inAllowlist(Budget storage b, address who) internal view returns (bool) {
        uint256 n = b.allowlistLen;
        for (uint256 i = 0; i < n; i++) {
            if (b.allowlist[i] == who) {
                return true;
            }
        }
        return false;
    }

    // =====================================================================
    // 1. createProject
    // =====================================================================
    function createProject(uint64 projectId, bytes32 label, address mint, address feePayer)
        external
        returns (bytes32 projectKey, bytes32 rootBudget)
    {
        address owner = _msgSender();
        projectKey = projectKeyOf(owner, projectId);
        if (projects[projectKey].exists) revert AlreadyExists();
        rootBudget = budgetKeyOf(projectKey, owner);

        Project storage p = projects[projectKey];
        p.owner = owner;
        p.projectId = projectId;
        p.mint = mint;
        p.vaultBalance = 0;
        p.rootBudget = rootBudget;
        p.feePayer = feePayer;
        p.label = label;
        p.exists = true;

        Budget storage b = budgets[rootBudget];
        b.project = projectKey;
        b.parent = bytes32(0);
        b.agent = owner;
        b.label = label;
        b.depth = 0;
        b.canDelegate = true;
        b.maxChildDepth = MAX_DEPTH;
        b.status = Status.Active;
        b.periodStart = _now();
        b.exists = true;

        projectBudgetKeys[projectKey].push(rootBudget);

        emit ProjectCreated(projectKey, owner, mint, projectId, rootBudget);
    }

    // =====================================================================
    // 2. deposit
    // =====================================================================
    function deposit(bytes32 projectKey, uint256 amount) external {
        if (amount == 0) revert InvalidAmount();
        Project storage p = projects[projectKey];
        if (!p.exists) revert AlreadyExists(); // no such project

        IERC20(p.mint).safeTransferFrom(_msgSender(), address(this), amount);
        p.vaultBalance += amount;

        Budget storage root = budgets[p.rootBudget];
        root.allocated += amount;

        emit Deposited(projectKey, _msgSender(), amount, root.allocated);
    }

    // =====================================================================
    // 3. allocateChild
    // =====================================================================
    struct AllocArgs {
        bytes32 parentKey;
        address childAgent;
        bytes32 label;
        uint256 amount;
        bool hasPerTx;
        uint64 perTx;
        bool hasPeriod;
        uint64 period;
        int64 periodSeconds;
        bool hasExpiry;
        int64 expiresAt;
        bool canDelegate;
        uint8 maxChildDepth;
    }

    function allocateChild(
        bytes32 parentKey,
        address childAgent,
        bytes32 label,
        uint256 amount,
        bool hasPerTx,
        uint64 perTx,
        bool hasPeriod,
        uint64 period,
        int64 periodSeconds,
        bool hasExpiry,
        int64 expiresAt,
        bool canDelegate,
        uint8 maxChildDepth,
        address[] calldata allowlist
    ) external returns (bytes32 childKey) {
        AllocArgs memory a = AllocArgs({
            parentKey: parentKey,
            childAgent: childAgent,
            label: label,
            amount: amount,
            hasPerTx: hasPerTx,
            perTx: perTx,
            hasPeriod: hasPeriod,
            period: period,
            periodSeconds: periodSeconds,
            hasExpiry: hasExpiry,
            expiresAt: expiresAt,
            canDelegate: canDelegate,
            maxChildDepth: maxChildDepth
        });
        return _allocateChild(a, allowlist);
    }

    function _allocateChild(AllocArgs memory a, address[] calldata allowlist) internal returns (bytes32 childKey) {
        Budget storage parent = budgets[a.parentKey];
        address owner = projects[parent.project].owner;

        // --- checks in order ---
        if (_msgSender() != parent.agent && _msgSender() != owner) revert Unauthorized();
        if (parent.status != Status.Active) revert NotActive();
        if (_isExpired(parent)) revert Expired();
        if (!parent.canDelegate) revert CannotDelegate();

        uint8 newDepth = parent.depth + 1;
        if (newDepth > MAX_DEPTH) revert MaxDepthExceeded();
        if (newDepth > parent.maxChildDepth) revert MaxChildDepthExceeded();
        if (a.maxChildDepth > parent.maxChildDepth) revert MaxChildDepthExceeded();

        if (a.amount == 0) revert InvalidAmount();
        if (a.amount > _available(parent)) revert InsufficientAvailable();

        if (!_limitWithin(a.hasPerTx, a.perTx, parent.hasPerTxLimit, parent.perTxLimit)) revert LimitTooLoose();
        if (!_limitWithin(a.hasPeriod, a.period, parent.hasPeriodLimit, parent.periodLimit)) revert LimitTooLoose();
        if (!_expiryWithin(a.hasExpiry, a.expiresAt, parent.hasExpiry, parent.expiresAt)) revert ExpiryTooLate();

        if (allowlist.length > MAX_ALLOWLIST) revert AllowlistFull();
        if (parent.allowlistLen > 0) {
            for (uint256 i = 0; i < allowlist.length; i++) {
                if (!_inAllowlist(parent, allowlist[i])) revert AllowlistNotSubset();
            }
        }

        bytes32 project = parent.project;
        childKey = budgetKeyOf(project, a.childAgent);
        if (budgets[childKey].exists) revert AlreadyExists();

        // --- init child ---
        Budget storage c = budgets[childKey];
        c.project = project;
        c.parent = a.parentKey;
        c.agent = a.childAgent;
        c.label = a.label;
        c.depth = newDepth;
        c.canDelegate = a.canDelegate;
        c.maxChildDepth = a.maxChildDepth;
        c.allocated = a.amount;
        c.spent = 0;
        c.reservedForChildren = 0;
        c.hasPerTxLimit = a.hasPerTx;
        c.perTxLimit = uint256(a.perTx);
        c.hasPeriodLimit = a.hasPeriod;
        c.periodLimit = uint256(a.period);
        c.periodSeconds = a.periodSeconds;
        c.periodStart = _now();
        c.periodSpent = 0;
        c.hasExpiry = a.hasExpiry;
        c.expiresAt = a.expiresAt;
        c.status = Status.Active;
        c.allowlistLen = uint8(allowlist.length);
        for (uint256 i = 0; i < allowlist.length; i++) {
            c.allowlist[i] = allowlist[i];
        }
        c.childrenCount = 0;
        c.exists = true;

        parent.reservedForChildren += a.amount;
        parent.childrenCount += 1;

        projectBudgetKeys[project].push(childKey);

        emit BudgetAllocated(project, a.parentKey, childKey, a.childAgent, a.amount, newDepth);
    }

    // =====================================================================
    // 4. increaseAllocation
    // =====================================================================
    function increaseAllocation(bytes32 parentKey, bytes32 childKey, uint256 amount) external {
        Budget storage parent = budgets[parentKey];
        Budget storage child = budgets[childKey];
        address owner = projects[parent.project].owner;

        if (_msgSender() != parent.agent && _msgSender() != owner) revert Unauthorized();
        if (parent.status != Status.Active) revert NotActive();
        if (_isExpired(parent)) revert Expired();
        if (!parent.canDelegate) revert CannotDelegate();
        if (amount == 0) revert InvalidAmount();
        if (amount > _available(parent)) revert InsufficientAvailable();
        if (child.parent != parentKey) revert WrongParent();

        child.allocated += amount;
        parent.reservedForChildren += amount;

        emit BudgetAllocated(parent.project, parentKey, childKey, child.agent, amount, child.depth);
    }

    // =====================================================================
    // 5. spend
    // =====================================================================
    function spend(bytes32 budgetKey, address recipient, uint256 amount) external {
        Budget storage b = budgets[budgetKey];

        if (b.agent != _msgSender()) revert Unauthorized();
        if (amount == 0) revert InvalidAmount();
        if (b.status != Status.Active) revert NotActive();
        if (_isExpired(b)) revert Expired();

        (bool allActive,) = _checkAncestors(budgetKey);
        if (!allActive) revert AncestorNotActive();

        if (b.hasPerTxLimit && amount > b.perTxLimit) revert PerTxLimitExceeded();

        // period reset: SNAP-TO-NOW
        if (b.periodSeconds > 0 && b.hasPeriodLimit && _now() >= b.periodStart + b.periodSeconds) {
            b.periodStart = _now();
            b.periodSpent = 0;
        }
        if (b.hasPeriodLimit && b.periodSpent + amount > b.periodLimit) revert PeriodLimitExceeded();

        if (amount > _available(b)) revert InsufficientAvailable();

        if (!(b.allowlistLen == 0 || _inAllowlist(b, recipient))) revert RecipientNotAllowed();

        // effects + interaction (plain ERC20 transfer has no recipient callback)
        Project storage p = projects[b.project];
        p.vaultBalance -= amount;
        IERC20(p.mint).safeTransfer(recipient, amount);
        b.spent += amount;
        if (b.hasPeriodLimit) {
            b.periodSpent += amount;
        }

        emit Spent(b.project, budgetKey, b.agent, recipient, amount);
    }

    // =====================================================================
    // 6. setStatus (owner only freeze/unfreeze)
    // =====================================================================
    function setStatus(bytes32 budgetKey, bool freeze) external {
        Budget storage b = budgets[budgetKey];
        if (_msgSender() != projects[b.project].owner) revert OwnerOnly();
        if (b.status == Status.Revoked) revert AlreadyRevoked();
        b.status = freeze ? Status.Frozen : Status.Active;
        emit StatusChanged(b.project, budgetKey, uint8(b.status));
    }

    // =====================================================================
    // 7. agentSetStatus (ancestor-agent freeze/unfreeze)
    // =====================================================================
    function agentSetStatus(bytes32 budgetKey, bool freeze) external {
        Budget storage b = budgets[budgetKey];
        if (b.status == Status.Revoked) revert AlreadyRevoked();
        if (!_isAncestorAgent(budgetKey, _msgSender())) revert NotAnAncestor();
        b.status = freeze ? Status.Frozen : Status.Active;
        emit StatusChanged(b.project, budgetKey, uint8(b.status));
    }

    // =====================================================================
    // 8. revoke (owner only)
    // =====================================================================
    function revoke(bytes32 budgetKey) external {
        Budget storage b = budgets[budgetKey];
        if (_msgSender() != projects[b.project].owner) revert OwnerOnly();
        if (b.status == Status.Revoked) revert AlreadyRevoked();
        b.status = Status.Revoked;
        emit StatusChanged(b.project, budgetKey, uint8(Status.Revoked));
    }

    // =====================================================================
    // 9. reclaim
    // =====================================================================
    function reclaim(bytes32 parentKey, bytes32 childKey) external {
        Budget storage parent = budgets[parentKey];
        Budget storage child = budgets[childKey];
        address owner = projects[parent.project].owner;

        if (_msgSender() != owner && _msgSender() != parent.agent) revert Unauthorized();
        if (child.parent != parentKey) revert WrongParent();

        (, bool anyRevoked) = _checkAncestors(parentKey);
        bool revokedAbove = anyRevoked || parent.status == Status.Revoked;
        bool childExpired = child.hasExpiry && _now() >= child.expiresAt;
        bool childReclaimable = child.status == Status.Revoked || childExpired || revokedAbove;
        if (!childReclaimable) revert NotReclaimable();
        if (child.reservedForChildren != 0) revert HasReservedChildren();

        uint256 unused = child.allocated - child.spent; // checked subtraction
        child.allocated = child.spent;
        child.status = Status.Revoked;
        parent.reservedForChildren -= unused;

        emit Reclaimed(parent.project, parentKey, childKey, unused);
    }

    // =====================================================================
    // 10. withdraw (owner only)
    // =====================================================================
    function withdraw(bytes32 projectKey, address to, uint256 amount) external {
        Project storage p = projects[projectKey];
        if (_msgSender() != p.owner) revert OwnerOnly();
        if (amount == 0) revert InvalidAmount();

        Budget storage root = budgets[p.rootBudget];
        if (amount > _available(root)) revert InsufficientAvailable();

        p.vaultBalance -= amount;
        IERC20(p.mint).safeTransfer(to, amount);
        root.allocated -= amount;

        emit Withdrawn(projectKey, to, amount);
    }

    // =====================================================================
    // Views (for SDK enumeration)
    // =====================================================================
    function getProjectBudgetKeys(bytes32 projectKey) external view returns (bytes32[] memory) {
        return projectBudgetKeys[projectKey];
    }

    function getBudget(bytes32 key) external view returns (Budget memory) {
        return budgets[key];
    }

    function getProject(bytes32 key) external view returns (Project memory) {
        return projects[key];
    }
}
