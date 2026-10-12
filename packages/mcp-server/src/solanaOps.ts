import { availableOf, toBaseUnits } from "@quaestor/sdk";
import { BudgetRejection } from "./chainOps";
import type {
  Attribution,
  ChainOps,
  CreateSubagentParams,
  CreateSubagentResult,
  PayResult,
  ReclaimResult,
  StatusResult,
} from "./chainOps";
import type { AgentContext } from "./context";
import { buildAgentContext } from "./context";
import { friendlyError } from "./errors";
import type { McpConfig } from "./config";
import * as ops from "./operations";

/** Solana implementation of ChainOps — a thin adapter over the existing operations.ts. */
export class SolanaOps implements ChainOps {
  constructor(private readonly ctx: AgentContext) {}

  static fromConfig(config: McpConfig): SolanaOps {
    return new SolanaOps(buildAgentContext(config));
  }

  describe(): string {
    return `solana agent="${this.ctx.config.agent}" (${this.ctx.agentPubkey.toBase58()}) project=${this.ctx.config.project.toBase58()} rpc=${this.ctx.config.rpcUrl}`;
  }

  networkLabel(): string {
    const rpc = (this.ctx.config.rpcUrl || "").toLowerCase();
    if (rpc.includes("mainnet")) return "solana-mainnet";
    if (rpc.includes("testnet")) return "solana-testnet";
    if (rpc.includes("localhost") || rpc.includes("127.0.0.1")) return "solana-localnet";
    return "solana-devnet";
  }

  payerAddress(): string {
    return this.ctx.agentPubkey.toBase58();
  }

  private dbg(m: string) {
    if (process.env.QUAESTOR_DEBUG) console.error(`[op] ${m} @${Date.now()}`);
  }

  async getMyBudget(): Promise<unknown> {
    this.dbg("getMyBudget start");
    const r = await ops.getMyBudget(this.ctx);
    this.dbg("getMyBudget done");
    return r;
  }

  async pay(recipient: string, amountUsdc: string, attribution?: Attribution): Promise<PayResult> {
    try {
      return await ops.pay(this.ctx, recipient, amountUsdc, attribution);
    } catch (e) {
      // Enrich limit violations with the actual numbers (previously done in server.ts).
      let nums;
      try {
        const b = await this.ctx.client.getBudget(this.ctx.agentBudget);
        nums = {
          attempted: toBaseUnits(amountUsdc),
          available: availableOf(b),
          perTxLimit: b.perTxLimit,
          periodLimit: b.periodLimit,
          periodSpent: b.periodSpent,
        };
      } catch {
        /* ignore */
      }
      const message = friendlyError(e, nums);
      if (nums) {
        const limit = nums.perTxLimit ?? nums.periodLimit ?? null;
        throw new BudgetRejection(message, {
          requested: nums.attempted?.toString(),
          available: nums.available?.toString(),
          limit: limit ? limit.toString() : undefined,
        });
      }
      throw new Error(message);
    }
  }

  async createSubagentBudget(p: CreateSubagentParams): Promise<CreateSubagentResult> {
    this.dbg("createSubagentBudget start");
    const r = await ops.createSubagentBudget(this.ctx, p);
    this.dbg("createSubagentBudget done");
    return r;
  }

  async listSubagents(): Promise<unknown> {
    this.dbg("listSubagents start");
    const r = await ops.listSubagents(this.ctx);
    this.dbg("listSubagents done");
    return r;
  }

  freezeSubagent(label: string, freeze: boolean): Promise<StatusResult> {
    return ops.freezeSubagent(this.ctx, label, freeze);
  }

  revokeSubagent(label: string): Promise<StatusResult> {
    return ops.revokeSubagent(this.ctx, label);
  }

  reclaimSubagent(label: string): Promise<ReclaimResult> {
    return ops.reclaimSubagent(this.ctx, label);
  }

  getHistory(limit: number): Promise<unknown> {
    return ops.getHistory(this.ctx, limit);
  }

  toFriendlyError(e: unknown): string {
    return friendlyError(e);
  }
}
