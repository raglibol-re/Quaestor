// Streamable-HTTP transport for the Quaestor MCP server, in STATELESS mode
// (sessionIdGenerator: undefined): a fresh McpServer + transport per request, bound to the
// context resolved for that request. This is the reusable core the remote host (apps/connector)
// drives behind OAuth; `startDevHttpServer` below is a bare, single-tenant dev harness for the
// MCP Inspector (identity still from env — token→context resolution arrives in Paket 2).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./buildServer";
import { buildOps, type BuiltOps } from "./opsFactory";

/**
 * Handle a single stateless MCP request for an already-resolved context. Builds a per-request
 * server+transport, processes the request, and tears both down when the response closes.
 * `parsedBody` may be passed when the caller already read the JSON body (e.g. a web framework).
 */
export async function handleStatelessMcpRequest(
  built: BuiltOps,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown
): Promise<void> {
  const server = buildServer(built);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}

/** Respond to a non-POST method on the MCP endpoint (no sessions → 405). */
function methodNotAllowed(res: ServerResponse): void {
  res.writeHead(405, { Allow: "POST", "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST /mcp." },
      id: null,
    })
  );
}

/**
 * Minimal single-tenant dev server for local smoke-testing with the MCP Inspector over HTTP.
 * Identity comes from env (same as stdio) — NOT the multi-tenant, token-bound path. Do not deploy.
 */
export async function startDevHttpServer(port = Number(process.env.PORT) || 8787): Promise<void> {
  const built = await buildOps();
  const http = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/mcp")) {
      if (req.method === "POST") {
        handleStatelessMcpRequest(built, req, res).catch((e) => {
          if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }));
          console.error("[quaestor-mcp-http] request error:", (e as Error)?.message ?? e);
        });
        return;
      }
      return methodNotAllowed(res);
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  http.listen(port, () => console.error(`[quaestor-mcp-http] dev server on http://localhost:${port}/mcp`));
}
