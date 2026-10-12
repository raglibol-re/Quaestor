import {
  QuaestorDeskClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  privateKeyToAccount,
} from "@quaestor/evm-sdk";
import type { Hex, LocalAccount, PublicClient, WalletClient } from "@quaestor/evm-sdk";
import type { DeskConfig } from "./config";
import { loadEvmAgent } from "./evmKeystore";

export interface DeskContext {
  config: DeskConfig;
  client: QuaestorDeskClient;
  publicClient: PublicClient;
  relayerWalletClient: WalletClient;
  agentAccount: LocalAccount;
  /** The mandate id this agent trades under. */
  mandateId: Hex;
}

/** Build the Hyperliquid desk runtime context: viem clients, the agent account, and its mandate id. */
export function buildDeskContext(config: DeskConfig): DeskContext {
  const chain = defineChain({
    id: config.chainId,
    name: config.chain,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient;

  const relayerAccount = privateKeyToAccount(config.relayerKey);
  const relayerWalletClient = createWalletClient({
    account: relayerAccount,
    chain,
    transport: http(config.rpcUrl),
  });

  // The agent's private key is decrypted here and never leaves the process (never returned by a tool).
  const { privateKey } = loadEvmAgent(config.agent, config.passphrase);
  const agentAccount = privateKeyToAccount(privateKey);

  const client = new QuaestorDeskClient({
    deskContract: config.deskContract,
    forwarder: config.forwarder,
    chainId: config.chainId,
    publicClient,
  });

  return {
    config,
    client,
    publicClient,
    relayerWalletClient,
    agentAccount,
    mandateId: config.mandateId,
  };
}
