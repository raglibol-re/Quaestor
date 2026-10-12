#!/usr/bin/env node
// Dev-only Streamable-HTTP entry: single-tenant (identity from env, like stdio) so the
// transport can be smoke-tested with the MCP Inspector over HTTP before OAuth lands.
// Run: `node dist/httpDev.js` (or `pnpm --filter @quaestor/mcp-server start:http`).
import { startDevHttpServer } from "./httpServer";

startDevHttpServer().catch((e) => {
  console.error("[quaestor-mcp-http] fatal:", (e as Error)?.message ?? e);
  process.exit(1);
});
