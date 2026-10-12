/**
 * Chain-agnostic x402 client for Quaestor's budget-enforced "quaestor-onchain" scheme.
 *
 * Standard x402 "exact" pulls from the payer's wallet via an EIP-3009 signature, which would
 * bypass Quaestor's on-chain budget enforcement. Instead this client pays via `ops.pay(...)` —
 * a BUDGET-ENFORCED on-chain spend — and uses the resulting on-chain tx id as the x402 payment
 * proof. The resource server re-verifies that tx on-chain (token transferred >= required to the
 * merchant) before releasing the resource. The HTTP shapes stay x402-flavored:
 *
 *   402 body (JSON):
 *     { x402Version: 1, accepts: [{ scheme, network, maxAmountRequired, resource,
 *                                    description, payTo, asset, extra: { contract? } }] }
 *   X-PAYMENT header (base64 of JSON):
 *     { x402Version: 1, scheme: "quaestor-onchain", network, payload: { txHash, payer, amount } }
 *
 * Because payment goes through `ops.pay`, every Quaestor limit (per-tx, daily, allowlist,
 * freeze/expiry of this budget or any ancestor) applies to the x402 payment. A budget
 * rejection surfaces as a thrown Error (ops.pay already produces friendly messages).
 */
import type { ChainOps } from "./chainOps";

export const X402_SCHEME = "quaestor-onchain";
export const X402_VERSION = 1;

export interface PaymentRequirement {
  scheme: string;
  network: string;
  /** Required amount in token base-units, as an integer string (e.g. "250000" = 0.25 USDC). */
  maxAmountRequired: string;
  resource: string;
  description?: string;
  /** Merchant address that must receive the payment. */
  payTo: string;
  /** Token address / mint that must be transferred. */
  asset: string;
  extra?: { contract?: string } & Record<string, unknown>;
}

export interface PaymentRequirements {
  x402Version: number;
  accepts: PaymentRequirement[];
}

export interface X402PaymentPayload {
  txHash: string;
  payer: string;
  /** Amount actually required/paid, in token base-units (integer string). */
  amount: string;
}

export interface X402PaymentHeader {
  x402Version: number;
  scheme: string;
  network: string;
  payload: X402PaymentPayload;
}

export interface X402FetchResult {
  status: number;
  body: unknown;
  /** Present when a budget-enforced payment was made (HTTP 402 path); null otherwise. */
  payment: { txHash: string; amount: string; payTo: string } | null;
  /**
   * Present (with `payment: null`) when a 402 was detected but NOT yet paid — either because
   * the caller did not confirm, so the required URL/amount is returned for explicit review
   * before any money moves. Re-call with `confirm: true` to pay.
   */
  preflight?: {
    url: string;
    amount: string;
    payTo: string;
    network: string;
    description?: string;
  } | null;
}

export interface X402Options {
  /** Request headers / fetch init passed through to the underlying fetch. */
  init?: FetchInit;
  /** Must be true to actually pay on a 402. When false/unset, a 402 returns a preflight only. */
  confirm?: boolean;
  /** Per-call ceiling (decimal USDC). The required amount must be <= this (and <= the env cap). */
  maxAmountUsdc?: string;
}

/** The subset of ChainOps the x402 client needs (lets demos pass a minimal adapter). */
export type X402Ops = Pick<ChainOps, "pay" | "networkLabel" | "payerAddress">;

type FetchResponse = Awaited<ReturnType<typeof fetch>>;
type FetchInit = Parameters<typeof fetch>[1];

/**
 * Base-units integer string -> human decimal string (USDC = 6 decimals). Pure string math,
 * so there are no float / BigInt-locale rounding surprises for the `ops.pay` decimal argument.
 */
export function baseUnitsToDecimal(base: string, decimals = 6): string {
  const s = base.trim();
  const neg = s.startsWith("-");
  let digits = s.replace(/^[-+]/, "").replace(/^0+(?=\d)/, "");
  if (digits === "") digits = "0";
  if (decimals === 0) return (neg ? "-" : "") + digits;
  const padded = digits.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  const intPart = padded.slice(0, cut);
  const frac = padded.slice(cut).replace(/0+$/, "");
  return (neg ? "-" : "") + (frac ? `${intPart}.${frac}` : intPart);
}

/** Human decimal string -> base-units bigint (USDC = 6 decimals). Pure string math. */
export function decimalToBaseUnits(dec: string, decimals = 6): bigint {
  const s = dec.trim();
  const neg = s.startsWith("-");
  const [intRaw, fracRaw = ""] = s.replace(/^[-+]/, "").split(".");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const digits = `${intRaw || "0"}${frac}`.replace(/^0+(?=\d)/, "");
  const v = BigInt(digits || "0");
  return neg ? -v : v;
}

/**
 * The effective per-call base-unit ceiling: the min of the tool arg and the
 * `QUAESTOR_X402_MAX_USDC` env, or null if neither is set.
 */
