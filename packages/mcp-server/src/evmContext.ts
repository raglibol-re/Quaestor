import {
  QuaestorEvmClient,
  budgetKeyOf,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  privateKeyToAccount,
} from "@quaestor/evm-sdk";
import type { Hex, LocalAccount, PublicClient, WalletClient } from "@quaestor/evm-sdk";
import type { EvmConfig } from "./config";
import { loadEvmAgent } from "./evmKeystore";

export interface EvmContext {
  config: EvmConfig;
  client: QuaestorEvmClient;
  publicClient: PublicClient;
  relayerWalletClient: WalletClient;
  agentAccount: LocalAccount;
  agentBudgetKey: Hex;
  projectKey: Hex;
}

/** Build the EVM runtime context: viem clients, the agent account, and its budget key. */
export function buildEvmContext(config: EvmConfig): EvmContext {
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

  const client = new QuaestorEvmClient({
    publicClient,
    contract: config.contract,
    forwarder: config.forwarder,
    chainId: config.chainId,
  });

  const agentBudgetKey = budgetKeyOf(config.projectKey, agentAccount.address);

  return {
    config,
    client,
    publicClient,
    relayerWalletClient,
    agentAccount,
    agentBudgetKey,
    projectKey: config.projectKey,
  };
}
