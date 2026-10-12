import {
  QUAESTOR_ABI,
  availableOf,
  budgetKeyOf,
  decodeLabel,
  fromBaseUnits,
  getAddress,
  statusName,
  toBaseUnits,
} from "@quaestor/evm-sdk";
import type { Address, Hex } from "@quaestor/evm-sdk";
import type {
  ChainOps,
  CreateSubagentParams,
  CreateSubagentResult,
  PayResult,
  ReclaimResult,
  StatusResult,
} from "./chainOps";
import { loadEvmConfig, type ChainKind } from "./config";
import { buildEvmContext, type EvmContext } from "./evmContext";
import { createEvmAgent } from "./evmKeystore";
import { hasAgent } from "./keystore";

/** Quaestor custom-error name -> human message (mirrors the Solana friendly messages). */
const EVM_ERR: Record<string, string> = {
  PerTxLimitExceeded: "Amount exceeds the per-transaction limit.",
  PeriodLimitExceeded: "Amount exceeds the period (e.g. daily) limit.",
  InsufficientAvailable: "Insufficient mandate balance available.",
  AncestorNotActive: "A parent mandate in the chain is frozen, revoked, or expired.",
  NotActive: "This mandate is not active (frozen or revoked).",
  Expired: "This mandate has expired.",
  RecipientNotAllowed: "Recipient is not in the allowlist.",
  AllowlistNotSubset: "Sub-mandate allowlist must be a subset of this mandate's allowlist.",
  NotAnAncestor: "You are not an ancestor of that mandate.",
  OwnerOnly: "Only the project owner may do this.",
  Unauthorized: "Unauthorized: you are not the required agent or owner.",
  CannotDelegate: "This mandate is not allowed to create sub-mandates.",
  LimitTooLoose: "A sub-mandate limit is looser than this mandate's limit.",
  ExpiryTooLate: "A sub-mandate expiry is later than this mandate's expiry.",
  MaxDepthExceeded: "Maximum tree depth (4) reached.",
  MaxChildDepthExceeded: "Depth exceeds the allowed sub-tree depth.",
  NotReclaimable: "Not reclaimable: the sub-mandate must be revoked or expired first.",
  HasReservedChildren: "Sub-mandate still has funds reserved for its own children (reclaim those first).",
  AlreadyRevoked: "Mandate is already revoked.",
  InvalidAmount: "Amount must be greater than zero.",
  AlreadyExists: "That mandate already exists.",
};

/** EVM implementation of ChainOps (tempo | base) over @quaestor/evm-sdk. */
export class EvmOps implements ChainOps {
  constructor(private readonly ctx: EvmContext) {}

  describe(): string {
    return `evm(${this.ctx.config.chain}) agent="${this.ctx.config.agent}" (${this.ctx.agentAccount.address}) contract=${this.ctx.config.contract} rpc=${this.ctx.config.rpcUrl}`;
  }

  networkLabel(): string {
    const { chain, chainId } = this.ctx.config;
    if (chainId === 31337) return "anvil"; // local anvil default chain id
    if (chain === "base") return "base-sepolia";
    if (chain === "tempo") return "tempo-testnet";
    return "anvil";
  }

  payerAddress(): string {
    return this.ctx.agentAccount.address;
  }

  /**
   * Simulate the inner Quaestor call (msg.sender = agent) against the Quaestor ABI so on-chain
   * reverts surface as clean, decodable custom errors — instead of the opaque data a reverted
   * forwarder.execute would otherwise bubble. Called before forwarding a gasless write.
   */
  private async preflight(fn: string, args: readonly unknown[]): Promise<void> {
    // Typed loosely: viem wants a literal function name, but this is a generic fire-and-throw
    // preflight (the on-chain revert, if any, is what we care about).
    await (this.ctx.publicClient.simulateContract as (opts: unknown) => Promise<unknown>)({
      address: this.ctx.config.contract,
      abi: QUAESTOR_ABI,
      functionName: fn,
      args,
      account: this.ctx.agentAccount.address,
    });
  }

