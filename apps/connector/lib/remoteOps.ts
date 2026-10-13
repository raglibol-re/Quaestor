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
import { insertInvite } from "./db";
import { randomToken, sha256hex } from "./tokens";
import { env } from "./env";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** Build the per-request backend for a token's node, with create_submandate overridden for HTTP. */
export async function remoteBuiltOps(principal: Principal): Promise<BuiltOps> {
  const built = await builtOpsFor(principal);
  if (built.kind !== "budget") throw new Error("remote connector expects a budget backend");
  const inner = built.ops as SolanaOps;
  const ops: ChainOps = {
    describe: () => inner.describe(),
    networkLabel: () => inner.networkLabel(),
    payerAddress: () => inner.payerAddress(),
    getMyBudget: () => inner.getMyBudget(),
    pay: (r: string, a: string, attr?: Attribution) => inner.pay(r, a, attr),
    listSubagents: () => inner.listSubagents(),
    freezeSubagent: (l: string, f: boolean) => inner.freezeSubagent(l, f),
    revokeSubagent: (l: string) => inner.revokeSubagent(l),
    reclaimSubagent: (l: string) => inner.reclaimSubagent(l),
    getHistory: (n: number) => inner.getHistory(n),
    toFriendlyError: (e: unknown) => inner.toFriendlyError(e),
    createSubagentBudget: (p: CreateSubagentParams) => createRemoteSubmandate(inner, principal, p),
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
