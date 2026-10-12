#!/usr/bin/env node
// stdio entry for the Quaestor MCP server — one process per agent, identity from env + the
// local keystore (unchanged). The reusable server/tools now live in buildServer.ts / tools.ts
// so the same tools can run behind the remote HTTP transport (see index.ts / httpServer.ts).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, describeOps } from "./buildServer";
import { buildOps } from "./opsFactory";

async function main() {
  const built = await buildOps();
  console.error(`[quaestor-mcp] ${describeOps(built)}`);
  const server = buildServer(built);
  await server.connect(new StdioServerTransport());
  console.error("[quaestor-mcp] ready");
}

main().catch((e) => {
  console.error("[quaestor-mcp] fatal:", e?.message ?? e);
  process.exit(1);
});
