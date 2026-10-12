// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Quaestor} from "../src/Quaestor.sol";

// ---------------------------------------------------------------------------
// Minimal 6-decimal ERC20 with a mint helper (SafeERC20-compatible: returns bool)
// ---------------------------------------------------------------------------
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, string memory s, uint8 d) {
        name = n;
        symbol = s;
        decimals = d;
    }

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
    }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        _transfer(msg.sender, to, amt);
        return true;
    }

    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        require(a >= amt, "allowance");
        if (a != type(uint256).max) allowance[f][msg.sender] = a - amt;
        _transfer(f, t, amt);
        return true;
    }

    function _transfer(address f, address t, uint256 amt) internal {
        require(balanceOf[f] >= amt, "balance");
        balanceOf[f] -= amt;
        balanceOf[t] += amt;
    }
}

// ===========================================================================
// Functional tests: 3-level tree built fresh in setUp()
// ===========================================================================
contract QuaestorTest is Test {
    Quaestor internal q;
    MockERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal orchestrator = makeAddr("orchestrator");
    address internal research = makeAddr("research");
    address internal scraper = makeAddr("scraper");
    address internal outsider = makeAddr("outsider");
    address internal RECIP = makeAddr("recipient");
    address internal RECIP_A = makeAddr("recipA");
    address internal RECIP_B = makeAddr("recipB");
    address internal WD = makeAddr("withdrawTo");

    bytes32 internal constant LABEL = bytes32("proj");

    bytes32 internal projectKey;
    bytes32 internal rootKey;
    bytes32 internal orchKey;
    bytes32 internal researchKey;
    bytes32 internal scraperKey;

    // mirror of Quaestor.Spent so vm.expectEmit can match the on-chain topic + data
    event Spent(
        bytes32 indexed project,
        bytes32 budget,
        address agent,
        address recipient,
        uint256 amount,
        bytes32 taskId,
        bytes32 reasonHash
    );

    function _al() internal pure returns (address[] memory a) {
        a = new address[](0);
    }

    function _one(address x) internal pure returns (address[] memory a) {
        a = new address[](1);
        a[0] = x;
    }

    function setUp() public {
        token = new MockERC20("USD Coin", "USDC", 6);
        q = new Quaestor(address(0));

        vm.prank(owner);
        (projectKey, rootKey) = q.createProject(1, LABEL, address(token), owner);

        token.mint(owner, 10_000_000);
        vm.startPrank(owner);
        token.approve(address(q), 10_000_000);
        q.deposit(projectKey, 10_000_000);
        // orchestrator: 6e6, unlimited, can delegate
        orchKey = q.allocateChild(
            rootKey, orchestrator, LABEL, 6_000_000, false, 0, false, 0, 0, false, 0, true, 4, _al()
        );
        vm.stopPrank();

        // orchestrator -> research: 2e6, perTx 0.5e6
        vm.prank(orchestrator);
        researchKey = q.allocateChild(
            orchKey, research, LABEL, 2_000_000, true, 500_000, false, 0, 0, false, 0, true, 4, _al()
        );

        // research -> scraper: 1e6, perTx 0.5e6, canDelegate = false
        vm.prank(research);
        scraperKey = q.allocateChild(
            researchKey, scraper, LABEL, 1_000_000, true, 500_000, false, 0, 0, false, 0, false, 4, _al()
        );
    }

    // ---- happy path accounting ---------------------------------------------
    function test_HappyPath_Accounting() public {
        // reservation accounting
        assertEq(q.getBudget(rootKey).reservedForChildren, 6_000_000, "root reserved");
        assertEq(q.available(rootKey), 4_000_000, "root available");
        assertEq(q.getBudget(scraperKey).depth, 3, "scraper depth");
        assertEq(q.getBudget(orchKey).depth, 1, "orch depth");
        assertEq(q.getBudget(researchKey).depth, 2, "research depth");

        // spend on each level
        vm.prank(orchestrator);
        q.spend(orchKey, RECIP, 1_000_000, bytes32(0), bytes32(0));
        vm.prank(research);
        q.spend(researchKey, RECIP, 500_000, bytes32(0), bytes32(0));
        vm.prank(scraper);
        q.spend(scraperKey, RECIP, 500_000, bytes32(0), bytes32(0));

        // balances
        assertEq(q.getProject(projectKey).vaultBalance, 8_000_000, "vault");
        assertEq(token.balanceOf(RECIP), 2_000_000, "recipient");
        assertEq(token.balanceOf(address(q)), 8_000_000, "contract token bal");

        // per-node spent / available
        assertEq(q.getBudget(orchKey).spent, 1_000_000, "orch spent");
        assertEq(q.available(orchKey), 3_000_000, "orch available"); // 6 - 1 - 2
        assertEq(q.getBudget(researchKey).spent, 500_000, "research spent");
        assertEq(q.available(researchKey), 500_000, "research available"); // 2 - .5 - 1
        assertEq(q.getBudget(scraperKey).spent, 500_000, "scraper spent");
        assertEq(q.available(scraperKey), 500_000, "scraper available"); // 1 - .5
    }

    // ---- per-tx limit ------------------------------------------------------
    function test_PerTxLimitExceeded() public {
        vm.prank(research);
        vm.expectRevert(Quaestor.PerTxLimitExceeded.selector);
        q.spend(researchKey, RECIP, 3_000_000, bytes32(0), bytes32(0));
    }

    // ---- period limit + snap-to-now reset ----------------------------------
    function test_PeriodLimit_And_Reset() public {
        // allocate a period-limited agent under orchestrator (unlimited parent)
        address periodAgent = makeAddr("periodAgent");
        vm.prank(orchestrator);
        bytes32 pKey = q.allocateChild(
            orchKey, periodAgent, LABEL, 3_000_000, false, 0, true, 1_000_000, 3600, false, 0, true, 4, _al()
        );

        vm.startPrank(periodAgent);
        q.spend(pKey, RECIP, 600_000, bytes32(0), bytes32(0));
        q.spend(pKey, RECIP, 400_000, bytes32(0), bytes32(0)); // periodSpent == 1_000_000 == limit
        vm.expectRevert(Quaestor.PeriodLimitExceeded.selector);
        q.spend(pKey, RECIP, 1, bytes32(0), bytes32(0));
        vm.stopPrank();

        // advance past the window -> snap-to-now reset
        vm.warp(block.timestamp + 3601);
        vm.prank(periodAgent);
        q.spend(pKey, RECIP, 500_000, bytes32(0), bytes32(0)); // succeeds after reset

        assertEq(q.getBudget(pKey).periodSpent, 500_000, "periodSpent after reset");
        assertEq(q.getBudget(pKey).spent, 1_500_000, "total spent");
    }

    // ---- freeze by owner ---------------------------------------------------
    function test_Freeze_Owner_BlocksDescendantSpend() public {
        vm.prank(owner);
        q.setStatus(orchKey, true); // freeze orchestrator

        vm.prank(research);
        vm.expectRevert(Quaestor.AncestorNotActive.selector);
        q.spend(researchKey, RECIP, 100_000, bytes32(0), bytes32(0));

        vm.prank(owner);
        q.setStatus(orchKey, false); // unfreeze

        vm.prank(research);
        q.spend(researchKey, RECIP, 100_000, bytes32(0), bytes32(0)); // succeeds
        assertEq(q.getBudget(researchKey).spent, 100_000, "research spent after unfreeze");
    }

    // ---- agentSetStatus (ancestor-agent freeze) ----------------------------
    function test_AgentSetStatus_AncestorFreeze() public {
        // orchestrator (ancestor) freezes research
        vm.prank(orchestrator);
        q.agentSetStatus(researchKey, true);
        vm.prank(research);
        vm.expectRevert(Quaestor.NotActive.selector);
        q.spend(researchKey, RECIP, 100_000, bytes32(0), bytes32(0));

        // unrelated address cannot
        vm.prank(outsider);
        vm.expectRevert(Quaestor.NotAnAncestor.selector);
        q.agentSetStatus(researchKey, true);

        // grandparent (orchestrator) freezes grandchild (scraper)
        vm.prank(orchestrator);
        q.agentSetStatus(scraperKey, true);
        vm.prank(scraper);
        vm.expectRevert(Quaestor.NotActive.selector);
        q.spend(scraperKey, RECIP, 100_000, bytes32(0), bytes32(0));
    }

    // ---- allowlist ---------------------------------------------------------
    function test_Allowlist_RecipientAndSubset() public {
        // allocate an allowlisted child under orchestrator (orchestrator has empty allowlist)
        address payer = makeAddr("payer");
        vm.prank(orchestrator);
        bytes32 payerKey = q.allocateChild(
            orchKey, payer, LABEL, 1_000_000, false, 0, false, 0, 0, false, 0, true, 4, _one(RECIP_A)
        );

        // spend to allowed recipient ok
        vm.prank(payer);
        q.spend(payerKey, RECIP_A, 100_000, bytes32(0), bytes32(0));
        assertEq(token.balanceOf(RECIP_A), 100_000, "recipA received");

        // spend to other recipient rejected
        vm.prank(payer);
        vm.expectRevert(Quaestor.RecipientNotAllowed.selector);
        q.spend(payerKey, RECIP_B, 100_000, bytes32(0), bytes32(0));

        // subset enforcement on allocateChild: [RECIP_B] not subset of [RECIP_A]
        address sub = makeAddr("subAgent");
        vm.prank(payer);
        vm.expectRevert(Quaestor.AllowlistNotSubset.selector);
        q.allocateChild(payerKey, sub, LABEL, 100_000, false, 0, false, 0, 0, false, 0, true, 4, _one(RECIP_B));

        // subset [RECIP_A] is allowed
        vm.prank(payer);
        q.allocateChild(payerKey, sub, LABEL, 100_000, false, 0, false, 0, 0, false, 0, true, 4, _one(RECIP_A));
    }

    // ---- limit inheritance (Option-typed, do-not-invert) -------------------
    function test_LimitInheritance_Rejections() public {
        address g = makeAddr("grandchild");

        // unlimited child under finite parent -> LimitTooLoose
        vm.prank(research);
        vm.expectRevert(Quaestor.LimitTooLoose.selector);
        q.allocateChild(researchKey, g, LABEL, 500_000, false, 0, false, 0, 0, false, 0, true, 4, _al());

        // looser finite value (1e6 > 0.5e6) -> LimitTooLoose
        vm.prank(research);
        vm.expectRevert(Quaestor.LimitTooLoose.selector);
        q.allocateChild(researchKey, g, LABEL, 500_000, true, 1_000_000, false, 0, 0, false, 0, true, 4, _al());

        // tighter finite value (0.3e6 <= 0.5e6) -> ok
        vm.prank(research);
        bytes32 gKey =
            q.allocateChild(researchKey, g, LABEL, 500_000, true, 300_000, false, 0, 0, false, 0, true, 4, _al());
        assertEq(q.getBudget(gKey).perTxLimit, 300_000, "grandchild perTx");
    }

    // ---- reclaim: unused returns to parent reserve -------------------------
    function test_Reclaim_UnusedReturnsToParent() public {
        // scraper spends 0.5e6 first
        vm.prank(scraper);
        q.spend(scraperKey, RECIP, 500_000, bytes32(0), bytes32(0));

        // owner revokes scraper, then reclaim
        vm.prank(owner);
        q.revoke(scraperKey);

        assertEq(q.getBudget(researchKey).reservedForChildren, 1_000_000, "research reserved before");
        vm.prank(owner);
        q.reclaim(researchKey, scraperKey);

        // unused = 1e6 - 0.5e6 = 0.5e6 returns to research reserve
        assertEq(q.getBudget(researchKey).reservedForChildren, 500_000, "research reserved after");
        assertEq(q.getBudget(scraperKey).allocated, 500_000, "scraper allocated collapsed to spent");
        assertEq(uint8(q.getBudget(scraperKey).status), 2, "scraper revoked");
        assertEq(q.available(researchKey), 1_500_000, "research available increased"); // 2 - 0 - 0.5
    }

    // ---- reclaim survives a revoked ancestor --------------------------------
    function test_Reclaim_SurvivesRevokedAncestor() public {
        // revoke orchestrator (ancestor); scraper remains Active
        vm.prank(owner);
        q.revoke(orchKey);
        assertEq(uint8(q.getBudget(scraperKey).status), 0, "scraper still active");

        // reclaim scraper from research still works (revoked ancestor above)
        vm.prank(owner);
        q.reclaim(researchKey, scraperKey);

        assertEq(q.getBudget(researchKey).reservedForChildren, 0, "research reserved cleared");
        assertEq(uint8(q.getBudget(scraperKey).status), 2, "scraper revoked");
        assertEq(q.getBudget(scraperKey).allocated, 0, "scraper allocated collapsed");
    }

    // ---- withdraw ----------------------------------------------------------
    function test_Withdraw_FromRootAvailable() public {
        vm.prank(owner);
        q.withdraw(projectKey, WD, 4_000_000);

        assertEq(token.balanceOf(WD), 4_000_000, "withdraw received");
        assertEq(q.getProject(projectKey).vaultBalance, 6_000_000, "vault after withdraw");
        assertEq(q.getBudget(rootKey).allocated, 6_000_000, "root allocated after withdraw");
        assertEq(q.available(rootKey), 0, "root available now 0");

        // cannot withdraw reserved/spent funds
        vm.prank(owner);
        vm.expectRevert(Quaestor.InsufficientAvailable.selector);
        q.withdraw(projectKey, WD, 1);
    }

    function test_Withdraw_CannotExceedAvailable() public {
        vm.prank(owner);
        vm.expectRevert(Quaestor.InsufficientAvailable.selector);
        q.withdraw(projectKey, WD, 5_000_000); // only 4e6 available
    }

    function test_Withdraw_OwnerOnly() public {
        vm.prank(outsider);
        vm.expectRevert(Quaestor.OwnerOnly.selector);
        q.withdraw(projectKey, WD, 1_000_000);
    }

    // ---- misc guards -------------------------------------------------------
    function test_CreateProject_AlreadyExists() public {
        vm.prank(owner);
        vm.expectRevert(Quaestor.AlreadyExists.selector);
        q.createProject(1, LABEL, address(token), owner);
    }

    function test_Spend_UnauthorizedAgent() public {
        vm.prank(outsider);
        vm.expectRevert(Quaestor.Unauthorized.selector);
        q.spend(researchKey, RECIP, 100_000, bytes32(0), bytes32(0));
    }

    // ---- spend records on-chain attribution (taskId + reasonHash) ----------
    function test_Spend_EmitsAttribution() public {
        bytes32 taskId = keccak256("task-42");
        bytes32 reasonHash = keccak256("buy dataset");

        vm.expectEmit(true, false, false, true, address(q));
        emit Spent(projectKey, orchKey, orchestrator, RECIP, 1_000_000, taskId, reasonHash);

        vm.prank(orchestrator);
        q.spend(orchKey, RECIP, 1_000_000, taskId, reasonHash);
    }

    function test_Allocate_InsufficientAvailable() public {
        // research available is 1e6 (2e6 - 1e6 reserved); ask for 2e6
        address g = makeAddr("g2");
        vm.prank(research);
        vm.expectRevert(Quaestor.InsufficientAvailable.selector);
        q.allocateChild(researchKey, g, LABEL, 2_000_000, true, 100_000, false, 0, 0, false, 0, true, 4, _al());
    }

    function test_MaxDepthExceeded() public {
        // scraper is depth 3; its child would be depth 4 (ok), grandchild depth 5 (reject).
        // scraper.canDelegate == false, so first allocate a delegating depth-4 under research instead.
        address d4 = makeAddr("d4agent");
        vm.prank(research);
        bytes32 d4Key =
            q.allocateChild(researchKey, d4, LABEL, 200_000, true, 100_000, false, 0, 0, false, 0, true, 4, _al());
        assertEq(q.getBudget(d4Key).depth, 3, "d4 depth is 3");

        // now under d4 (depth 3) allocate depth 4 (ok)
        address d5 = makeAddr("d5agent");
        vm.prank(d4);
        bytes32 d5Key =
            q.allocateChild(d4Key, d5, LABEL, 100_000, true, 100_000, false, 0, 0, false, 0, true, 4, _al());
        assertEq(q.getBudget(d5Key).depth, 4, "depth 4 ok");

        // under depth-4 node, depth-5 is rejected
        address d6 = makeAddr("d6agent");
        vm.prank(d5);
        vm.expectRevert(Quaestor.MaxDepthExceeded.selector);
        q.allocateChild(d5Key, d6, LABEL, 50_000, true, 50_000, false, 0, 0, false, 0, true, 4, _al());
    }

    function test_IncreaseAllocation() public {
        // owner increases research allocation by 1e6 (root has 4e6 available at orch level? no: increase is from orch)
        uint256 beforeReserved = q.getBudget(orchKey).reservedForChildren;
        vm.prank(orchestrator);
        q.increaseAllocation(orchKey, researchKey, 1_000_000);
        assertEq(q.getBudget(researchKey).allocated, 3_000_000, "research allocated increased");
        assertEq(q.getBudget(orchKey).reservedForChildren, beforeReserved + 1_000_000, "orch reserved increased");
    }
}

