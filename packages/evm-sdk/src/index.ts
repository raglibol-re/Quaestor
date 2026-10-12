// Quaestor EVM SDK — viem-based client for the on-chain hierarchical budget contract.
export * from "./abi/quaestor";
export * from "./abi/quaestorDesk";
export * from "./keys";
export * from "./tree";
export * from "./client";
export * from "./deskClient";

// Convenience re-exports of the viem primitives downstream scripts need, so they can
// resolve everything through this package without a direct viem dependency of their own.
export {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getAddress,
  zeroAddress,
  isHex,
  parseUnits,
  formatUnits,
  keccak256,
  encodeFunctionData,
} from "viem";
export type { Address, Hex, PublicClient, WalletClient, LocalAccount, Chain } from "viem";
export { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
