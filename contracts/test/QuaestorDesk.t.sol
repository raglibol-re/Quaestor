// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {QuaestorDesk} from "../src/QuaestorDesk.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Minimal 6-decimal ERC20 (SafeERC20-compatible: returns bool) for the desk's USDC custody.
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// Records CoreWriter actions; installed at the fixed CORE_WRITER address via vm.etch.
contract MockCoreWriter {
    uint256 public calls;
    bytes public lastAction;

    function sendRawAction(bytes calldata data) external {
        calls += 1;
        lastAction = data;
    }
}

contract QuaestorDeskTest is Test {
    QuaestorDesk desk;
    MockUSDC usdc;

    address owner = makeAddr("owner");
    address principal = makeAddr("principal");
    address agent = makeAddr("agent");
    address forwarder = makeAddr("forwarder");

    uint32 constant BTC = 0;
    uint32 constant ETH = 1;
    uint32 constant SOL = 5;

    bytes32 id;

    function _assets(uint32 a) internal pure returns (uint32[] memory arr) {
        arr = new uint32[](1);
        arr[0] = a;
    }

    function _assets2(uint32 a, uint32 b) internal pure returns (uint32[] memory arr) {
        arr = new uint32[](2);
        arr[0] = a;
        arr[1] = b;
    }

    function _mockEquity(uint256 equity) internal {
        vm.mockCall(
            desk.L1_READ_PERP_EQUITY(), abi.encode(address(desk)), abi.encode(uint256(equity))
        );
    }

    function setUp() public {
        vm.prank(owner);
        usdc = new MockUSDC();
        vm.prank(owner);
        desk = new QuaestorDesk(forwarder, address(usdc));

        // install the mock CoreWriter at the fixed system address
        MockCoreWriter mock = new MockCoreWriter();
        vm.etch(desk.CORE_WRITER(), address(mock).code);

        // default: plenty of equity
        _mockEquity(1_000_000e6);

        // principal creates a mandate for the agent: BTC+ETH, 10k/order, 50k/day, 100k equity floor
        vm.prank(principal);
        id = desk.createMandate(agent, _assets2(BTC, ETH), true, 10_000e6, true, 50_000e6, 100_000e6, false, 0);

        // fund custody
        usdc.mint(principal, 1_000_000e6);
        vm.prank(principal);
        usdc.approve(address(desk), type(uint256).max);
        vm.prank(principal);
        desk.deposit(id, 100_000e6);
    }

    function _place(uint32 asset, uint64 px, uint64 sz) internal {
        vm.prank(agent);
        desk.placeOrder(id, asset, true, px, sz, 0, 1, bytes32(0), bytes32(0));
    }

    function test_CreateAndDeposit() public view {
        QuaestorDesk.DeskMandate memory m = desk.getMandate(id);
        assertEq(m.principal, principal);
        assertEq(m.agent, agent);
        assertEq(m.deposited, 100_000e6);
        assertEq(uint8(m.status), 0);
        assertEq(usdc.balanceOf(address(desk)), 100_000e6);
    }

    function test_PlaceOrder_Happy() public {
        // notional = 100 * 50 = 5000e6  (within 10k/order, 50k/day, equity ok)
        _place(BTC, 100e6, 50);
        assertEq(MockCoreWriter(desk.CORE_WRITER()).calls(), 1, "CoreWriter action sent");
        QuaestorDesk.DeskMandate memory m = desk.getMandate(id);
        assertEq(m.dayNotionalUsed, 5000e6);
    }

    function test_AssetNotAllowed_Reverts() public {
        vm.prank(agent);
        vm.expectRevert(QuaestorDesk.AssetNotAllowed.selector);
        desk.placeOrder(id, SOL, true, 100e6, 50, 0, 1, bytes32(0), bytes32(0));
    }

    function test_PerOrderNotional_Reverts() public {
        // 100 * 200 = 20000e6 > 10k/order
        vm.prank(agent);
        vm.expectRevert(QuaestorDesk.OrderNotionalExceeded.selector);
        desk.placeOrder(id, BTC, true, 100e6, 200, 0, 1, bytes32(0), bytes32(0));
    }

    function test_PerDayNotional_Reverts_ThenResets() public {
        _place(BTC, 100e6, 90); // 9000e6
        _place(ETH, 100e6, 90); // 18000e6
        _place(BTC, 100e6, 90); // 27000e6
        _place(ETH, 100e6, 90); // 36000e6
        _place(BTC, 100e6, 90); // 45000e6  (cum 45k <= 50k)
        vm.prank(agent); // next 9000 -> 54k > 50k/day
        vm.expectRevert(QuaestorDesk.DayNotionalExceeded.selector);
        desk.placeOrder(id, BTC, true, 100e6, 90, 0, 1, bytes32(0), bytes32(0));

        // snap-to-now reset after 24h+
        vm.warp(block.timestamp + 86401);
        _place(BTC, 100e6, 90); // succeeds in the fresh window
        QuaestorDesk.DeskMandate memory m = desk.getMandate(id);
        assertEq(m.dayNotionalUsed, 9000e6);
    }

    function test_EquityFloorBreach_Reverts() public {
        _mockEquity(50_000e6); // below the 100k floor
        vm.prank(agent);
        vm.expectRevert(QuaestorDesk.EquityFloorBreached.selector);
        desk.placeOrder(id, BTC, true, 100e6, 50, 0, 1, bytes32(0), bytes32(0));
    }

    function test_Freeze_BlocksOrders() public {
        vm.prank(principal);
        desk.setStatus(id, true);
        vm.prank(agent);
        vm.expectRevert(QuaestorDesk.NotActive.selector);
        desk.placeOrder(id, BTC, true, 100e6, 50, 0, 1, bytes32(0), bytes32(0));
    }

    function test_Expiry_Reverts() public {
        vm.prank(principal);
        bytes32 id2 = desk.createMandate(
            makeAddr("agent2"), _assets(BTC), false, 0, false, 0, 0, true, int64(uint64(block.timestamp + 3600))
        );
        vm.warp(block.timestamp + 3601);
        vm.prank(makeAddr("agent2"));
        vm.expectRevert(QuaestorDesk.Expired.selector);
        desk.placeOrder(id2, BTC, true, 100e6, 50, 0, 1, bytes32(0), bytes32(0));
    }

    function test_OnlyAgentCanPlace() public {
        vm.prank(principal);
        vm.expectRevert(QuaestorDesk.Unauthorized.selector);
        desk.placeOrder(id, BTC, true, 100e6, 50, 0, 1, bytes32(0), bytes32(0));
    }

    function test_Cancel_And_Withdraw() public {
        vm.prank(agent);
        desk.cancel(id, BTC, 123, false);
        vm.prank(principal);
        desk.withdraw(id, principal, 40_000e6);
        assertEq(desk.getMandate(id).deposited, 60_000e6);
        assertEq(usdc.balanceOf(address(desk)), 60_000e6);
    }

    function test_OrderPlaced_EmitsAttribution() public {
        bytes32 task = keccak256("alpha-scan-7");
        bytes32 rhash = keccak256("long BTC on breakout");
        vm.expectEmit(true, false, false, true, address(desk));
        emit QuaestorDesk.OrderPlaced(id, BTC, true, 100e6, 50, 5000e6, task, rhash);
        vm.prank(agent);
        desk.placeOrder(id, BTC, true, 100e6, 50, 0, 1, task, rhash);
    }
}

