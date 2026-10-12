import { BN } from "@coral-xyz/anchor";
import { toBaseUnits } from "./amounts";
import { USDC_DECIMALS } from "./constants";
import { decodeLabel, statusName } from "./util";
import { type BudgetTreeNode } from "./tree";

/**
 * Shared display + text formatters for Quaestor, next to the SDK so the
 * dashboard, the MCP server and logs all print identical lines
 * (see brand/README.md "Using this system in code").
 *
 * Pure TypeScript, no React, so both the Node server and the browser
 * dashboard can import it.
 */

export type BaseUnits = BN | bigint | number | string;

const NUMERALS = ["I", "II", "III", "IV"] as const;

/** Roman depth numeral I–IV (clamped to 1..MAX_DEPTH). */
export function depthNumeral(depth: number): string {
  const d = Math.min(Math.max(Math.trunc(depth) || 1, 1), 4);
  return NUMERALS[d - 1];
}

/** The integer base-units as a decimal string, for structuredContent `*_base_units`. */
export function baseUnitsString(base: BaseUnits): string {
  return (base instanceof BN ? base : new BN(base.toString())).toString();
}

/**
 * Brand money format from base units: exactly two decimals, comma thousands.
 *   formatUSDC(new BN(1_250_000000)) -> "1,250.00"
 *   formatUSDC(new BN(4_600000), { unit: true }) -> "4.60 USDC"
 *
 * String/BN based (no floats), so large balances never lose precision.
 * `fromBaseUnits` stays the lossless round-trip helper; this is for display.
 */
export function formatUSDC(
  base: BaseUnits,
  opts: { unit?: boolean; decimals?: number } = {}
): string {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  let v = base instanceof BN ? base.clone() : new BN(base.toString());
  const negative = v.isNeg();
  if (negative) v = v.neg();

  // Round to cents (two decimal places), half-up, in integer space.
  let cents: BN;
  if (decimals <= 2) {
    cents = v.mul(new BN(10).pow(new BN(2 - decimals)));
  } else {
    const scale = new BN(10).pow(new BN(decimals - 2));
    const q = v.div(scale);
    const r = v.mod(scale);
    cents = r.muln(2).gte(scale) ? q.addn(1) : q;
  }

  const hundred = new BN(100);
  const whole = cents.div(hundred).toString();
  const frac = cents.mod(hundred).toString().padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = `${negative ? "-" : ""}${grouped}.${frac}`;
  return opts.unit ? `${out} USDC` : out;
}

export interface ResultRow {
  key: string;
  value: string;
  /** Amounts align right in their column; plain strings stay left. */
  align?: "left" | "right";
}

/** Two-space-indent, lowercase-key, aligned key/value block (brand text surface). */
function renderRows(rows: ResultRow[]): string {
  const keyW = Math.max(...rows.map((r) => r.key.length));
  const rightRows = rows.filter((r) => r.align === "right");
  const valW = rightRows.length ? Math.max(...rightRows.map((r) => r.value.length)) : 0;
  return rows
    .map((r) => {
      const value = r.align === "right" ? r.value.padStart(valW) : r.value;
      return `  ${r.key.padEnd(keyW)}  ${value}`;
    })
    .join("\n");
}

/**
 * One tool result as text: a CAPS state word + one sentence on line 1,
 * then an aligned key/value block, then an optional `Next:` line.
 */
export function renderResult(opts: {
  state: string;
  sentence: string;
  rows?: ResultRow[];
  next?: string;
}): string {
  const lines: string[] = [`${opts.state} ${opts.sentence}`.trimEnd()];
  if (opts.rows && opts.rows.length) lines.push(renderRows(opts.rows));
  if (opts.next) lines.push(`Next: ${opts.next}`);
  return lines.join("\n");
}

/**
 * A rejected onchain action, in the brand's exact shape:
 *   REJECTED onchain. <reason>
 *     agent       research-agent [II]
 *     requested    12.00 USDC
 *     available     4.60 USDC
 *     limit        60.00 USDC
 *   Next: <one actionable step>
 */
export function renderRejection(opts: {
  reason: string;
  agent?: string;
  requested?: BaseUnits;
  available?: BaseUnits;
  limit?: BaseUnits;
  next: string;
}): string {
  const rows: ResultRow[] = [];
  if (opts.agent) rows.push({ key: "agent", value: opts.agent, align: "left" });
  if (opts.requested != null)
    rows.push({ key: "requested", value: formatUSDC(opts.requested, { unit: true }), align: "right" });
  if (opts.available != null)
    rows.push({ key: "available", value: formatUSDC(opts.available, { unit: true }), align: "right" });
  if (opts.limit != null)
    rows.push({ key: "limit", value: formatUSDC(opts.limit, { unit: true }), align: "right" });
  return renderResult({ state: "REJECTED", sentence: `onchain. ${opts.reason}`, rows, next: opts.next });
}

