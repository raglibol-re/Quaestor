#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ChainOps } from "./chainOps";
import { buildChainOps } from "./opsFactory";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function errResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
function jsonResult(obj: unknown) {
  return textResult(JSON.stringify(obj, null, 2));
}

function registerTools(server: McpServer, ops: ChainOps) {
  server.registerTool(
    "get_my_budget",
    {
      title: "Get my budget",
      description:
        "Show this agent's available balance, allocated/spent, per-transaction and daily limits, status and expiry. Amounts are in USDC.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResult(await ops.getMyBudget());
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "pay",
    {
      title: "Pay USDC",
      description:
        "Send USDC from this agent's budget to a recipient wallet. Enforced on-chain: per-transaction limit, daily limit, available balance, allowlist, and freeze/expiry of this budget or any ancestor.",
      inputSchema: {
        recipient: z.string().describe("Recipient wallet address (base58)."),
        amount_usdc: z.string().describe('Amount in USDC as a decimal string, e.g. "0.50".'),
        memo: z.string().optional().describe("Optional human note (not stored on-chain)."),
      },
    },
    async ({ recipient, amount_usdc }) => {
      try {
        const r = await ops.pay(recipient, amount_usdc);
        return textResult(`Paid ${r.amount} USDC to ${r.recipient}.\nSignature: ${r.signature}`);
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "create_subagent_budget",
    {
      title: "Create a sub-agent budget",
      description:
        "Delegate part of this agent's budget to a new sub-agent. Limits cannot exceed this agent's own limits. Returns the new agent name and a ready-to-paste MCP config snippet for it.",
      inputSchema: {
        label: z.string().describe("Human label, e.g. \"research-agent\"."),
        amount_usdc: z.string().describe("Amount to allocate, in USDC."),
        per_tx_limit_usdc: z.string().optional().describe("Optional per-transaction cap, in USDC."),
        daily_limit_usdc: z.string().optional().describe("Optional rolling 24h cap, in USDC."),
        can_delegate: z.boolean().optional().describe("May the sub-agent create its own sub-agents? Default false."),
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
        return textResult(
          `Created sub-agent "${args.label}" (${r.agentName}).\n` +
            `Agent key: ${r.agentPubkey}\nBudget: ${r.budget}\nSignature: ${r.signature}\n\n` +
            `MCP config snippet for the sub-agent:\n${r.configSnippet}`
        );
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "list_subagents",
    {
      title: "List sub-agents",
      description: "List this agent's direct sub-agent budgets with their status and balances.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResult(await ops.listSubagents());
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "freeze_subagent",
    {
      title: "Freeze a sub-agent",
      description:
        "Freeze (or unfreeze) one of your sub-agents, instantly blocking it and its whole sub-tree. Enforced on-chain — you may do this to any of your own descendants (ancestor-agent authority).",
      inputSchema: {
        label: z.string().describe("Label of the sub-agent."),
        unfreeze: z.boolean().optional().describe("Set true to unfreeze instead of freeze."),
      },
    },
    async ({ label, unfreeze }) => {
      try {
        const r = await ops.freezeSubagent(label, !unfreeze);
        return textResult(`Sub-agent "${label}" is now ${r.status}.\nSignature: ${r.signature}`);
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "revoke_subagent",
    {
      title: "Revoke a sub-agent",
      description: "Permanently revoke a sub-agent (terminal). Requires project-owner authority.",
      inputSchema: { label: z.string().describe("Label of the sub-agent.") },
    },
    async ({ label }) => {
      try {
        const r = await ops.revokeSubagent(label);
        return textResult(`Sub-agent "${label}" revoked.\nSignature: ${r.signature}`);
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "reclaim_subagent",
    {
      title: "Reclaim a sub-agent's funds",
      description:
        "Reclaim a revoked/expired sub-agent's unused funds back into this agent's available balance.",
      inputSchema: { label: z.string().describe("Label of the sub-agent.") },
    },
    async ({ label }) => {
      try {
        const r = await ops.reclaimSubagent(label);
        return textResult(`Reclaimed ${r.reclaimed} USDC from "${label}".\nSignature: ${r.signature}`);
      } catch (e) {
        return errResult(ops.toFriendlyError(e));
      }
    }
  );

  server.registerTool(
    "get_history",
    {
      title: "Get recent transactions",
      description: "List recent transactions touching this agent's budget account.",
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
}

async function main() {
  const ops = await buildChainOps();
  console.error(`[quaestor-mcp] ${ops.describe()}`);
  const server = new McpServer({ name: "quaestor", version: "0.1.0" });
  registerTools(server, ops);
  await server.connect(new StdioServerTransport());
  console.error("[quaestor-mcp] ready");
}

main().catch((e) => {
  console.error("[quaestor-mcp] fatal:", e?.message ?? e);
  process.exit(1);
});