function resolveMaxBase(maxAmountUsdc?: string): bigint | null {
  const caps: bigint[] = [];
  if (maxAmountUsdc != null && maxAmountUsdc !== "") caps.push(decimalToBaseUnits(maxAmountUsdc));
  const envMax = process.env.QUAESTOR_X402_MAX_USDC;
  if (envMax != null && envMax !== "") caps.push(decimalToBaseUnits(envMax));
  if (caps.length === 0) return null;
  return caps.reduce((a, b) => (a < b ? a : b));
}

export function encodePaymentHeader(h: X402PaymentHeader): string {
  return Buffer.from(JSON.stringify(h), "utf8").toString("base64");
}

export function decodePaymentHeader(value: string): X402PaymentHeader {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as X402PaymentHeader;
}

/** Parse a 402 PaymentRequirements body and pick the first `accepts` entry matching `network`. */
export function parse402(body: unknown, network: string): PaymentRequirement {
  const reqs = body as PaymentRequirements | null;
  if (!reqs || !Array.isArray(reqs.accepts) || reqs.accepts.length === 0) {
    throw new Error("x402: 402 response did not include any `accepts` payment requirements");
  }
  const match =
    reqs.accepts.find((a) => a.network === network && a.scheme === X402_SCHEME) ??
    reqs.accepts.find((a) => a.network === network);
  if (!match) {
    const nets = reqs.accepts.map((a) => a.network).join(", ");
    throw new Error(
      `x402: no payment requirement matches this agent's network "${network}" (server offered: ${nets})`
    );
  }
  return match;
}

async function readBody(res: FetchResponse): Promise<unknown> {
  const text = await res.text();
  if (!text) return "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Fetch `url`. If the first response is not 402, return it as-is (no payment). On HTTP 402:
 *   1. Enforce the per-call ceiling (`opts.maxAmountUsdc` and the `QUAESTOR_X402_MAX_USDC` env) —
 *      if the required amount exceeds it, refuse: nothing is fetched or paid.
 *   2. If `opts.confirm` is not true, return a **preflight** (url + amount + merchant) and pay
 *      nothing, so the user can review before any money moves.
 *   3. If confirmed, pay from this agent's Quaestor budget (budget-enforced on-chain), retry with
 *      the X-PAYMENT proof header, and return the resource plus the payment proof.
 * A budget rejection (per-tx / daily / frozen / allowlist) propagates as a thrown Error from `ops.pay`.
 * NOTE: `confirm` defaults to true so existing callers/scripts pay as before; the MCP tool passes
 * `confirm: false` on the first call to force the preflight.
 */
export async function x402Fetch(
  ops: X402Ops,
  url: string,
  opts: X402Options = {}
): Promise<X402FetchResult> {
  const { init } = opts;
  const first = await fetch(url, init);
  if (first.status !== 402) {
    return { status: first.status, body: await readBody(first), payment: null, preflight: null };
  }

  const firstBody = await readBody(first);
  const requirements = parse402(firstBody, ops.networkLabel());
  const humanAmount = baseUnitsToDecimal(requirements.maxAmountRequired);

  // (1) Enforce the configurable per-call ceiling BEFORE anything is paid or even preflighted.
  const maxBase = resolveMaxBase(opts.maxAmountUsdc);
  if (maxBase != null && BigInt(requirements.maxAmountRequired) > maxBase) {
    throw new Error(
      `x402: required ${humanAmount} USDC exceeds the per-call max ` +
        `${baseUnitsToDecimal(maxBase.toString())} USDC — raise max_amount_usdc ` +
        `(or set QUAESTOR_X402_MAX_USDC) to proceed. Nothing was fetched or paid.`
    );
  }

  // (2) Preflight: a 402 was detected but not confirmed — return the exact URL/amount/merchant
  // for explicit review. No money moves until a confirmed re-call.
  const confirm = opts.confirm ?? true;
  if (!confirm) {
    return {
      status: first.status,
      body: firstBody,
      payment: null,
      preflight: {
        url,
        amount: humanAmount,
        payTo: requirements.payTo,
        network: requirements.network,
        description: requirements.description,
      },
    };
  }

  // (3) Confirmed: budget-enforced on-chain spend to the merchant. Throws a friendly error if a
  // Quaestor limit (per-tx / daily / available / allowlist / freeze / expiry) rejects the payment.
  const pr = await ops.pay(requirements.payTo, humanAmount);

  const header: X402PaymentHeader = {
    x402Version: X402_VERSION,
    scheme: X402_SCHEME,
    network: requirements.network,
    payload: {
      txHash: pr.signature,
      payer: ops.payerAddress(),
      amount: requirements.maxAmountRequired,
    },
  };

  const mergedHeaders: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    "X-PAYMENT": encodePaymentHeader(header),
  };
  const paid = await fetch(url, { ...init, headers: mergedHeaders });

  return {
    status: paid.status,
    body: await readBody(paid),
    payment: { txHash: pr.signature, amount: pr.amount, payTo: requirements.payTo },
    preflight: null,
  };
}
