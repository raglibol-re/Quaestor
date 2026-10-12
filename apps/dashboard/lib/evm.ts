import {
  QuaestorEvmClient,
  createPublicClient,
  defineChain,
  http,
} from "@quaestor/evm-sdk";
import type { BudgetNode as EvmBudgetNode, PublicClient } from "@quaestor/evm-sdk";
import { EVM } from "./config";

export type { EvmBudgetNode };

/** Read-only EVM client for the configured chain/contract. */
export function evmReadClient(): QuaestorEvmClient {
  const chain = defineChain({
    id: EVM.chainId,
    name: EVM.label,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [EVM.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(EVM.rpcUrl) }) as PublicClient;
  // forwarder isn't used for reads; pass the contract address as a harmless placeholder.
  return new QuaestorEvmClient({
    publicClient,
    contract: EVM.contract,
    forwarder: EVM.contract,
    chainId: EVM.chainId,
  });
}

/** Fetch the configured EVM project's budget tree (root node), or null. */
export function fetchEvmTree(): Promise<EvmBudgetNode | null> {
  return evmReadClient().fetchBudgetTree(EVM.project);
}

export function shortHex(addr: string, n = 6): string {
  return addr.length > 2 * n ? `${addr.slice(0, n)}…${addr.slice(-4)}` : addr;
}
