import type { ChainOps } from "./chainOps";
import { chainKind, loadMcpConfig } from "./config";
import type { DeskOps } from "./deskOps";
import { SolanaOps } from "./solanaOps";

/**
 * The backend selected by `QUAESTOR_CHAIN`, as a discriminated union:
 *   - `budget` — the hierarchical-budget backend (solana | tempo | base) behind the 8 budget tools.
 *   - `desk`   — the Hyperliquid trading-desk backend (hyperliquid) behind the desk tools.
 */
export type BuiltOps =
  | { kind: "budget"; ops: ChainOps }
  | { kind: "desk"; desk: DeskOps };

/**
 * Build the backend selected by `QUAESTOR_CHAIN`. Solana is the default; the EVM backends
 * (tempo/base budget, hyperliquid desk) are loaded lazily so the Solana path never imports
 * viem/evm-sdk.
 */
export async function buildOps(): Promise<BuiltOps> {
  const chain = chainKind();
  if (chain === "solana") {
    return { kind: "budget", ops: await SolanaOps.fromConfig(loadMcpConfig()) };
  }
  if (chain === "hyperliquid") {
    const { buildDeskOps } = await import("./deskOps.js");
    return { kind: "desk", desk: await buildDeskOps() };
  }
  // EVM budget chains (tempo | base)
  const { buildEvmOps } = await import("./evmOps.js");
  return { kind: "budget", ops: await buildEvmOps(chain) };
}
