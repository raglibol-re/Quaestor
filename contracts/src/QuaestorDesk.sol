// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev HyperCore system contract — actions are encoded and submitted here (fire-and-forget).
interface ICoreWriter {
    function sendRawAction(bytes calldata data) external;
}

/// @title QuaestorDesk
/// @notice A **trading mandate** for AI agents on Hyperliquid (HyperEVM + HyperCore). A principal
///         deposits USDC and grants an agent a mandate with pre-trade risk limits — allowed asset
///         indices, max notional per order, max notional per rolling day, an equity floor (drawdown
///         stop), an expiry, and a freeze. Every `placeOrder` is policy-checked on HyperEVM against
///         live HyperCore state BEFORE the order action is sent to CoreWriter.
/// @dev    Same design DNA as Quaestor.sol: Option-typed limits (`hasX`/`x`), snap-to-now rolling
///         period, `Status{Active,Frozen,Revoked}`, allowlist-as-subset, authority = `_msgSender()`
///         (ERC-2771 so a relayer forwards the agent's signed meta-tx — the agent holds no gas).
///
///         HyperCore specifics marked `VERIFY` must be confirmed against the Hyperliquid docs /
///         `hyperevm-tools` before the live-fork run (exact precompile addresses + CoreWriter action
///         byte-layout). The policy enforcement below is chain-agnostic and fully unit-tested with
///         mocked precompiles; conservative accounting counts notional at placement because Core
///         fills are asynchronous and CoreWriter actions are fire-and-forget (validate before, verify
///         after via read precompiles).
contract QuaestorDesk is ERC2771Context {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // HyperCore system addresses (VERIFY against HL docs before the fork test)
    // ---------------------------------------------------------------------
    address public constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
    /// @dev read precompile returning the caller-account perp equity (USD). VERIFY exact address.
    address public constant L1_READ_PERP_EQUITY = 0x0000000000000000000000000000000000000800;
    /// @dev CoreWriter action ids (VERIFY): 1 = limit order, 7 = USD class transfer, 10 = cancel by oid, 11 = cancel by cloid.
    uint8 private constant ACTION_LIMIT_ORDER = 1;
    uint8 private constant ACTION_USD_CLASS_TRANSFER = 7;
    uint8 private constant ACTION_CANCEL_OID = 10;
    uint8 private constant ACTION_CANCEL_CLOID = 11;

    uint8 public constant MAX_ASSETS = 8;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------
    enum Status {
        Active, // 0
        Frozen, // 1
        Revoked // 2
    }

    struct DeskMandate {
        address principal; // funds + controls the mandate
        address agent; // the trading agent (authority for placeOrder/cancel)
        uint256 deposited; // USDC custodied by the desk for this mandate
        uint32[8] allowedAssets; // HyperCore asset indices this agent may trade
        uint8 allowedLen; // 0 => NONE allowed
        bool hasMaxOrder; // false => UNLIMITED per-order notional
        uint256 maxNotionalPerOrder;
        bool hasMaxDay; // false => UNLIMITED per-day notional
        uint256 maxNotionalPerDay;
        int64 dayStart; // rolling-24h window start (snap-to-now)
        uint256 dayNotionalUsed;
        uint256 equityFloor; // 0 => no floor; else desk equity must stay >= this pre-trade
        bool hasExpiry; // false => NEVER expires
        int64 expiresAt;
        Status status;
        bool exists;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    address public immutable owner; // desk operator; may freeze/revoke any mandate
    IERC20 public immutable usdc;
    mapping(bytes32 => DeskMandate) private mandates;
    bytes32[] private mandateKeys; // enumeration for the SDK / dashboard

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event MandateCreated(bytes32 indexed id, address indexed principal, address indexed agent);
    event Deposited(bytes32 indexed id, uint256 amount, uint256 deposited);
    event PerpFunded(bytes32 indexed id, uint256 amount);
    event OrderPlaced(
        bytes32 indexed id,
        uint32 asset,
        bool isBuy,
        uint64 px,
        uint64 sz,
        uint256 notional,
        bytes32 taskId,
        bytes32 reasonHash
    );
    event OrderCancelled(bytes32 indexed id, uint32 asset, uint64 oidOrCloid, bool byCloid);
    event StatusChanged(bytes32 indexed id, uint8 status);
    event Withdrawn(bytes32 indexed id, address to, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error Unauthorized();
    error OwnerOnly();
    error PrincipalOnly();
    error NotActive();
    error Expired();
    error AlreadyExists();
    error NotFound();
    error InvalidAmount();
    error TooManyAssets();
    error AssetNotAllowed();
    error OrderNotionalExceeded();
    error DayNotionalExceeded();
    error EquityFloorBreached();
    error AlreadyRevoked();
    error InsufficientCustody();

    constructor(address trustedForwarder, address usdc_) ERC2771Context(trustedForwarder) {
        owner = _msgSender();
        usdc = IERC20(usdc_);
    }

    // =====================================================================
    // Key helper (pure)
    // =====================================================================
    function mandateIdOf(address principal, address agent) public pure returns (bytes32) {
        return keccak256(abi.encode(principal, agent));
    }

    // =====================================================================
    // Internal helpers
    // =====================================================================
    function _now() internal view returns (int64) {
        return int64(uint64(block.timestamp));
    }

    function _assetAllowed(DeskMandate storage m, uint32 asset) internal view returns (bool) {
        uint256 n = m.allowedLen;
        for (uint256 i = 0; i < n; i++) {
            if (m.allowedAssets[i] == asset) return true;
        }
        return false;
    }

    /// @dev Desk perp-account equity (USD) read from a HyperCore read precompile. Mocked in tests.
    function _readEquity() internal view returns (uint256) {
        (bool ok, bytes memory out) = L1_READ_PERP_EQUITY.staticcall(abi.encode(address(this)));
        if (!ok || out.length < 32) return 0;
        return abi.decode(out, (uint256));
    }

    /// @dev CoreWriter payload = version(1) || actionId(3 bytes) || abi.encode(params). VERIFY layout.
    function _encode(uint8 actionId, bytes memory params) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(1), uint8(0), uint8(0), actionId, params);
    }

    function _mandate(bytes32 id) internal view returns (DeskMandate storage m) {
        m = mandates[id];
        if (!m.exists) revert NotFound();
    }

    // =====================================================================
    // createMandate (principal grants a trading mandate to an agent)
    // =====================================================================
    function createMandate(
        address agent,
        uint32[] calldata assets,
        bool hasMaxOrder,
        uint256 maxNotionalPerOrder,
        bool hasMaxDay,
        uint256 maxNotionalPerDay,
        uint256 equityFloor,
        bool hasExpiry,
        int64 expiresAt
    ) external returns (bytes32 id) {
        address principal = _msgSender();
        id = mandateIdOf(principal, agent);
        if (mandates[id].exists) revert AlreadyExists();
        if (assets.length > MAX_ASSETS) revert TooManyAssets();

        DeskMandate storage m = mandates[id];
        m.principal = principal;
        m.agent = agent;
        for (uint256 i = 0; i < assets.length; i++) {
            m.allowedAssets[i] = assets[i];
        }
        m.allowedLen = uint8(assets.length);
        m.hasMaxOrder = hasMaxOrder;
        m.maxNotionalPerOrder = maxNotionalPerOrder;
        m.hasMaxDay = hasMaxDay;
        m.maxNotionalPerDay = maxNotionalPerDay;
        m.dayStart = _now();
        m.equityFloor = equityFloor;
        m.hasExpiry = hasExpiry;
        m.expiresAt = expiresAt;
        m.status = Status.Active;
        m.exists = true;
        mandateKeys.push(id);

        emit MandateCreated(id, principal, agent);
    }

    // =====================================================================
    // deposit (principal funds the mandate's USDC custody)
    // =====================================================================
    function deposit(bytes32 id, uint256 amount) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.principal) revert PrincipalOnly();
        if (amount == 0) revert InvalidAmount();
        usdc.safeTransferFrom(_msgSender(), address(this), amount);
        m.deposited += amount;
        emit Deposited(id, amount, m.deposited);
    }

    /// @dev Move custodied USDC to the desk's HyperCore perp account (action 7, toPerp=true).
    ///      MUST be a separate block from any order action (funding + action same block fails).
    function fundPerp(bytes32 id, uint256 amount) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.principal && _msgSender() != owner) revert Unauthorized();
        if (amount == 0 || amount > m.deposited) revert InvalidAmount();
        // params: (uint64 usdcNtl, bool toPerp)  — VERIFY encoding
        ICoreWriter(CORE_WRITER).sendRawAction(
            _encode(ACTION_USD_CLASS_TRANSFER, abi.encode(uint64(amount), true))
        );
        emit PerpFunded(id, amount);
    }

    // =====================================================================
    // placeOrder — PRE-TRADE policy check, then the CoreWriter limit-order action
    // =====================================================================
    function placeOrder(
        bytes32 id,
        uint32 asset,
        bool isBuy,
        uint64 px,
        uint64 sz,
        uint8 tif,
        uint64 cloid,
        bytes32 taskId,
        bytes32 reasonHash
    ) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.agent) revert Unauthorized();
        if (m.status != Status.Active) revert NotActive();
        if (m.hasExpiry && _now() >= m.expiresAt) revert Expired();
        if (!_assetAllowed(m, asset)) revert AssetNotAllowed();

        // notional at placement (conservative — Core fills are async)
        uint256 notional = uint256(px) * uint256(sz);
        if (m.hasMaxOrder && notional > m.maxNotionalPerOrder) revert OrderNotionalExceeded();

        // rolling-day cap, SNAP-TO-NOW reset (mirrors Quaestor.sol period logic)
        if (m.hasMaxDay && _now() >= m.dayStart + 86400) {
            m.dayStart = _now();
            m.dayNotionalUsed = 0;
        }
        if (m.hasMaxDay && m.dayNotionalUsed + notional > m.maxNotionalPerDay) revert DayNotionalExceeded();

        // drawdown stop: desk equity must stay at/above the floor pre-trade
        if (m.equityFloor > 0 && _readEquity() < m.equityFloor) revert EquityFloorBreached();

        // effects before the fire-and-forget external action
        if (m.hasMaxDay) m.dayNotionalUsed += notional;

        // params: (uint32 asset, bool isBuy, uint64 px, uint64 sz, bool reduceOnly, uint8 tif, uint128 cloid) — VERIFY
        ICoreWriter(CORE_WRITER).sendRawAction(
            _encode(ACTION_LIMIT_ORDER, abi.encode(asset, isBuy, px, sz, false, tif, uint128(cloid)))
        );

        emit OrderPlaced(id, asset, isBuy, px, sz, notional, taskId, reasonHash);
    }

    // =====================================================================
    // cancel
    // =====================================================================
    function cancel(bytes32 id, uint32 asset, uint64 oidOrCloid, bool byCloid) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.agent) revert Unauthorized();
        if (m.status != Status.Active) revert NotActive();
        uint8 action = byCloid ? ACTION_CANCEL_CLOID : ACTION_CANCEL_OID;
        ICoreWriter(CORE_WRITER).sendRawAction(_encode(action, abi.encode(asset, oidOrCloid)));
        emit OrderCancelled(id, asset, oidOrCloid, byCloid);
    }

    // =====================================================================
    // freeze / revoke (principal or desk owner) — the principal can always stop the agent
    // =====================================================================
    function setStatus(bytes32 id, bool freeze) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.principal && _msgSender() != owner) revert Unauthorized();
        if (m.status == Status.Revoked) revert AlreadyRevoked();
        m.status = freeze ? Status.Frozen : Status.Active;
        emit StatusChanged(id, uint8(m.status));
    }

    function revoke(bytes32 id) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.principal && _msgSender() != owner) revert Unauthorized();
        if (m.status == Status.Revoked) revert AlreadyRevoked();
        m.status = Status.Revoked;
        emit StatusChanged(id, uint8(Status.Revoked));
    }

    // =====================================================================
    // withdraw (principal pulls custodied USDC back)
    // =====================================================================
    function withdraw(bytes32 id, address to, uint256 amount) external {
        DeskMandate storage m = _mandate(id);
        if (_msgSender() != m.principal) revert PrincipalOnly();
        if (amount == 0 || amount > m.deposited) revert InsufficientCustody();
        m.deposited -= amount;
        usdc.safeTransfer(to, amount);
        emit Withdrawn(id, to, amount);
    }

    // =====================================================================
    // Views
    // =====================================================================
    function getMandate(bytes32 id) external view returns (DeskMandate memory) {
        return mandates[id];
    }

    function getMandateKeys() external view returns (bytes32[] memory) {
        return mandateKeys;
    }
}
