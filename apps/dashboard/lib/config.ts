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
