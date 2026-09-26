import { BN, IdlAccounts, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Quaestor } from "./idl/quaestor";

export type BudgetData = IdlAccounts<Quaestor>["budget"];
export type ProjectData = IdlAccounts<Quaestor>["project"];

export interface BudgetTreeNode {
  pubkey: PublicKey;
  account: BudgetData;
  children: BudgetTreeNode[];
}

/** available = allocated - spent - reserved_for_children */
export function availableOf(b: {
  allocated: BN;
  spent: BN;
  reservedForChildren: BN;
}): BN {
  return b.allocated.sub(b.spent).sub(b.reservedForChildren);
}

/** Fetch all budgets of a project (memcmp on the `project` field at offset 8). */
export async function fetchProjectBudgets(
  program: Program<Quaestor>,
  project: PublicKey
): Promise<{ pubkey: PublicKey; account: BudgetData }[]> {
  const accs = await program.account.budget.all([
    { memcmp: { offset: 8, bytes: project.toBase58() } },
  ]);
  return accs.map((a) => ({ pubkey: a.publicKey, account: a.account }));
}

/** Fetch the full budget tree for a project (root node with nested children). */
export async function fetchBudgetTree(
  program: Program<Quaestor>,
  project: PublicKey
): Promise<BudgetTreeNode | null> {
  const all = await fetchProjectBudgets(program, project);
  const byKey = new Map<string, BudgetTreeNode>();
  for (const b of all) {
    byKey.set(b.pubkey.toBase58(), { pubkey: b.pubkey, account: b.account, children: [] });
  }
  let root: BudgetTreeNode | null = null;
  for (const node of byKey.values()) {
    const parent = node.account.parent;
    if (parent) {
      byKey.get(parent.toBase58())?.children.push(node);
    } else {
      root = node;
    }
  }
  return root;
}

/** The ancestor chain of a budget: [parent, grandparent, ..., root]. */
export async function getAncestorChain(
  program: Program<Quaestor>,
  budget: PublicKey
): Promise<PublicKey[]> {
  const chain: PublicKey[] = [];
  let cur = await program.account.budget.fetch(budget);
  while (cur.parent) {
    chain.push(cur.parent);
    cur = await program.account.budget.fetch(cur.parent);
  }
  return chain;
}
