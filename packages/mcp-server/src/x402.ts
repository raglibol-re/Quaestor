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
 * Fetch `url`, and on HTTP 402 pay for it from this agent's Quaestor budget, then retry with the
 * X-PAYMENT proof header. Returns the final response plus the payment proof. If the first response
 * is not 402, it is returned as-is (no payment). A budget rejection (per-tx / daily / frozen /
 * allowlist) propagates as a thrown Error from `ops.pay`.
 */
export async function x402Fetch(
  ops: X402Ops,
  url: string,
  init?: FetchInit
): Promise<X402FetchResult> {
  const first = await fetch(url, init);
  if (first.status !== 402) {
    return { status: first.status, body: await readBody(first), payment: null };
  }

  const requirements = parse402(await readBody(first), ops.networkLabel());
  const humanAmount = baseUnitsToDecimal(requirements.maxAmountRequired);

  // Budget-enforced on-chain spend to the merchant. Throws a friendly error if a Quaestor
  // limit (per-tx / daily / available / allowlist / freeze / expiry) rejects the payment.
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
  };
}
