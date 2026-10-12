// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Quaestor} from "../src/Quaestor.sol";

/// @notice Minimal 6-decimal USDC mock with a public mint, for local/testnet demos.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Deploys the Quaestor stack: (Mock)USDC + ERC2771Forwarder + Quaestor.
/// @dev    Run with:
///         forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast
///         Env:
///           PRIVATE_KEY  (required) deployer key
///           USDC         (optional) existing ERC-20 to use instead of deploying a mock
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // Use an existing USDC if provided (real testnets), else deploy a mock.
        address usdc = vm.envOr("USDC", address(0));
        if (usdc == address(0)) {
            MockUSDC mock = new MockUSDC();
            usdc = address(mock);
            console2.log("MockUSDC:", usdc);
        } else {
            console2.log("USDC (existing):", usdc);
        }

        ERC2771Forwarder forwarder = new ERC2771Forwarder("Quaestor Forwarder");
        console2.log("ERC2771Forwarder:", address(forwarder));

        Quaestor quaestor = new Quaestor(address(forwarder));
        console2.log("Quaestor:", address(quaestor));

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("ChainId:", block.chainid);
    }
}
