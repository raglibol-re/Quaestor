import { LABEL_LEN } from "./constants";

/** Encode a label string into a fixed [u8; 32] byte array. */
export function labelBytes(s: string): number[] {
  const buf = Buffer.alloc(LABEL_LEN);
  buf.write(s.slice(0, LABEL_LEN), "utf8");
  return Array.from(buf);
}

/** Decode a [u8; 32] label back to a string (trailing NULs stripped). */
export function decodeLabel(bytes: number[] | Uint8Array): string {
  return Buffer.from(bytes).toString("utf8").replace(/\0+$/, "");
}

export type BudgetStatusName = "active" | "frozen" | "revoked";

/** Read an Anchor enum status object ({ active: {} } | ...) as a name. */
export function statusName(status: Record<string, unknown>): BudgetStatusName {
  if ("active" in status) return "active";
  if ("frozen" in status) return "frozen";
  return "revoked";
}
