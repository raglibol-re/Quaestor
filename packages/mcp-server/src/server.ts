#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
import { buildChainOps } from "./opsFactory";
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
const ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;

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

function registerTools(server: McpServer, ops: ChainOps) {
  server.registerTool(
    "get_my_mandate",
    {
      title: "Get mandate",
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
      description:
        "Fetch an HTTP URL that may require payment via the x402 protocol. On an HTTP 402 response, " +
        "pay the required USDC DIRECTLY FROM THIS AGENT'S QUAESTOR MANDATE (mandate-enforced onchain: " +
        "per-transaction limit, daily limit, available balance, allowlist, and freeze/expiry of this " +
        "mandate or any ancestor), then retry with the onchain payment proof and return the resource. " +
        "If a mandate limit rejects the payment, the resource is NOT fetched and the reason is returned.",
      inputSchema: {
        url: z.string().describe("The URL of the (possibly paywalled) resource to fetch."),
      },
    },
    async ({ url }) => {
      try {
        const r = await x402Fetch(ops, url);
        const bodyStr = typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2);
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

async function main() {
  const ops = await buildChainOps();
  console.error(`[quaestor-mcp] ${ops.describe()}`);
  const server = new McpServer({
    name: "quaestor",
    version: "0.1.0",
    title: "Quaestor",
    icons: [{ src: ICON_DATA_URI, mimeType: "image/svg+xml", sizes: ["any"] }],
  });
  registerTools(server, ops);
  await server.connect(new StdioServerTransport());
  console.error("[quaestor-mcp] ready");
}

main().catch((e) => {
  console.error("[quaestor-mcp] fatal:", e?.message ?? e);
  process.exit(1);
});
