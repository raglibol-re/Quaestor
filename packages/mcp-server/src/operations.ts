import { BN } from "@coral-xyz/anchor";
import {
  availableOf,
  decodeLabel,
  findBudgetPda,
  fromBaseUnits,
  statusName,
  toBaseUnits,
} from "@quaestor/sdk";
import { PublicKey } from "@solana/web3.js";
import { join } from "node:path";
import type { AgentContext } from "./context";
import { createAgent, hasAgent } from "./keystore";

const nowSec = () => Math.floor(Date.now() / 1000);

export async function getMyBudget(ctx: AgentContext) {
  const b = await ctx.client.getBudget(ctx.agentBudget);
  return {
    label: decodeLabel(b.label),
    agent: ctx.agentPubkey.toBase58(),
    budget: ctx.agentBudget.toBase58(),
    status: statusName(b.status),
    depth: b.depth,
    canDelegate: b.canDelegate,
    allocated: fromBaseUnits(b.allocated),
    spent: fromBaseUnits(b.spent),
    reservedForChildren: fromBaseUnits(b.reservedForChildren),
    available: fromBaseUnits(availableOf(b)),
    perTxLimit: b.perTxLimit ? fromBaseUnits(b.perTxLimit) : null,
    dailyLimit: b.periodLimit ? fromBaseUnits(b.periodLimit) : null,
    periodSpent: b.periodLimit ? fromBaseUnits(b.periodSpent) : null,
    expiresAt: b.expiresAt ? b.expiresAt.toNumber() : null,
  };
}

export async function pay(ctx: AgentContext, recipient: string, amountUsdc: string) {
  const { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } =
    await import("@solana/spl-token");
  const project = await ctx.client.getProject(ctx.config.project);
  const recipientOwner = new PublicKey(recipient);
  const recipientAta = getAssociatedTokenAddressSync(project.mint, recipientOwner);
  const amount = toBaseUnits(amountUsdc);

  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    ctx.config.relayer.publicKey,
    recipientAta,
    recipientOwner,
    project.mint
  );
  const builder = await ctx.client.spend({
    agent: ctx.agentPubkey,
    project: ctx.config.project,
    budget: ctx.agentBudget,
    recipient: recipientAta,
    amount,
  });
  const signature = await builder
    .preInstructions([createAtaIx])
    .signers([ctx.agentKeypair])
    .rpc();
  return { signature, recipient: recipientOwner.toBase58(), amount: amountUsdc };
}

export interface CreateSubagentParams {
  label: string;
  amountUsdc: string;
  perTxLimitUsdc?: string;
  dailyLimitUsdc?: string;
  canDelegate?: boolean;
  expiresInHours?: number;
  allowlist?: string[];
}

export async function createSubagentBudget(ctx: AgentContext, p: CreateSubagentParams) {
  const slug =
    p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
  let name = `${ctx.config.agent}.${slug}`;
  let i = 1;
  while (hasAgent(name)) name = `${ctx.config.agent}.${slug}-${i++}`;
  const childKp = createAgent(name, ctx.config.passphrase);

  const daily = p.dailyLimitUsdc ? toBaseUnits(p.dailyLimitUsdc) : null;
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
    expiresAt: p.expiresInHours ? new BN(nowSec() + Math.floor(p.expiresInHours * 3600)) : null,
    canDelegate: p.canDelegate ?? false,
    allowlist: (p.allowlist ?? []).map((a) => new PublicKey(a)),
  });
  const signature = await builder.signers([ctx.agentKeypair]).rpc();
  const [childBudget] = findBudgetPda(ctx.config.project, childKp.publicKey);

  return {
    signature,
    agentName: name,
    agentPubkey: childKp.publicKey.toBase58(),
    budget: childBudget.toBase58(),
    configSnippet: mcpConfigSnippet(name, ctx),
  };
}

