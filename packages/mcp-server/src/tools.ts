// Tool registration for the Quaestor MCP server — transport-agnostic.
// `registerTools`/`registerDeskTools` take an McpServer and a backend (ChainOps/DeskOps)
// and register the user-facing tools. This module has NO side effects on import, so it is
// safe for both the stdio entry (server.ts) and the remote HTTP host (apps/connector).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  baseUnitsString,
  formatUSDC,
  renderBudget,
  renderBudgetList,
  renderRejection,
  renderResult,
  toBaseUnits,
  type BudgetView,
  type SubagentView,
} from "@quaestor/sdk";
import { z } from "zod";
import { BudgetRejection, type ChainOps } from "./chainOps";
import type { DeskOps } from "./deskOps";
import { x402Fetch } from "./x402";

// Brand money (two decimals, comma thousands + USDC) from a decimal-USDC string.
const usdc = (decimal: string) => formatUSDC(toBaseUnits(decimal), { unit: true });
const short = (a: string, n = 4) => (a.length <= 2 * n + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`);

// Quaestor app icon (ring-and-fork mark on a Basalt tile) for the MCP host UI.
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="12" fill="#121110"/>' +
  '<g transform="translate(9 9) scale(0.72)" fill="none" stroke="#4fb39a">' +
  '<circle cx="28" cy="28" r="19" stroke-width="6"/>' +
  '<path d="M41 41 L50 50 M50 50 H59 M50 50 V59" stroke-width="5" stroke-linecap="square"/>' +
  '<rect x="56" y="47" width="6" height="6" fill="#4fb39a" stroke="none"/>' +
  '<rect x="47" y="56" width="6" height="6" fill="#4fb39a" stroke="none"/></g></svg>';
export const ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function okResult(text: string, structuredContent?: Record<string, unknown>) {
  const base = { content: [{ type: "text" as const, text }] };
  return structuredContent ? { ...base, structuredContent } : base;
}
function errResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
// Return the data as structuredContent, with a readable JSON text fallback.
function jsonResult(obj: unknown) {
  return okResult(JSON.stringify(obj, null, 2), isRecord(obj) ? obj : { result: obj });
}
// A budget-limit refusal, in the brand's REJECTED-onchain shape. When the
// backend surfaced the governing numbers (BudgetRejection), show aligned
// requested/available/limit rows; otherwise just the reason.
function rejected(ops: ChainOps, e: unknown) {
  if (e instanceof BudgetRejection && (e.details.requested || e.details.available || e.details.limit)) {
    return errResult(
      renderRejection({
        reason: e.message,
        requested: e.details.requested,
        available: e.details.available,
        limit: e.details.limit,
        next: "reduce the amount, or request a larger mandate from your parent agent.",
      })
    );
  }
  return errResult(
    renderResult({
      state: "REJECTED",
      sentence: `onchain. ${ops.toFriendlyError(e)}`,
      next: "reduce the amount, or request a larger budget from your parent agent.",
    })
  );
}

export function registerTools(server: McpServer, ops: ChainOps) {
  server.registerTool(
    "get_my_mandate",
    {
      title: "Get mandate",
      annotations: { readOnlyHint: true },
      description:
        "Show this agent's mandate: available balance, allocated/spent, per-transaction and daily limits, status and expiry. Amounts are in USDC.",
      inputSchema: {},
    },
    async () => {
      try {
        const view = (await ops.getMyBudget()) as BudgetView;
        return okResult(renderBudget(view), view as unknown as Record<string, unknown>);
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "pay",
    {
      title: "Request spend",
      annotations: { destructiveHint: true },
      description:
        "Send USDC from this agent's mandate to a recipient wallet. Enforced onchain: per-transaction limit, daily limit, available balance, allowlist, and freeze/expiry of this mandate or any ancestor.",
      inputSchema: {
        recipient: z.string().describe("Recipient wallet address (base58)."),
        amount_usdc: z.string().describe('Amount in USDC as a decimal string, e.g. "0.50".'),
        memo: z
          .string()
          .optional()
          .describe(
            "Optional reason for this spend (attribution). Plaintext is logged off-chain; a sha256 hash is written onchain via a memo so the spend is auditable."
          ),
        task_id: z
          .string()
          .optional()
          .describe("Optional task id to attribute this spend to (for cost-per-task accounting)."),
      },
    },
    async ({ recipient, amount_usdc, memo, task_id }) => {
      try {
        const r = await ops.pay(recipient, amount_usdc, { taskId: task_id, reason: memo });
        const amt = usdc(r.amount);
        const rows = [
          { key: "recipient", value: r.recipient },
          { key: "amount", value: amt, align: "right" as const },
          ...(r.taskId ? [{ key: "task", value: r.taskId }] : []),
          ...(r.reason ? [{ key: "reason", value: r.reason }] : []),
          { key: "signature", value: r.signature },
        ];
        return okResult(
          renderResult({
            state: "APPROVED",
            sentence: `onchain. Spent ${amt} to ${short(r.recipient)}.`,
            rows,
          }),
          {
            status: "approved",
            recipient: r.recipient,
            amount: r.amount,
            amount_base_units: baseUnitsString(toBaseUnits(r.amount)),
            task_id: r.taskId ?? null,
            reason: r.reason ?? null,
            signature: r.signature,
          }
        );
      } catch (e) {
        return rejected(ops, e);
      }
    }
  );

  server.registerTool(
    "create_submandate",
    {
      title: "Delegate mandate",
      annotations: { destructiveHint: true },
      description:
        "Carve a sub-mandate from this agent's mandate for a new subagent. Limits cannot exceed this agent's own limits (monotone tightening). Returns the new agent name and a ready-to-paste MCP config snippet for it.",
      inputSchema: {
        label: z.string().describe("Human label, e.g. \"research-agent\"."),
        amount_usdc: z.string().describe("Amount to allocate, in USDC."),
        per_tx_limit_usdc: z.string().optional().describe("Optional per-transaction cap, in USDC."),
        daily_limit_usdc: z.string().optional().describe("Optional rolling 24h cap, in USDC."),
        can_delegate: z.boolean().optional().describe("May the subagent create its own subagents? Default false."),
        expires_in_hours: z.number().optional().describe("Optional expiry, in hours from now."),
        allowlist: z.array(z.string()).optional().describe("Optional list of allowed recipient wallets."),
      },
    },
    async (args) => {
      try {
        const r = await ops.createSubagentBudget({
          label: args.label,
          amountUsdc: args.amount_usdc,
          perTxLimitUsdc: args.per_tx_limit_usdc,
          dailyLimitUsdc: args.daily_limit_usdc,
          canDelegate: args.can_delegate,
          expiresInHours: args.expires_in_hours,
          allowlist: args.allowlist,
        });
        const amt = usdc(args.amount_usdc);
        return okResult(
          renderResult({
            state: "DELEGATED",
            sentence: `Delegated ${amt} to subagent "${args.label}".`,
            rows: [
              { key: "agent", value: r.agentName },
              { key: "agent key", value: r.agentPubkey },
              { key: "mandate", value: r.budget },
              { key: "allocated", value: amt, align: "right" },
              { key: "signature", value: r.signature },
            ],
          }) + `\n\nMCP config snippet for the subagent:\n${r.configSnippet}`,
          {
            status: "delegated",
            label: args.label,
            agent_name: r.agentName,
            agent_pubkey: r.agentPubkey,
            mandate: r.budget,
            allocated: args.amount_usdc,
            allocated_base_units: baseUnitsString(toBaseUnits(args.amount_usdc)),
            signature: r.signature,
          }
        );
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "list_subagents",
    {
      title: "List subagents",
      annotations: { readOnlyHint: true },
      description: "List this agent's direct sub-mandates with their status and balances.",
      inputSchema: {},
    },
    async () => {
      try {
        const items = (await ops.listSubagents()) as SubagentView[];
        return okResult(renderBudgetList({ title: "subagents", items }), { subagents: items });
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "freeze_subagent",
    {
      title: "Freeze branch",
      annotations: { destructiveHint: true },
      description:
        "Freeze (or unfreeze) one of your subagents, instantly blocking it and its whole subtree. Enforced onchain — you may do this to any of your own descendants (ancestor-agent authority).",
      inputSchema: {
        label: z.string().describe("Label of the subagent."),
        unfreeze: z.boolean().optional().describe("Set true to unfreeze instead of freeze."),
      },
    },
    async ({ label, unfreeze }) => {
      try {
        const r = await ops.freezeSubagent(label, !unfreeze);
        const isFrozen = /froz/i.test(r.status);
        return okResult(
          renderResult({
            state: isFrozen ? "FROZEN" : "RELEASED",
            sentence: `Branch "${label}" ${isFrozen ? "frozen" : "unfrozen"} onchain.`,
            rows: [{ key: "signature", value: r.signature }],
          }),
          { status: r.status, label, signature: r.signature }
        );
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "revoke_subagent",
    {
      title: "Revoke subagent",
      annotations: { destructiveHint: true },
      description: "Permanently revoke a subagent (terminal). Requires project-owner authority.",
      inputSchema: { label: z.string().describe("Label of the subagent.") },
    },
    async ({ label }) => {
      try {
        const r = await ops.revokeSubagent(label);
        return okResult(
          renderResult({
            state: "REVOKED",
            sentence: `Subagent "${label}" revoked onchain.`,
            rows: [{ key: "signature", value: r.signature }],
          }),
          { status: "revoked", label, signature: r.signature }
        );
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "reclaim_subagent",
    {
      title: "Reclaim funds",
      annotations: { destructiveHint: true },
      description:
        "Reclaim a revoked/expired subagent's unused funds back into this agent's available balance.",
      inputSchema: { label: z.string().describe("Label of the subagent.") },
    },
    async ({ label }) => {
      try {
        const r = await ops.reclaimSubagent(label);
        const amt = usdc(r.reclaimed);
        return okResult(
          renderResult({
            state: "RELEASED",
            sentence: `Reclaimed ${amt} from "${label}".`,
            rows: [
              { key: "reclaimed", value: amt, align: "right" },
              { key: "signature", value: r.signature },
            ],
          }),
          {
            status: "reclaimed",
            label,
            reclaimed: r.reclaimed,
            reclaimed_base_units: baseUnitsString(toBaseUnits(r.reclaimed)),
            signature: r.signature,
          }
        );
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "get_history",
    {
      title: "Recent transactions",
      annotations: { readOnlyHint: true },
      description: "List recent transactions touching this agent's mandate account.",
      inputSchema: { limit: z.number().optional().describe("Max entries (default 10).") },
    },
    async ({ limit }) => {
      try {
        return jsonResult(await ops.getHistory(limit ?? 10));
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "pay_x402",
    {
      title: "Pay for a paywalled resource (x402)",
      annotations: { destructiveHint: true, openWorldHint: true },
      description:
        "Fetch an HTTP URL that may require payment via the x402 protocol. Two-step by default: the " +
        "FIRST call PREVIEWS the charge — on an HTTP 402 it returns the exact amount and merchant and " +
        "pays NOTHING. Call again with confirm: true to pay the required USDC DIRECTLY FROM THIS AGENT'S " +
        "QUAESTOR MANDATE (mandate-enforced onchain: per-transaction limit, daily limit, available " +
        "balance, allowlist, and freeze/expiry of this mandate or any ancestor), then retry with the " +
        "onchain payment proof and return the resource. A per-call ceiling (max_amount_usdc, plus the " +
        "QUAESTOR_X402_MAX_USDC server cap) is enforced before any payment. If a limit rejects the " +
        "payment, the resource is NOT fetched and the reason is returned.",
      inputSchema: {
        url: z.string().describe("The URL of the (possibly paywalled) resource to fetch."),
        confirm: z
          .boolean()
          .optional()
          .describe("Set true to actually pay. Omit/false to preview the required amount first (no payment)."),
        max_amount_usdc: z
          .string()
          .optional()
          .describe("Optional per-call ceiling in USDC. If the required amount exceeds it, nothing is paid."),
      },
    },
    async ({ url, confirm, max_amount_usdc }) => {
      try {
        const r = await x402Fetch(ops, url, { confirm: confirm === true, maxAmountUsdc: max_amount_usdc });
        const bodyStr = typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2);
        if (r.preflight) {
          const amt = usdc(r.preflight.amount);
          return okResult(
            renderResult({
              state: "REVIEW",
              sentence: `Payment required: ${amt} to ${short(r.preflight.payTo)} for ${url}.`,
              rows: [
                { key: "amount", value: amt, align: "right" },
                { key: "pay to", value: r.preflight.payTo },
                ...(r.preflight.description ? [{ key: "for", value: r.preflight.description }] : []),
                { key: "network", value: r.preflight.network },
              ],
              next: "re-run pay_x402 with confirm: true to pay this from your mandate (limits still apply).",
            }),
            {
              status: "payment_required",
              url,
              amount: r.preflight.amount,
              amount_base_units: baseUnitsString(toBaseUnits(r.preflight.amount)),
              pay_to: r.preflight.payTo,
              network: r.preflight.network,
              confirm_required: true,
            }
          );
        }
        if (r.payment) {
          const amt = usdc(r.payment.amount);
          return okResult(
            renderResult({
              state: "APPROVED",
              sentence: `onchain. Paid ${amt} to ${short(r.payment.payTo)} for ${url}.`,
              rows: [
                { key: "amount", value: amt, align: "right" },
                { key: "pay to", value: r.payment.payTo },
                { key: "proof", value: r.payment.txHash },
                { key: "http", value: String(r.status) },
              ],
            }) + `\n\nResource:\n${bodyStr}`,
            {
              status: "approved",
              url,
              amount: r.payment.amount,
              amount_base_units: baseUnitsString(toBaseUnits(r.payment.amount)),
              pay_to: r.payment.payTo,
              proof: r.payment.txHash,
              http_status: r.status,
            }
          );
        }
        return okResult(`Fetched ${url} (HTTP ${r.status}) — no payment required.\n\n${bodyStr}`, {
          status: "ok",
          url,
          http_status: r.status,
          payment_required: false,
        });
      } catch (e) {
        return rejected(ops, e);
      }
    }
  );
}

// A desk policy refusal, in the brand's REJECTED-onchain shape (desk errors are plain viem
// reverts, not BudgetRejection, so there are no requested/available/limit numbers to align).
function deskRejected(desk: DeskOps, e: unknown) {
  return errResult(
    renderResult({
      state: "REJECTED",
      sentence: `onchain. ${desk.toFriendlyError(e)}`,
      next: "adjust the order to fit the mandate's limits, or ask the principal to widen the mandate.",
    })
  );
}

interface MandateView {
  mandateId: string;
  principal: string;
  agent: string;
  status: string;
  allowedAssets: number[];
  deposited: string;
  maxNotionalPerOrder: string | null;
  maxNotionalPerDay: string | null;
  dayNotionalUsed: string;
  equityFloor: string | null;
  expiresAt: number | null;
}

/** Register the Hyperliquid trading-desk tools (QUAESTOR_CHAIN=hyperliquid). */
export function registerDeskTools(server: McpServer, desk: DeskOps) {
  server.registerTool(
    "get_my_mandate",
    {
      title: "Get trading mandate",
      annotations: { readOnlyHint: true },
      description:
        "Show this agent's Hyperliquid trading mandate: allowed asset indices, max notional per order and per rolling 24h, equity floor (drawdown stop), day notional used, status and expiry.",
      inputSchema: {},
    },
    async () => {
      try {
        const m = (await desk.getMyMandate()) as MandateView;
        const rows = [
          { key: "principal", value: m.principal },
          { key: "agent", value: m.agent },
          { key: "assets", value: m.allowedAssets.length ? m.allowedAssets.join(", ") : "none" },
          { key: "deposited", value: `${m.deposited} USDC`, align: "right" as const },
          { key: "max/order", value: m.maxNotionalPerOrder ?? "unlimited", align: "right" as const },
          { key: "max/day", value: m.maxNotionalPerDay ?? "unlimited", align: "right" as const },
          { key: "day used", value: m.dayNotionalUsed, align: "right" as const },
          { key: "equity floor", value: m.equityFloor ?? "none", align: "right" as const },
          ...(m.expiresAt ? [{ key: "expires", value: String(m.expiresAt) }] : []),
        ];
        return okResult(
          renderResult({
            state: m.status.toUpperCase(),
            sentence: `trading mandate for ${short(m.agent)}.`,
            rows,
          }),
          m as unknown as Record<string, unknown>
        );
      } catch (e) {
        return errResult(desk.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "place_order",
    {
      title: "Place order",
      annotations: { destructiveHint: true },
      description:
        "Place a limit order on Hyperliquid through this agent's desk mandate. Enforced onchain BEFORE the order is sent to HyperCore: allowed-asset list, max notional per order, max notional per rolling 24h, equity floor (drawdown stop), and freeze/expiry of the mandate.",
      inputSchema: {
        asset: z.number().int().describe("HyperCore asset index to trade."),
        is_buy: z.boolean().describe("true = buy/long, false = sell/short."),
        price: z.string().describe("Limit price in HyperCore uint64 units (integer string)."),
        size: z.string().describe("Order size in HyperCore uint64 units (integer string)."),
        tif: z.number().int().optional().describe("Time-in-force byte (default GTC)."),
        cloid: z.string().optional().describe("Optional client order id (uint64 integer string)."),
        task_id: z
          .string()
          .optional()
          .describe("Optional task id to attribute this trade to (for cost-per-task accounting)."),
        reason: z
          .string()
          .optional()
          .describe(
            "Optional reason for this trade (attribution). Plaintext is logged off-chain; a keccak256 hash is written onchain in the OrderPlaced event so the trade is auditable."
          ),
      },
    },
    async ({ asset, is_buy, price, size, tif, cloid, task_id, reason }) => {
      try {
        const r = await desk.placeOrder({
          asset,
          isBuy: is_buy,
          px: price,
          sz: size,
          tif,
          cloid,
          taskId: task_id,
          reason,
        });
        const side = r.isBuy ? "BUY" : "SELL";
        const rows = [
          { key: "asset", value: String(r.asset) },
          { key: "side", value: side },
          { key: "price", value: r.px, align: "right" as const },
          { key: "size", value: r.sz, align: "right" as const },
          { key: "notional", value: r.notional, align: "right" as const },
          ...(r.taskId ? [{ key: "task", value: r.taskId }] : []),
          ...(r.reason ? [{ key: "reason", value: r.reason }] : []),
          { key: "tx", value: r.signature },
        ];
        return okResult(
          renderResult({
            state: "APPROVED",
            sentence: `onchain. ${side} ${r.sz} of asset ${r.asset} @ ${r.px} (notional ${r.notional}).`,
            rows,
          }),
          {
            status: "approved",
            asset: r.asset,
            is_buy: r.isBuy,
            price: r.px,
            size: r.sz,
            notional: r.notional,
            task_id: r.taskId ?? null,
            reason: r.reason ?? null,
            tx: r.signature,
          }
        );
      } catch (e) {
        return deskRejected(desk, e);
      }
    }
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel order",
      description:
        "Cancel a resting order on Hyperliquid through this agent's desk mandate, by exchange oid or by client cloid.",
      inputSchema: {
        asset: z.number().int().describe("HyperCore asset index of the order."),
        oid_or_cloid: z.string().describe("The exchange oid, or the client cloid if by_cloid=true (uint64 integer string)."),
        by_cloid: z.boolean().optional().describe("Set true to cancel by client cloid instead of exchange oid."),
      },
    },
    async ({ asset, oid_or_cloid, by_cloid }) => {
      try {
        const r = await desk.cancelOrder({ asset, oidOrCloid: oid_or_cloid, byCloid: !!by_cloid });
        return okResult(
          renderResult({
            state: "CANCELLED",
            sentence: `onchain. Cancelled ${r.byCloid ? "cloid" : "oid"} ${r.oidOrCloid} on asset ${r.asset}.`,
            rows: [
              { key: "asset", value: String(r.asset) },
              { key: r.byCloid ? "cloid" : "oid", value: r.oidOrCloid },
              { key: "tx", value: r.signature },
            ],
          }),
          { status: "cancelled", asset: r.asset, oid_or_cloid: r.oidOrCloid, by_cloid: r.byCloid, tx: r.signature }
        );
      } catch (e) {
        return deskRejected(desk, e);
      }
    }
  );

  server.registerTool(
    "freeze_mandate",
    {
      title: "Freeze mandate",
      annotations: { destructiveHint: true },
      description:
        "Freeze (or unfreeze) this trading mandate, instantly halting all order placement. Enforced onchain (principal/owner authority).",
      inputSchema: {
        unfreeze: z.boolean().optional().describe("Set true to unfreeze instead of freeze."),
      },
    },
    async ({ unfreeze }) => {
      try {
        const r = await desk.setStatus(!unfreeze);
        const isFrozen = /froz/i.test(r.status);
        return okResult(
          renderResult({
            state: isFrozen ? "FROZEN" : "RELEASED",
            sentence: `Mandate ${isFrozen ? "frozen" : "unfrozen"} onchain.`,
            rows: [{ key: "tx", value: r.signature }],
          }),
          { status: r.status, tx: r.signature }
        );
      } catch (e) {
        return errResult(desk.toFriendlyError(e));
      }
    }
  );
}