// ===========================================================================
// Invariant test
// ===========================================================================
contract Handler is Test {
    Quaestor public q;
    MockERC20 public token;
    address public owner;
    bytes32 public projectKey;
    bytes32 public rootKey;
    address[6] public agents;
    bytes32[] public budgetKeys;
    mapping(bytes32 => bool) public known;

    bytes32 internal constant LBL = bytes32("inv");
    address internal constant RECIP = address(0xBEEF);

    constructor(Quaestor _q, MockERC20 _t, address _owner, bytes32 _pk, bytes32 _rk) {
        q = _q;
        token = _t;
        owner = _owner;
        projectKey = _pk;
        rootKey = _rk;
        budgetKeys.push(_rk);
        known[_rk] = true;
        for (uint256 i = 0; i < 6; i++) {
            agents[i] = address(uint160(0x10000 + i));
        }
    }

    function allKeys() external view returns (bytes32[] memory) {
        return budgetKeys;
    }

    function hdl_deposit(uint256 amt) external {
        amt = bound(amt, 1, 1_000_000_000_000);
        token.mint(owner, amt);
        vm.startPrank(owner);
        token.approve(address(q), amt);
        q.deposit(projectKey, amt);
        vm.stopPrank();
    }

    function hdl_allocate(uint256 pSeed, uint256 aSeed, uint256 amt) external {
        bytes32 parentKey = budgetKeys[pSeed % budgetKeys.length];
        Quaestor.Budget memory pb = q.getBudget(parentKey);
        if (pb.status != Quaestor.Status.Active) return;
        uint256 avail = pb.allocated - pb.spent - pb.reservedForChildren;
        if (avail == 0) return;
        address ag = agents[aSeed % agents.length];
        bytes32 childKey = q.budgetKeyOf(projectKey, ag);
        if (known[childKey]) return;
        amt = bound(amt, 1, avail);
        address[] memory empty = new address[](0);
        vm.prank(pb.agent);
        try q.allocateChild(parentKey, ag, LBL, amt, false, 0, false, 0, 0, false, 0, true, 4, empty) returns (
            bytes32 ck
        ) {
            budgetKeys.push(ck);
            known[ck] = true;
        } catch {}
    }

    function hdl_spend(uint256 bSeed, uint256 amt) external {
        bytes32 k = budgetKeys[bSeed % budgetKeys.length];
        Quaestor.Budget memory b = q.getBudget(k);
        if (b.status != Quaestor.Status.Active) return;
        uint256 avail = b.allocated - b.spent - b.reservedForChildren;
        if (avail == 0) return;
        amt = bound(amt, 1, avail);
        vm.prank(b.agent);
        try q.spend(k, RECIP, amt, bytes32(0), bytes32(0)) {} catch {}
    }

    function hdl_reclaim(uint256 cSeed) external {
        bytes32 childKey = budgetKeys[cSeed % budgetKeys.length];
        if (childKey == rootKey) return;
        Quaestor.Budget memory c = q.getBudget(childKey);
        vm.prank(owner);
        try q.revoke(childKey) {} catch {}
        vm.prank(owner);
        try q.reclaim(c.parent, childKey) {} catch {}
    }
}

