"use client";

import {
  BN,
  availableOf,
  decodeLabel,
  depthNumeral,
  formatUSDC,
  statusName,
  type BudgetTreeNode,
} from "@quaestor/sdk";
import { short } from "@/lib/quaestor";
import { Amount } from "@/components/brand/Amount";
import { BudgetMeter } from "@/components/brand/BudgetMeter";
import { Button } from "@/components/brand/Button";
import { StatusBadge } from "@/components/brand/StatusBadge";

export type NodeAction = "freeze" | "unfreeze" | "revoke" | "reclaim";

export function BudgetNode({
  node,
  depth,
  canManage,
  onAction,
  busy,
}: {
  node: BudgetTreeNode;
  depth: number;
  canManage: boolean;
  onAction: (a: NodeAction, node: BudgetTreeNode) => void;
  busy: string | null;
}) {
  const a = node.account;
  const status = statusName(a.status);
  const allocated = a.allocated as BN;
  const spent = a.spent as BN;
  const reserved = a.reservedForChildren as BN;
  const unused = allocated.sub(spent);
  const label = decodeLabel(a.label) || (depth === 0 ? "vault" : "budget");
  const key = node.pubkey.toBase58();
  const busyThis = busy === key;

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
            <div className="q-node-addr">{short(a.agent.toBase58())}</div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="q-node-limit">
          <span>Limit</span>
          <Amount value={allocated} />
        </div>

        <BudgetMeter limit={allocated} spent={spent} reserved={reserved} />

        {(a.perTxLimit || a.periodLimit || a.expiresAt || !a.canDelegate) && (
          <div className="limits">
            {a.perTxLimit && <span>per-tx ≤ {formatUSDC(a.perTxLimit, { unit: true })}</span>}
            {a.periodLimit && (
              <span>
                daily ≤ {formatUSDC(a.periodLimit, { unit: true })} (spent {formatUSDC(a.periodSpent)})
              </span>
            )}
            {a.expiresAt && <span>expires {new Date(a.expiresAt.toNumber() * 1000).toLocaleString()}</span>}
            {!a.canDelegate && depth > 0 && <span>no-delegate</span>}
          </div>
        )}

        {canManage && depth > 0 && status !== "revoked" && (
          <div className="node-actions">
            {status === "active" && (
              <Button variant="danger" size="sm" disabled={busyThis} onClick={() => onAction("freeze", node)}>
                Freeze branch
              </Button>
            )}
            {status === "frozen" && (
              <Button size="sm" disabled={busyThis} onClick={() => onAction("unfreeze", node)}>
                Unfreeze branch
              </Button>
            )}
            <Button variant="danger" size="sm" disabled={busyThis} onClick={() => onAction("revoke", node)}>
              Revoke
            </Button>
          </div>
        )}

        {canManage && depth > 0 && status === "revoked" && reserved.isZero() && unused.gtn(0) && (
          <div className="node-actions">
            <Button size="sm" disabled={busyThis} onClick={() => onAction("reclaim", node)}>
              Reclaim {formatUSDC(unused, { unit: true })}
            </Button>
          </div>
        )}

        {node.children.length > 0 && (
          <div className="children">
            {node.children.map((c) => (
              <BudgetNode
                key={c.pubkey.toBase58()}
                node={c}
                depth={depth + 1}
                canManage={canManage}
                onAction={onAction}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
