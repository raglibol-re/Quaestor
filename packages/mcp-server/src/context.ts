import { Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, findBudgetPda } from "@quaestor/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { McpConfig } from "./config";
import { LocalKeystoreSolanaSigner, type SolanaAgentSigner } from "./signer";
import { PollingProvider } from "./provider";

export interface AgentContext {
  config: McpConfig;
  connection: Connection;
  client: QuaestorClient;
  agentKeypair: Keypair;
  agentPubkey: PublicKey;
  agentBudget: PublicKey;
}

/**
 * Build the runtime context: relayer-funded provider + the agent's keypair/budget. The agent key
 * comes from `signer` (its custody is pluggable); stdio defaults to the local keystore, so behavior
 * is unchanged. The remote host passes an InjectedKeypairSigner (envelope-decrypted KMS key).
 */
export async function buildAgentContext(
  config: McpConfig,
  signer?: SolanaAgentSigner
): Promise<AgentContext> {
  const connection = new Connection(config.rpcUrl, "confirmed");
  // The relayer is the fee payer / provider wallet; the agent co-signs as authority.
  // PollingProvider confirms via getSignatureStatuses (no websocket) so tool calls never hang.
  const provider = new PollingProvider(connection, new Wallet(config.relayer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const client = QuaestorClient.fromProvider(provider);
  const agentKeypair = await (signer ?? new LocalKeystoreSolanaSigner(config.agent, config.passphrase)).keypair();
  const [agentBudget] = findBudgetPda(config.project, agentKeypair.publicKey);
  return {
    config,
    connection,
    client,
    agentKeypair,
    agentPubkey: agentKeypair.publicKey,
    agentBudget,
  };
}
