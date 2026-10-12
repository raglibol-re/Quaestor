export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/** Optional default project (base58) so the dashboard loads a tree out of the box. */
export const DEMO_PROJECT = process.env.NEXT_PUBLIC_DEMO_PROJECT || "";

export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || "devnet";

export function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}
export function explorerAddress(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=${CLUSTER}`;
}

// --- EVM chain (optional; the "EVM" tab appears only when these are set) ---

export const EVM = {
  rpcUrl: process.env.NEXT_PUBLIC_EVM_RPC_URL || "",
  contract: (process.env.NEXT_PUBLIC_EVM_CONTRACT || "") as `0x${string}`,
  chainId: Number(process.env.NEXT_PUBLIC_EVM_CHAIN_ID || "0"),
  /** The project key (bytes32) to load — keccak256(abi.encode(owner, projectId)). */
  project: (process.env.NEXT_PUBLIC_EVM_PROJECT || "") as `0x${string}`,
  explorer: process.env.NEXT_PUBLIC_EVM_EXPLORER || "",
  label: process.env.NEXT_PUBLIC_EVM_LABEL || "EVM",
};

/** EVM support is enabled only when an RPC, contract, and project key are configured. */
export const EVM_ENABLED = Boolean(EVM.rpcUrl && EVM.contract && EVM.project);

export function evmExplorerAddress(addr: string): string {
  return EVM.explorer ? `${EVM.explorer.replace(/\/$/, "")}/address/${addr}` : "#";
}
export function evmExplorerTx(hash: string): string {
  return EVM.explorer ? `${EVM.explorer.replace(/\/$/, "")}/tx/${hash}` : "#";
}
