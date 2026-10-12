import type { ChainOps } from "./chainOps";
import { chainKind, loadMcpConfig } from "./config";
import { SolanaOps } from "./solanaOps";

/**
 * Build the ChainOps backend selected by `QUAESTOR_CHAIN`. Solana is the default; the EVM
 * backends (tempo/base) are loaded lazily so the Solana path never imports viem/evm-sdk.
 */
export async function buildChainOps(): Promise<ChainOps> {
  const chain = chainKind();
  if (chain === "solana") {
    return SolanaOps.fromConfig(loadMcpConfig());
  }
  // EVM chains (tempo | base)
  const { buildEvmOps } = await import("./evmOps.js");
  return buildEvmOps(chain);
}
