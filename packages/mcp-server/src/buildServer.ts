// Transport-agnostic server factory. Given a resolved backend (BuiltOps for exactly one
// agent/mandate), build an McpServer with the Quaestor tools registered. No transport, no
// env, no key handling here — callers (stdio entry, remote HTTP host) own those.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BuiltOps } from "./opsFactory";
import { ICON_DATA_URI, registerDeskTools, registerTools } from "./tools";

/** Build a fresh McpServer with the tools for exactly one resolved agent context. */
export function buildServer(built: BuiltOps): McpServer {
  const server = new McpServer({
    name: "quaestor",
    version: "0.1.0",
    title: "Quaestor",
    icons: [{ src: ICON_DATA_URI, mimeType: "image/svg+xml", sizes: ["any"] }],
  });
  if (built.kind === "desk") {
    registerDeskTools(server, built.desk);
  } else {
    registerTools(server, built.ops);
  }
  return server;
}

/** One-line description of the resolved backend (for startup/request logs). */
export function describeOps(built: BuiltOps): string {
  return built.kind === "desk" ? built.desk.describe() : built.ops.describe();
}
