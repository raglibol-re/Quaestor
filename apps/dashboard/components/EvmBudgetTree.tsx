"use client";

import { BN, depthNumeral, formatUSDC } from "@quaestor/sdk";
import { decodeLabel } from "@quaestor/evm-sdk";
import { Amount } from "@/components/brand/Amount";
import { BudgetMeter } from "@/components/brand/BudgetMeter";
import { StatusBadge, type BudgetStatus } from "@/components/brand/StatusBadge";
import type { EvmBudgetNode } from "@/lib/evm";
import { shortHex } from "@/lib/evm";

const bn = (x: bigint) => new BN(x.toString());
// On-chain Budget.status: 0 Active, 1 Frozen, 2 Revoked.
const EVM_STATUS: BudgetStatus[] = ["active", "frozen", "revoked"];

/**
 * Read-only EVM budget-tree node — mirrors the Solana `BudgetNode` visuals (same brand
 * components + CSS classes) but reads the EVM `Budget` struct (bigint amounts, 0x addresses).
 * Amounts are 6-decimal base units on both chains, so `bigint → BN` renders identically.
 */
export function EvmBudgetTree({ node, depth = 0 }: { node: EvmBudgetNode; depth?: number }) {
  const b = node.budget;
  const status: BudgetStatus = EVM_STATUS[b.status] ?? "active";
  const allocated = bn(b.allocated);
  const spent = bn(b.spent);
  const reserved = bn(b.reservedForChildren);
  const label = decodeLabel(b.label) || (depth === 0 ? "vault" : "mandate");

  const nodeClass = `q-node${status === "frozen" ? " q-node-frozen" : ""}${
    status === "revoked" ? " q-node-revoked" : ""
  }`;

  return (
    <div className={nodeClass}>
      <div className="q-node-depth" aria-label={`Depth ${depth + 1}`}>
        {depthNumeral(depth + 1)}
      </div>
      <div className="q-node-body">
        <div className="q-node-head">
          <div>
            <div className="q-node-name">{label}</div>
            <div className="q-node-addr">{shortHex(b.agent)}</div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="q-node-limit">
          <span>Limit</span>
          <Amount value={allocated} />
        </div>

        <BudgetMeter limit={allocated} spent={spent} reserved={reserved} />

        {(b.hasPerTxLimit || b.hasPeriodLimit || b.hasExpiry || !b.canDelegate) && (
          <div className="limits">
            {b.hasPerTxLimit && <span>per-tx ≤ {formatUSDC(bn(b.perTxLimit), { unit: true })}</span>}
            {b.hasPeriodLimit && (
              <span>
                daily ≤ {formatUSDC(bn(b.periodLimit), { unit: true })} (spent{" "}
                {formatUSDC(bn(b.periodSpent))})
              </span>
            )}
            {b.hasExpiry && (
              <span>expires {new Date(Number(b.expiresAt) * 1000).toLocaleString()}</span>
            )}
            {!b.canDelegate && depth > 0 && <span>no-delegate</span>}
          </div>
        )}

        {node.children.length > 0 && (
          <div className="children">
            {node.children.map((c) => (
              <EvmBudgetTree key={c.key} node={c} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