  async getMyBudget(): Promise<unknown> {
    const b = await this.ctx.client.getBudget(this.ctx.agentBudgetKey);
    return {
      label: decodeLabel(b.label),
      agent: this.ctx.agentAccount.address,
      budget: this.ctx.agentBudgetKey,
      chain: this.ctx.config.chain,
      status: statusName(b.status),
      depth: b.depth,
      canDelegate: b.canDelegate,
      allocated: fromBaseUnits(b.allocated),
      spent: fromBaseUnits(b.spent),
      reservedForChildren: fromBaseUnits(b.reservedForChildren),
      available: fromBaseUnits(availableOf(b)),
      perTxLimit: b.hasPerTxLimit ? fromBaseUnits(b.perTxLimit) : null,
      dailyLimit: b.hasPeriodLimit ? fromBaseUnits(b.periodLimit) : null,
      periodSpent: b.hasPeriodLimit ? fromBaseUnits(b.periodSpent) : null,
      expiresAt: b.hasExpiry ? Number(b.expiresAt) : null,
    };
  }

  async pay(recipient: string, amountUsdc: string): Promise<PayResult> {
    const to = getAddress(recipient);
    const amount = toBaseUnits(amountUsdc);
    await this.preflight("spend", [this.ctx.agentBudgetKey, to, amount]);
    const hash = await this.ctx.client.spendForwarded({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      budgetKey: this.ctx.agentBudgetKey,
      recipient: to,
      amount,
    });
    return { signature: hash, recipient: to, amount: amountUsdc };
  }

  async createSubagentBudget(p: CreateSubagentParams): Promise<CreateSubagentResult> {
    const slug =
      p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
    let name = `${this.ctx.config.agent}.${slug}`;
    let i = 1;
    while (hasAgent(name)) name = `${this.ctx.config.agent}.${slug}-${i++}`;
    const child = createEvmAgent(name, this.ctx.config.passphrase);

    const daily = p.dailyLimitUsdc ? toBaseUnits(p.dailyLimitUsdc) : undefined;
    const allocArgs = {
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      parentKey: this.ctx.agentBudgetKey,
      childAgent: child.address,
      label: p.label,
      amount: toBaseUnits(p.amountUsdc),
      perTx: p.perTxLimitUsdc ? toBaseUnits(p.perTxLimitUsdc) : undefined,
      period: daily,
      periodSeconds: daily ? 86400 : 0,
      expiresAt: p.expiresInHours
        ? Math.floor(Date.now() / 1000) + Math.floor(p.expiresInHours * 3600)
        : undefined,
      canDelegate: p.canDelegate ?? false,
      allowlist: (p.allowlist ?? []).map((a) => getAddress(a)),
    };
    const hash = await this.ctx.client.allocateChildForwarded(allocArgs);
    const childBudget = budgetKeyOf(this.ctx.projectKey, child.address);
    return {
      signature: hash,
      agentName: name,
      agentPubkey: child.address,
      budget: childBudget,
      configSnippet: this.configSnippet(name),
    };
  }

  async listSubagents(): Promise<unknown> {
    const children = await this.childrenOf(this.ctx.agentBudgetKey);
    return children.map(({ key, b }) => ({
      label: decodeLabel(b.label),
      budget: key,
      agent: b.agent,
      status: statusName(b.status),
      allocated: fromBaseUnits(b.allocated),
      spent: fromBaseUnits(b.spent),
      available: fromBaseUnits(availableOf(b)),
      perTxLimit: b.hasPerTxLimit ? fromBaseUnits(b.perTxLimit) : null,
      dailyLimit: b.hasPeriodLimit ? fromBaseUnits(b.periodLimit) : null,
    }));
  }

  async freezeSubagent(label: string, freeze: boolean): Promise<StatusResult> {
    const child = await this.findChild(label);
    await this.preflight("agentSetStatus", [child.key, freeze]);
    const hash = await this.ctx.client.agentSetStatusForwarded({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      budgetKey: child.key,
      freeze,
    });
    return { signature: hash, label, status: freeze ? "frozen" : "active" };
  }

  async revokeSubagent(label: string): Promise<StatusResult> {
    const child = await this.findChild(label);
    await this.preflight("revoke", [child.key]);
    const hash = await this.ctx.client.forward({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      fn: "revoke",
      args: [child.key],
    });
    return { signature: hash, label, status: "revoked" };
  }

