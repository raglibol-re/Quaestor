import type * as React from "react";

// Chain status is active|frozen|revoked; the brand ships active|reserved|rejected|frozen.
// We render the chain set plus a cinnabar `revoked` variant (see globals.css q-badge-*).
export type BudgetStatus = "active" | "reserved" | "rejected" | "frozen" | "revoked";

const LABELS: Record<BudgetStatus, string> = {
  active: "Active",
  reserved: "Reserved",
  rejected: "Rejected",
  frozen: "Frozen",
  revoked: "Revoked",
};

export function StatusBadge({
  status,
  children,
}: {
  status: BudgetStatus;
  children?: React.ReactNode;
}) {
  return <span className={`q-badge q-badge-${status}`}>{children ?? LABELS[status]}</span>;
}
