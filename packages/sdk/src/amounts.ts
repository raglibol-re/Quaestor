import { BN } from "@coral-xyz/anchor";
import { USDC_DECIMALS } from "./constants";

/** Convert a human decimal amount ("1.5") to base units (BN). */
export function toBaseUnits(amount: number | string, decimals: number = USDC_DECIMALS): BN {
  const s = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`too many decimals (max ${decimals})`);
  return new BN(whole + frac.padEnd(decimals, "0"));
}

/** Convert base units to a human decimal string ("1.5"). */
export function fromBaseUnits(base: BN | bigint | number | string, decimals: number = USDC_DECIMALS): string {
  const digits = base.toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const whole = digits.slice(0, cut);
  const frac = digits.slice(cut).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
