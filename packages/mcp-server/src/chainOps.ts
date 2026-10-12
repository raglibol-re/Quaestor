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

/** Spend attribution: a task id + a plaintext reason (hashed on-chain, plaintext off-chain). */
export interface Attribution {
  taskId?: string;
  reason?: string;
}

export interface PayResult {
  signature: string;
  recipient: string;
  amount: string;
  taskId?: string;
  reason?: string;
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
  /**
   * x402 network label for this backend (e.g. "base-sepolia", "tempo-testnet",
   * "solana-devnet", "anvil"). Used to match an x402 402-response `accepts` entry.
   */
  networkLabel(): string;
  /** This agent's own address (the x402 payer), as a chain-native string. */
  payerAddress(): string;
  getMyBudget(): Promise<unknown>;
  pay(recipient: string, amountUsdc: string, attribution?: Attribution): Promise<PayResult>;
  createSubagentBudget(p: CreateSubagentParams): Promise<CreateSubagentResult>;
  listSubagents(): Promise<unknown>;
  freezeSubagent(label: string, freeze: boolean): Promise<StatusResult>;
  revokeSubagent(label: string): Promise<StatusResult>;
  reclaimSubagent(label: string): Promise<ReclaimResult>;
  getHistory(limit: number): Promise<unknown>;
  /** Turn a raw chain error into a human-readable message for the tool result. */
  toFriendlyError(e: unknown): string;
}

/**
 * The numbers behind a budget-limit refusal, as base-unit integer strings
 * (6-dp USDC) so the brand text surface can render aligned requested/available/
 * limit rows (see brand/README.md "plain-text tool results").
 */
export interface RejectionDetails {
  requested?: string;
  available?: string;
  limit?: string;
}

/**
 * Thrown by a backend when a spend is rejected onchain and the governing
 * numbers are known. `message` stays the same human string `toFriendlyError`
 * would produce (so existing callers are unaffected); `details` carries the
 * numbers for the richer brand rendering.
 */
export class BudgetRejection extends Error {
  constructor(
    message: string,
    readonly details: RejectionDetails = {}
  ) {
    super(message);
    this.name = "BudgetRejection";
  }
}
