/**
 * Spend attribution — task_id + reason, hashed on-chain, plaintext off-chain.
 *
 * On Solana we attach the attribution commitment to the spend transaction via an
 * SPL **Memo** instruction (same tx, no program change, visible on the explorer):
 *
 *   quaestor/v1 task=<taskId> rhash=<sha256(reason)>
 *
 * The plaintext `reason` never goes on-chain; it is appended to a local JSONL log
 * (`~/.quaestor/attribution.jsonl`, overridable via QUAESTOR_ATTRIBUTION_LOG) keyed
 * by tx signature, so `get_history` and the dashboard can show the "Why?" and so a
 * reviewer can verify `sha256(reason) == rhash`. Tempo uses its native transfer memo
 * for the same payload; EVM chains carry `(taskId, reasonHash)` in the `Spent` event.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import type { Attribution } from "./chainOps";

/** SPL Memo program (canonical). */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** sha256 hex of the plaintext reason — the on-chain commitment. */
export function hashReason(reason: string): string {
  return createHash("sha256").update(reason, "utf8").digest("hex");
}

/** Does this attribution carry anything worth recording? */
export function hasAttribution(a?: Attribution): a is Attribution {
  return !!a && !!((a.taskId && a.taskId.trim()) || (a.reason && a.reason.trim()));
}

/** Compact, human-readable memo payload, or null if there's nothing to attribute. */
export function memoPayload(a?: Attribution): string | null {
  if (!hasAttribution(a)) return null;
  const task = (a.taskId ?? "").trim();
  const rhash = a.reason && a.reason.trim() ? hashReason(a.reason.trim()) : "";
  return `quaestor/v1 task=${task} rhash=${rhash}`;
}

/** SPL Memo instruction carrying `payload` (no signer required). */
export function memoInstruction(payload: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(payload, "utf8"),
  });
}

export interface AttributionRecord {
  ts: number;
  chain: string;
  signature: string;
  recipient: string;
  amount: string;
  taskId?: string;
  reason?: string;
  reasonHash?: string;
}

function logPath(): string {
  const base = process.env.QUAESTOR_ATTRIBUTION_LOG;
  if (base) return base;
  return join(homedir(), ".quaestor", "attribution.jsonl");
}

/** Append one spend's plaintext attribution to the off-chain log (best-effort). */
export function appendAttribution(rec: AttributionRecord): void {
  try {
    const p = logPath();
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(rec) + "\n", "utf8");
  } catch {
    /* never fail a spend because attribution logging failed */
  }
}

/** signature -> attribution record, from the off-chain log (for get_history / dashboard). */
export function readAttributionMap(): Map<string, AttributionRecord> {
  const m = new Map<string, AttributionRecord>();
  try {
    const p = logPath();
    if (!existsSync(p)) return m;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as AttributionRecord;
      if (r.signature) m.set(r.signature, r);
    }
  } catch {
    /* ignore a corrupt/absent log */
  }
  return m;
}