/// -------------------------------------------------------------------------
/// Invariant: day-notional never exceeds the cap; USDC custody is conserved.
/// -------------------------------------------------------------------------
contract DeskHandler is Test {
    QuaestorDesk public desk;
    MockUSDC public usdc;
    address public principal = makeAddr("h_principal");
    address public agent = makeAddr("h_agent");
    bytes32 public id;

    constructor(QuaestorDesk d, MockUSDC u, bytes32 id_) {
        desk = d;
        usdc = u;
        id = id_;
    }

    function hdl_deposit(uint256 amt) external {
        amt = bound(amt, 1, 1_000_000e6);
        usdc.mint(principal, amt);
        vm.startPrank(principal);
        usdc.approve(address(desk), amt);
        try desk.deposit(id, amt) {} catch {}
        vm.stopPrank();
    }

    function hdl_place(uint256 pxSeed, uint256 szSeed) external {
        uint64 px = uint64(bound(pxSeed, 1, 1_000e6));
        uint64 sz = uint64(bound(szSeed, 1, 1_000));
        vm.prank(agent);
        try desk.placeOrder(id, 0, true, px, sz, 0, 1, bytes32(0), bytes32(0)) {} catch {}
    }

    function hdl_cancel(uint256 oidSeed) external {
        vm.prank(agent);
        try desk.cancel(id, 0, uint64(bound(oidSeed, 1, 1e9)), false) {} catch {}
    }

    function hdl_freeze(bool f) external {
        vm.prank(principal);
        try desk.setStatus(id, f) {} catch {}
    }

    function hdl_withdraw(uint256 amt) external {
        vm.prank(principal);
        try desk.withdraw(id, principal, bound(amt, 1, 1_000_000e6)) {} catch {}
    }
}

contract QuaestorDeskInvariantTest is StdInvariant, Test {
    QuaestorDesk desk;
    MockUSDC usdc;
    DeskHandler handler;
    bytes32 id;

    address owner = makeAddr("inv_owner");
    address forwarder = makeAddr("inv_forwarder");
    address principal = makeAddr("h_principal");
    address agent = makeAddr("h_agent");

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(owner);
        desk = new QuaestorDesk(forwarder, address(usdc));
        // high equity; day cap 50k/day, no per-order cap
        vm.mockCall(desk.L1_READ_PERP_EQUITY(), abi.encode(address(desk)), abi.encode(uint256(1_000_000e6)));
        MockCoreWriter mock = new MockCoreWriter();
        vm.etch(desk.CORE_WRITER(), address(mock).code);

        uint32[] memory a = new uint32[](1);
        a[0] = 0;
        vm.prank(principal);
        id = desk.createMandate(agent, a, false, 0, true, 50_000e6, 0, false, 0);

        handler = new DeskHandler(desk, usdc, id);
        bytes4[] memory sel = new bytes4[](5);
        sel[0] = DeskHandler.hdl_deposit.selector;
        sel[1] = DeskHandler.hdl_place.selector;
        sel[2] = DeskHandler.hdl_cancel.selector;
        sel[3] = DeskHandler.hdl_freeze.selector;
        sel[4] = DeskHandler.hdl_withdraw.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sel}));
        targetContract(address(handler));
    }

    /// day notional never exceeds the cap, and custodied USDC equals the mandate's deposited balance.
    function invariant_DayCapAndCustody() public view {
        QuaestorDesk.DeskMandate memory m = desk.getMandate(id);
        assertLe(m.dayNotionalUsed, m.maxNotionalPerDay);
        assertEq(usdc.balanceOf(address(desk)), m.deposited);
    }
}