export async function listSubagents(ctx: AgentContext) {
  const all = await ctx.client.fetchProjectBudgets(ctx.config.project);
  return all
    .filter((b) => b.account.parent && b.account.parent.equals(ctx.agentBudget))
    .map((c) => ({
      label: decodeLabel(c.account.label),
      budget: c.pubkey.toBase58(),
      agent: c.account.agent.toBase58(),
      status: statusName(c.account.status),
      allocated: fromBaseUnits(c.account.allocated),
      spent: fromBaseUnits(c.account.spent),
      available: fromBaseUnits(availableOf(c.account)),
      perTxLimit: c.account.perTxLimit ? fromBaseUnits(c.account.perTxLimit) : null,
      dailyLimit: c.account.periodLimit ? fromBaseUnits(c.account.periodLimit) : null,
    }));
}

async function findChildByLabel(ctx: AgentContext, label: string) {
  const all = await ctx.client.fetchProjectBudgets(ctx.config.project);
  const match = all.find(
    (b) =>
      b.account.parent &&
      b.account.parent.equals(ctx.agentBudget) &&
      decodeLabel(b.account.label) === label
  );
  if (!match) throw new Error(`no sub-agent labelled '${label}'`);
  return match;
}

async function requireOwner(ctx: AgentContext) {
  const project = await ctx.client.getProject(ctx.config.project);
  if (!project.owner.equals(ctx.agentPubkey)) {
    throw new Error(
      "Only the project owner can freeze/revoke in this version. Run this from the owner's Quaestor MCP."
    );
  }
}

export async function freezeSubagent(ctx: AgentContext, label: string, freeze: boolean) {
  await requireOwner(ctx);
  const child = await findChildByLabel(ctx, label);
  const signature = await ctx.client
    .setStatus({ owner: ctx.agentPubkey, project: ctx.config.project, budget: child.pubkey, freeze })
    .signers([ctx.agentKeypair])
    .rpc();
  return { signature, label, status: freeze ? "frozen" : "active" };
}

export async function revokeSubagent(ctx: AgentContext, label: string) {
  await requireOwner(ctx);
  const child = await findChildByLabel(ctx, label);
  const signature = await ctx.client
    .revoke({ owner: ctx.agentPubkey, project: ctx.config.project, budget: child.pubkey })
    .signers([ctx.agentKeypair])
    .rpc();
  return { signature, label, status: "revoked" };
}

export async function reclaimSubagent(ctx: AgentContext, label: string) {
  const child = await findChildByLabel(ctx, label);
  const before = child.account;
  const unused = before.allocated.sub(before.spent);
  const signature = await (
    await ctx.client.reclaim({
      authority: ctx.agentPubkey,
      project: ctx.config.project,
      parent: ctx.agentBudget,
      child: child.pubkey,
    })
  )
    .signers([ctx.agentKeypair])
    .rpc();
  return { signature, label, reclaimed: fromBaseUnits(unused) };
}

export async function getHistory(ctx: AgentContext, limit = 10) {
  const sigs = await ctx.connection.getSignaturesForAddress(ctx.agentBudget, { limit });
  return sigs.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: s.err ? "failed" : "ok",
  }));
}

function mcpConfigSnippet(name: string, ctx: AgentContext): string {
  const serverPath = join(__dirname, "server.js");
  return JSON.stringify(
    {
      mcpServers: {
        [`quaestor-${name}`]: {
          command: "node",
          args: [serverPath],
          env: {
            QUAESTOR_RPC_URL: ctx.config.rpcUrl,
            QUAESTOR_PROJECT: ctx.config.project.toBase58(),
            QUAESTOR_AGENT: name,
            QUAESTOR_KEYSTORE_PASSPHRASE: "<same passphrase as parent>",
            QUAESTOR_RELAYER_KEYPAIR: process.env.QUAESTOR_RELAYER_KEYPAIR ?? "<relayer keypair path>",
          },
        },
      },
    },
    null,
    2
  );
}
