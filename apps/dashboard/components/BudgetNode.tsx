"use client";

import {
  BN,
  availableOf,
  decodeLabel,
  fromBaseUnits,
  statusName,
  type BudgetTreeNode,
} from "@quaestor/sdk";
import { short } from "@/lib/quaestor";

export type NodeAction = "freeze" | "unfreeze" | "revoke" | "reclaim";

function pct(part: BN, total: BN): number {
  if (total.isZero()) return 0;
  const bps = part.muln(10000).div(total).toNumber();
  return Math.max(0, Math.min(100, bps / 100));
}

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
  const avail = availableOf(a);
  const unused = allocated.sub(spent);
  const label = decodeLabel(a.label) || (depth === 0 ? "root" : "budget");
  const key = node.pubkey.toBase58();
  const busyThis = busy === key;

  return (
    <div className={`node ${status}`}>
      <div className="node-head">
        <span className="node-label">{label}</span>
        <span className="node-agent">{short(a.agent.toBase58())}</span>
        <span className="spacer" />
        <span className={`pill ${status}`}>{status}</span>
      </div>

      <div className="bar">
        <div className="seg-spent" style={{ width: `${pct(spent, allocated)}%` }} />
        <div className="seg-reserved" style={{ width: `${pct(reserved, allocated)}%` }} />
        <div className="seg-avail" style={{ width: `${pct(avail, allocated)}%` }} />
      </div>

      <div className="amounts">
        <span className="a"><i className="swatch spent" /> spent <b>{fromBaseUnits(spent)}</b></span>
        <span className="a"><i className="swatch reserved" /> reserved <b>{fromBaseUnits(reserved)}</b></span>
        <span className="a"><i className="swatch avail" /> available <b>{fromBaseUnits(avail)}</b></span>
        <span className="a">of <b>{fromBaseUnits(allocated)}</b> USDC</span>
      </div>

      {(a.perTxLimit || a.periodLimit || a.expiresAt || !a.canDelegate) && (
        <div className="limits">
          {a.perTxLimit && <span>per-tx ≤ {fromBaseUnits(a.perTxLimit)}</span>}
          {a.periodLimit && (
            <span>
              daily ≤ {fromBaseUnits(a.periodLimit)} (spent {fromBaseUnits(a.periodSpent)})
            </span>
          )}
          {a.expiresAt && <span>expires {new Date(a.expiresAt.toNumber() * 1000).toLocaleString()}</span>}
          {!a.canDelegate && depth > 0 && <span>no-delegate</span>}
        </div>
      )}

      {canManage && depth > 0 && status !== "revoked" && (
        <div className="node-actions">
          {status === "active" && (
            <button className="btn small warn" disabled={busyThis} onClick={() => onAction("freeze", node)}>
              Freeze
            </button>
          )}
          {status === "frozen" && (
            <button className="btn small" disabled={busyThis} onClick={() => onAction("unfreeze", node)}>
              Unfreeze
            </button>
          )}
          <button className="btn small danger" disabled={busyThis} onClick={() => onAction("revoke", node)}>
            Revoke
          </button>
        </div>
      )}

      {canManage && depth > 0 && status === "revoked" && reserved.isZero() && unused.gtn(0) && (
        <div className="node-actions">
          <button className="btn small" disabled={busyThis} onClick={() => onAction("reclaim", node)}>
            Reclaim {fromBaseUnits(unused)} USDC
          </button>
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
  );
}