contract QuaestorInvariantTest is StdInvariant, Test {
    Quaestor internal q;
    MockERC20 internal token;
    Handler internal handler;
    address internal owner = address(0xA11CE);
    bytes32 internal projectKey;
    bytes32 internal rootKey;

    function setUp() public {
        token = new MockERC20("USD Coin", "USDC", 6);
        q = new Quaestor(address(0));
        vm.prank(owner);
        (projectKey, rootKey) = q.createProject(1, bytes32("inv"), address(token), owner);

        handler = new Handler(q, token, owner, projectKey, rootKey);

        bytes4[] memory sel = new bytes4[](4);
        sel[0] = Handler.hdl_deposit.selector;
        sel[1] = Handler.hdl_allocate.selector;
        sel[2] = Handler.hdl_spend.selector;
        sel[3] = Handler.hdl_reclaim.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
        targetContract(address(handler));
    }

    /// @dev For every known budget: spent + reserved <= allocated, and
    ///      the sum of available across the tree equals the project vault balance.
    function invariant_NodeAndConservation() public view {
        bytes32[] memory keys = handler.allKeys();
        uint256 sumAvail;
        for (uint256 i = 0; i < keys.length; i++) {
            Quaestor.Budget memory b = q.getBudget(keys[i]);
            assertLe(b.spent + b.reservedForChildren, b.allocated, "node invariant broken");
            sumAvail += (b.allocated - b.spent - b.reservedForChildren);
        }
        uint256 vault = q.getProject(projectKey).vaultBalance;
        assertLe(sumAvail, vault, "sum(available) must be <= vault");
        assertEq(sumAvail, vault, "sum(available) must equal vault");
        assertEq(token.balanceOf(address(q)), vault, "token balance must equal vault");
    }
}