  async reclaimSubagent(label: string): Promise<ReclaimResult> {
    const child = await this.findChild(label);
    const unused = child.b.allocated - child.b.spent;
    await this.preflight("reclaim", [this.ctx.agentBudgetKey, child.key]);
    const hash = await this.ctx.client.forward({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      fn: "reclaim",
      args: [this.ctx.agentBudgetKey, child.key],
    });
    return { signature: hash, label, reclaimed: fromBaseUnits(unused) };
  }

  async getHistory(limit: number): Promise<unknown> {
    const latest = await this.ctx.publicClient.getBlockNumber();
    const fromBlock = latest > 50_000n ? latest - 50_000n : 0n;
    const logs = await this.ctx.publicClient.getContractEvents({
      address: this.ctx.config.contract,
      abi: QUAESTOR_ABI,
      eventName: "Spent",
      args: { project: this.ctx.projectKey },
      fromBlock,
      toBlock: "latest",
    });
    return logs
      .filter((l) => (l.args as { budget?: Hex }).budget?.toLowerCase() === this.ctx.agentBudgetKey.toLowerCase())
      .slice(-limit)
      .reverse()
      .map((l) => {
        const a = l.args as { recipient?: Address; amount?: bigint };
        return {
          tx: l.transactionHash,
          block: Number(l.blockNumber),
          recipient: a.recipient,
          amount: a.amount != null ? fromBaseUnits(a.amount) : null,
        };
      });
  }

  toFriendlyError(e: unknown): string {
    const err = e as {
      shortMessage?: string;
      message?: string;
      cause?: { data?: { errorName?: string }; cause?: { data?: { errorName?: string } } };
      data?: { errorName?: string };
    };
    const name =
      err?.cause?.data?.errorName ??
      err?.data?.errorName ??
      err?.cause?.cause?.data?.errorName;
    if (name && EVM_ERR[name]) return EVM_ERR[name];

    const msg = err?.shortMessage ?? err?.message ?? String(e);
    for (const [n, f] of Object.entries(EVM_ERR)) {
      if (String(msg).includes(n)) return f;
    }
    return String(msg).split("\n")[0];
  }

  // ---- helpers ----

  private async childrenOf(parentKey: Hex) {
    const keys = await this.ctx.client.getProjectBudgetKeys(this.ctx.projectKey);
    const budgets = await Promise.all(keys.map((k) => this.ctx.client.getBudget(k)));
    return keys
      .map((key, i) => ({ key, b: budgets[i] }))
      .filter((x) => x.b.parent.toLowerCase() === parentKey.toLowerCase());
  }

  private async findChild(label: string) {
    const children = await this.childrenOf(this.ctx.agentBudgetKey);
    const match = children.find((c) => decodeLabel(c.b.label) === label);
    if (!match) throw new Error(`no sub-agent labelled '${label}'`);
    return match;
  }

  private configSnippet(name: string): string {
    const c = this.ctx.config;
    return JSON.stringify(
      {
        mcpServers: {
          quaestor: {
            command: "node",
            args: ["packages/mcp-server/dist/server.js"],
            env: {
              QUAESTOR_CHAIN: c.chain,
              QUAESTOR_EVM_RPC_URL: c.rpcUrl,
              QUAESTOR_CONTRACT: c.contract,
              QUAESTOR_FORWARDER: c.forwarder,
              QUAESTOR_CHAIN_ID: String(c.chainId),
              QUAESTOR_EVM_PROJECT: c.projectKey,
              QUAESTOR_AGENT: name,
              QUAESTOR_KEYSTORE_PASSPHRASE: "<passphrase>",
              QUAESTOR_EVM_RELAYER_KEY: "<relayer-private-key>",
            },
          },
        },
      },
      null,
      2
    );
  }
}

/** Factory used by opsFactory for the EVM chains. */
export async function buildEvmOps(chain: ChainKind): Promise<ChainOps> {
  return new EvmOps(buildEvmContext(loadEvmConfig(chain)));
}
