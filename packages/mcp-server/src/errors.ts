import { fromBaseUnits } from "@quaestor/sdk";
import { BN } from "@coral-xyz/anchor";

/** Quaestor program error codes (from the IDL, base 6000). */
const CODE_MESSAGE: Record<number, string> = {
  6000: "Unauthorized: you are not the required agent or owner.",
  6001: "Only the project owner may do this.",
  6002: "This mandate is not active (frozen or revoked).",
  6003: "A parent mandate in the chain is frozen, revoked, or expired.",
  6004: "This mandate has expired.",
  6005: "This mandate is not allowed to create sub-mandates.",
  6006: "Maximum tree depth (4) reached.",
  6007: "Depth exceeds the allowed sub-tree depth.",
  6008: "Insufficient mandate balance available.",
  6009: "Amount exceeds the per-transaction limit.",
  6010: "Amount exceeds the period (e.g. daily) limit.",
  6011: "A sub-mandate limit is looser than this mandate's limit.",
  6012: "A sub-mandate expiry is later than this mandate's expiry.",
  6013: "Recipient is not in the allowlist.",
  6014: "Sub-mandate allowlist must be a subset of this mandate's allowlist.",
  6015: "Allowlist exceeds the maximum of 8 entries.",
  6016: "Invalid ancestor chain.",
  6017: "Ancestor chain length mismatch.",
  6018: "Account belongs to a different project.",
  6019: "Invalid PDA.",
  6020: "Sub-mandate still has funds reserved for its own children (reclaim those first).",
  6021: "Not reclaimable: the sub-mandate must be revoked or expired first.",
  6022: "Sub-mandate is not linked to this mandate.",
  6023: "Arithmetic overflow.",
  6024: "Invalid mint.",
  6025: "Amount must be greater than zero.",
  6026: "Mandate is already revoked.",
};

export function extractErrorCode(err: any): number | null {
  const n = err?.error?.errorCode?.number ?? err?.code;
  if (typeof n === "number" && n >= 6000) return n;
  const text = `${err?.message ?? ""} ${(err?.logs ?? []).join(" ")} ${JSON.stringify(err?.error ?? "")}`;
  const hex = text.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (hex) return parseInt(hex[1], 16);
  const dec = text.match(/"Custom"\s*:\s*(\d+)/);
  if (dec) return parseInt(dec[1], 10);
  return null;
}

/** Amounts (base units) to enrich certain limit messages. */
export interface BudgetNumbers {
  attempted?: BN;
  available?: BN;
  perTxLimit?: BN | null;
  periodLimit?: BN | null;
  periodSpent?: BN;
}

/** Turn a thrown program error into a clear, human message (USDC amounts). */
export function friendlyError(err: any, nums?: BudgetNumbers): string {
  const code = extractErrorCode(err);
  if (code == null) return err?.message ? String(err.message) : "Transaction failed.";

  const usdc = (b?: BN | null) => (b ? `${fromBaseUnits(b)} USDC` : "—");

  switch (code) {
    case 6008:
      return `Insufficient mandate balance: available ${usdc(nums?.available)}${
        nums?.attempted ? `, tried to spend ${usdc(nums.attempted)}` : ""
      }.`;
    case 6009:
      return `Per-transaction limit exceeded: limit ${usdc(nums?.perTxLimit)}${
        nums?.attempted ? `, tried ${usdc(nums.attempted)}` : ""
      }.`;
    case 6010: {
      const remaining =
        nums?.periodLimit && nums?.periodSpent
          ? nums.periodLimit.sub(nums.periodSpent)
          : undefined;
      return `Period limit reached: spent ${usdc(nums?.periodSpent)} of ${usdc(nums?.periodLimit)}${
        remaining ? ` (only ${usdc(remaining)} left this period)` : ""
      }.`;
    }
    default:
      return CODE_MESSAGE[code] ?? `Program error ${code}.`;
  }
}
