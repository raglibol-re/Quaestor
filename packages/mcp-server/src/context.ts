import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, findBudgetPda } from "@quaestor/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { McpConfig } from "./config";
import { loadAgent } from "./keystore";

export interface AgentContext {
  config: McpConfig;
  connection: Connection;
  client: QuaestorClient;
  agentKeypair: Keypair;
  agentPubkey: PublicKey;
  agentBudget: PublicKey;
}

/** Build the runtime context: relayer-funded provider + the agent's keypair/budget. */
export function buildAgentContext(config: McpConfig): AgentContext {
  const connection = new Connection(config.rpcUrl, "confirmed");
  // The relayer is the fee payer / provider wallet; the agent co-signs as authority.
  const provider = new AnchorProvider(connection, new Wallet(config.relayer), {
    commitment: "confirmed",
  });
  const client = QuaestorClient.fromProvider(provider);
  const agentKeypair = loadAgent(config.agent, config.passphrase);
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