/**
 * The budget tree as monospace text with ├─ └─ │ connectors and depth
 * numerals, readable in any terminal (brand/README.md "plain-text" surface):
 *
 *   MANDATE TREE  vault 1,250.00 USDC
 *   ├─ [II]  research-agent  60.00 USDC  active
 *   │  └─ [III] scraper-sub  15.00 USDC  frozen
 *   └─ [II]  writer-agent    40.00 USDC  active
 */
export function renderBudgetTree(root: BudgetTreeNode, opts: { rootLabel?: string } = {}): string {
  const rootLabel = opts.rootLabel ?? (decodeLabel(root.account.label) || "vault");
  const rootAmt = formatUSDC(root.account.allocated as BN, { unit: true });
  const lines: string[] = [`MANDATE TREE  ${rootLabel} ${rootAmt}`];

  const walk = (nodes: BudgetTreeNode[], depth: number, prefix: string) => {
    nodes.forEach((n, i) => {
      const last = i === nodes.length - 1;
      const branch = last ? "└─" : "├─";
      const numeral = depthNumeral(depth + 1);
      const label = decodeLabel(n.account.label) || "mandate";
      const amt = formatUSDC(n.account.allocated as BN, { unit: true });
      const status = statusName(n.account.status);
      lines.push(`${prefix}${branch} [${numeral}] ${label}  ${amt}  ${status}`);
      if (n.children.length) walk(n.children, depth + 1, prefix + (last ? "   " : "│  "));
    });
  };
  walk(root.children, 1, "");
  return lines.join("\n");
}

/** Brand money from a human decimal-USDC string (e.g. "1.6" -> "1.60 USDC"). */
function usdcDec(decimal: string): string {
  return formatUSDC(toBaseUnits(decimal), { unit: true });
}

/**
 * A single mandate as returned, chain-neutrally, by an MCP `get_my_mandate`
 * (SolanaOps/EvmOps). Amounts are human decimal-USDC strings; status is one of
 * active | frozen | revoked. Extra backend fields are ignored.
 */
export interface BudgetView {
  label: string;
  status: string;
  depth?: number;
  allocated: string;
  spent: string;
  reservedForChildren?: string;
  available: string;
  perTxLimit?: string | null;
  dailyLimit?: string | null;
}

/** A direct subagent as returned by an MCP `list_subagents`. */
export interface SubagentView {
  label: string;
  status: string;
  allocated: string;
  spent?: string;
  available?: string;
}

/** The agent's own budget as a branded text block (brand plain-text surface). */
export function renderBudget(v: BudgetView): string {
  const head =
    v.depth != null
      ? `MANDATE  ${v.label}  [${depthNumeral(v.depth + 1)}]  ${v.status}`
      : `MANDATE  ${v.label}  ${v.status}`;
  const rows: ResultRow[] = [
    { key: "allocated", value: usdcDec(v.allocated), align: "right" },
    { key: "spent", value: usdcDec(v.spent), align: "right" },
  ];
  if (v.reservedForChildren != null)
    rows.push({ key: "reserved", value: usdcDec(v.reservedForChildren), align: "right" });
  rows.push({ key: "available", value: usdcDec(v.available), align: "right" });
  if (v.perTxLimit) rows.push({ key: "per-tx ≤", value: usdcDec(v.perTxLimit), align: "right" });
  if (v.dailyLimit) rows.push({ key: "daily ≤", value: usdcDec(v.dailyLimit), align: "right" });
  return `${head}\n${renderRows(rows)}`;
}

/** Direct subagents as a branded list with ├─ └─ connectors. */
export function renderBudgetList(opts: { title: string; items: SubagentView[] }): string {
  const title = opts.title.toUpperCase();
  if (!opts.items.length) return `${title}  (0)\n  No agents yet. Delegate a mandate to start.`;
  const lines = [`${title}  (${opts.items.length})`];
  opts.items.forEach((it, i) => {
    const branch = i === opts.items.length - 1 ? "└─" : "├─";
    lines.push(`${branch} ${it.label}  ${usdcDec(it.allocated)}  ${it.status}`);
  });
  return lines.join("\n");
}
