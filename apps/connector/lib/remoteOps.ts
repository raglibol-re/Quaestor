// Remote behavior for create_submandate (Paket 4). Over HTTP the tool does NOT write a local
// keystore; instead the parent's custodied key signs an on-chain allocate_child to a freshly
// generated, server-custodied child key, and the tool returns a single-use invite CODE. The
// invitee pastes that code into the consent screen to bind a token to the new child node — no
// wallet needed below the root. All other tools delegate unchanged to the custodied Solana ops.
import { BN } from "@coral-xyz/anchor";
import { findBudgetPda, toBaseUnits } from "@quaestor/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import type {
  Attribution,
  BuiltOps,
  ChainOps,
  CreateSubagentParams,
  CreateSubagentResult,
  SolanaOps,
} from "@quaestor/mcp-server";
import { builtOpsFor, type Principal } from "./resolve";
import { provisionAgentKey } from "./custody";
import { countRecentWrites, insertInvite, logToolCall, type NodeBinding } from "./db";
import { randomToken, sha256hex } from "./tokens";
import { env } from "./env";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_SEC = 60;
const RATE_PER_NODE = Number(process.env.QUAESTOR_RATE_PER_MIN || "10");
const RATE_PER_IP = RATE_PER_NODE * 3;

/**
 * Build the per-request backend for a token's node. create_submandate is overridden for HTTP
 * (invite links); write tools (pay, create_submandate) are rate-limited per node + per IP and all
 * tool outcomes are logged (secret-free). Reads delegate unchanged.
 */
export async function remoteBuiltOps(principal: Principal, ip?: string): Promise<BuiltOps> {
  const built = await builtOpsFor(principal);
  if (built.kind !== "budget") throw new Error("remote connector expects a budget backend");
  const inner = built.ops as SolanaOps;
  const b: NodeBinding = { chain: principal.chain, project: principal.project, mandate_node: principal.node };
  const ipOrNull = ip ?? null;

  async function guardWrite(): Promise<void> {
    const { byNode, byIp } = await countRecentWrites(principal.node, ipOrNull, RATE_WINDOW_SEC);
    if (byNode >= RATE_PER_NODE || (ipOrNull && byIp >= RATE_PER_IP)) {
      throw new Error(
        `Rate limit exceeded: too many write calls in the last minute — slow down and retry shortly.`
      );
    }
  }
  async function write<T>(tool: string, run: () => Promise<T>): Promise<T> {
    await guardWrite();
    try {
      const r = await run();
      await logToolCall(b, tool, true, ipOrNull);
      return r;
    } catch (e) {
      await logToolCall(b, tool, false, ipOrNull);
      throw e;
    }
  }

  const ops: ChainOps = {
    describe: () => inner.describe(),
    networkLabel: () => inner.networkLabel(),
    payerAddress: () => inner.payerAddress(),
    getMyBudget: () => inner.getMyBudget(),
    pay: (r: string, a: string, attr?: Attribution) => write("pay", () => inner.pay(r, a, attr)),
    listSubagents: () => inner.listSubagents(),
    freezeSubagent: (l: string, f: boolean) => inner.freezeSubagent(l, f),
    revokeSubagent: (l: string) => inner.revokeSubagent(l),
    reclaimSubagent: (l: string) => inner.reclaimSubagent(l),
    getHistory: (n: number) => inner.getHistory(n),
    toFriendlyError: (e: unknown) => inner.toFriendlyError(e),
    createSubagentBudget: (p: CreateSubagentParams) =>
      write("create_submandate", () => createRemoteSubmandate(inner, principal, p)),
  };
  return { kind: "budget", ops };
}

async function createRemoteSubmandate(
  inner: SolanaOps,
  principal: Principal,
  p: CreateSubagentParams
): Promise<CreateSubagentResult> {
  const ctx = inner.context;
  const childKp = Keypair.generate();
  const daily = p.dailyLimitUsdc ? toBaseUnits(p.dailyLimitUsdc) : null;

  // Parent's custodied key signs the allocation; the relayer pays rent.
  const builder = ctx.client.allocateChild({
    authority: ctx.agentPubkey,
    feePayer: ctx.config.relayer.publicKey,
    project: ctx.config.project,
    parent: ctx.agentBudget,
    childAgent: childKp.publicKey,
    label: p.label,
    amount: toBaseUnits(p.amountUsdc),
    perTxLimit: p.perTxLimitUsdc ? toBaseUnits(p.perTxLimitUsdc) : null,
    periodLimit: daily,
    periodSeconds: daily ? 86400 : 0,
    expiresAt: p.expiresInHours
      ? new BN(Math.floor(Date.now() / 1000) + Math.floor(p.expiresInHours * 3600))
      : null,
    canDelegate: p.canDelegate ?? false,
    allowlist: (p.allowlist ?? []).map((a) => new PublicKey(a)),
  });
  const signature = await builder.signers([ctx.agentKeypair]).rpc();
  const [childBudget] = findBudgetPda(ctx.config.project, childKp.publicKey);

  // Custody the child key (envelope) and mint a single-use, expiring invite for it.
  const childNode = childKp.publicKey.toBase58();
  await provisionAgentKey(principal.chain, principal.project, childKp);
  const invite = randomToken(32);
  await insertInvite({
    token_hash: sha256hex(invite),
    chain: principal.chain,
    project: principal.project,
    parent_node: principal.node,
    child_params: { label: p.label, child_node: childNode },
    child_node: childNode,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });

  return {
    signature,
    agentName: p.label,
    agentPubkey: childNode,
    budget: childBudget.toBase58(),
    configSnippet:
      `Invite code (single-use, expires in 24h) for the new sub-mandate node:\n\n    ${invite}\n\n` +
      `To connect it in claude.ai: add this connector's MCP URL (${env().connectorUrl}/api/mcp), ` +
      `and when the Quaestor consent screen appears, paste the invite code above. ` +
      `No wallet needed — the code authorizes binding a token to THIS node only; it grants no access until the flow completes.`,
  };
}
