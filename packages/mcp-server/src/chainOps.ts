/**
 * Chain-agnostic operations interface behind the 8 MCP tools. Each concrete implementation
 * (SolanaOps, EvmOps) holds its own chain context and returns plain, chain-neutral results
 * (string addresses, decimal-USDC amounts). The MCP server (`server.ts`) talks only to this
 * interface, so a `QUAESTOR_CHAIN` switch picks the backend without touching tool definitions.
 */

export interface CreateSubagentParams {
  label: string;
  amountUsdc: string;
  perTxLimitUsdc?: string;
  dailyLimitUsdc?: string;
  canDelegate?: boolean;
  expiresInHours?: number;
  allowlist?: string[];
}

export interface PayResult {
  signature: string;
  recipient: string;
  amount: string;
}

export interface CreateSubagentResult {
  signature: string;
  agentName: string;
  agentPubkey: string;
  budget: string;
  configSnippet: string;
}

export interface StatusResult {
  signature: string;
  label: string;
  status: string;
}

export interface ReclaimResult {
  signature: string;
  label: string;
  reclaimed: string;
}

export interface ChainOps {
  /** One-line description for the startup log (e.g. "solana agent <pubkey>"). */
  describe(): string;
  getMyBudget(): Promise<unknown>;
  pay(recipient: string, amountUsdc: string): Promise<PayResult>;
  createSubagentBudget(p: CreateSubagentParams): Promise<CreateSubagentResult>;
  listSubagents(): Promise<unknown>;
  freezeSubagent(label: string, freeze: boolean): Promise<StatusResult>;
  revokeSubagent(label: string): Promise<StatusResult>;
  reclaimSubagent(label: string): Promise<ReclaimResult>;
  getHistory(limit: number): Promise<unknown>;
  /** Turn a raw chain error into a human-readable message for the tool result. */
  toFriendlyError(e: unknown): string;
}
