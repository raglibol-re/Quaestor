// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {QuaestorDesk} from "../src/QuaestorDesk.sol";

/// @notice Minimal 6-decimal USDC mock with a public mint, for local/testnet demos.
contract MockUSDCDesk is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Deploys the Quaestor trading desk: (Mock)USDC + ERC2771Forwarder + QuaestorDesk.
/// @dev    Run with:
///           forge script script/DeployDesk.s.sol --rpc-url <hyperevm-rpc> --broadcast
///         Env:
///           PRIVATE_KEY  (required) deployer key
///           USDC         (optional) existing USDC on HyperEVM to use instead of a mock
///
///         HyperEVM note: QuaestorDesk is a large contract — enable BIG-BLOCK mode for the
///         deployer first (one-time, via the HyperCore big-block toggle), otherwise the deploy
///         won't fit the small-block gas limit. Precompile/CoreWriter addresses in QuaestorDesk
///         are HyperCore system addresses present only on HyperEVM.
contract DeployDesk is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        address usdc = vm.envOr("USDC", address(0));
        if (usdc == address(0)) {
            MockUSDCDesk mock = new MockUSDCDesk();
            usdc = address(mock);
            console2.log("MockUSDC:", usdc);
        } else {
            console2.log("USDC (existing):", usdc);
        }

        ERC2771Forwarder forwarder = new ERC2771Forwarder("Quaestor Desk Forwarder");
        console2.log("ERC2771Forwarder:", address(forwarder));

        QuaestorDesk desk = new QuaestorDesk(address(forwarder), usdc);
        console2.log("QuaestorDesk:", address(desk));

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("ChainId:", block.chainid);
    }
}
