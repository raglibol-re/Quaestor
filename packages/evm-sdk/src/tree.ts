import type { Address, Hex, PublicClient } from "viem";
import { QUAESTOR_ABI } from "./abi/quaestor";

/** Decoded on-chain Budget struct (as returned by Quaestor.getBudget). */
export interface Budget {
  project: Hex;
  parent: Hex;
  agent: Address;
  label: Hex;
  depth: number;
  canDelegate: boolean;
  maxChildDepth: number;
  allocated: bigint;
  spent: bigint;
  reservedForChildren: bigint;
  hasPerTxLimit: boolean;
  perTxLimit: bigint;
  hasPeriodLimit: boolean;
  periodLimit: bigint;
  periodSeconds: bigint;
  periodStart: bigint;
  periodSpent: bigint;
  hasExpiry: boolean;
  expiresAt: bigint;
  status: number; // 0 Active, 1 Frozen, 2 Revoked
  allowlist: readonly Address[];
  allowlistLen: number;
  childrenCount: number;
  exists: boolean;
}

/** A node in the hierarchical budget tree. */
export interface BudgetNode {
  key: Hex;
  budget: Budget;
  children: BudgetNode[];
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Available = allocated - spent - reservedForChildren (matches on-chain accounting). */
export function availableOf(b: Budget): bigint {
  return b.allocated - b.spent - b.reservedForChildren;
}

/** Human status name for a Budget.status code. */
export function statusName(status: number): string {
  return ["Active", "Frozen", "Revoked"][status] ?? `Unknown(${status})`;
}

/**
 * Build the full budget tree for a project by enumerating getProjectBudgetKeys
 * and reading each getBudget, then linking children to parents.
 * Returns the root node, or null if the project has no budgets.
 */
export async function fetchBudgetTree(
  publicClient: PublicClient,
  contract: Address,
  projectKey: Hex,
): Promise<BudgetNode | null> {
  const keys = (await publicClient.readContract({
    address: contract,
    abi: QUAESTOR_ABI,
    functionName: "getProjectBudgetKeys",
    args: [projectKey],
  })) as readonly Hex[];

  if (!keys || keys.length === 0) return null;

  const budgets = (await Promise.all(
    keys.map((k) =>
      publicClient.readContract({
        address: contract,
        abi: QUAESTOR_ABI,
        functionName: "getBudget",
        args: [k],
      }),
    ),
  )) as unknown as Budget[];

  const nodes = new Map<string, BudgetNode>();
  keys.forEach((k, i) => {
    nodes.set(k.toLowerCase(), { key: k, budget: budgets[i], children: [] });
  });

  let root: BudgetNode | null = null;
  keys.forEach((k, i) => {
    const node = nodes.get(k.toLowerCase())!;
    const parent = budgets[i].parent;
    if (!parent || parent === ZERO_BYTES32) {
      root = node;
    } else {
      const parentNode = nodes.get(parent.toLowerCase());
      if (parentNode) parentNode.children.push(node);
    }
  });

  return root;
}

/**
 * Walk the parent chain for a budget, returning ancestors ordered from the
 * immediate parent up to (and including) the root budget.
 */
export async function getAncestorChain(
  publicClient: PublicClient,
  contract: Address,
  budgetKey: Hex,
): Promise<{ key: Hex; budget: Budget }[]> {
  const chain: { key: Hex; budget: Budget }[] = [];
  let current = budgetKey;
  // MAX_DEPTH is 4 on-chain; cap iterations defensively.
  for (let i = 0; i < 8; i++) {
    const b = (await publicClient.readContract({
      address: contract,
      abi: QUAESTOR_ABI,
      functionName: "getBudget",
      args: [current],
    })) as unknown as Budget;
    if (!b.exists) break;
    const parent = b.parent;
    if (!parent || parent === ZERO_BYTES32) break;
    const pb = (await publicClient.readContract({
      address: contract,
      abi: QUAESTOR_ABI,
      functionName: "getBudget",
      args: [parent],
    })) as unknown as Budget;
    chain.push({ key: parent, budget: pb });
    current = parent;
  }
  return chain;
}
