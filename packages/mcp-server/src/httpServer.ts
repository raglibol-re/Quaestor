// Streamable-HTTP transport for the Quaestor MCP server, in STATELESS mode
// (sessionIdGenerator: undefined): a fresh McpServer + transport per request, bound to the
// context resolved for that request. This is the reusable core the remote host (apps/connector)
// drives behind OAuth; `startDevHttpServer` below is a bare, single-tenant dev harness for the
// MCP Inspector (identity still from env — token→context resolution arrives in Paket 2).
import { EventEmitter } from "node:events";
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

/**
 * Adapt a Web `Request` (Next.js App Router route handler, Node runtime) to the SDK's
 * Node-style Streamable-HTTP transport in stateless JSON mode, returning a Web `Response`.
 * The caller resolves `built` from the authenticated principal (token → mandate node) before
 * calling this. Must run on the Node.js runtime (uses Buffer, node:events, web3/anchor downstream).
 */
export async function handleMcpWeb(built: BuiltOps, request: Request): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let parsedBody: unknown = undefined;
  if (request.method === "POST") {
    const text = await request.text();
    parsedBody = text ? JSON.parse(text) : undefined;
  }

  // Minimal Node-like req: the transport reads only method/headers/url when parsedBody is given.
  const req = new EventEmitter() as unknown as IncomingMessage;
  (req as unknown as { method: string }).method = request.method;
  (req as unknown as { headers: Record<string, string> }).headers = headers;
  (req as unknown as { url: string }).url = new URL(request.url).pathname;

  // Minimal Node-like res: capture status/headers/body, then resolve a Web Response on end().
  let statusCode = 200;
  const resHeaders: Record<string, string> = {};
  const chunks: Buffer[] = [];
  let resolveDone!: (r: Response) => void;
  const done = new Promise<Response>((r) => (resolveDone = r));
  const res = new EventEmitter() as unknown as ServerResponse & { finish?: () => void };
  const r = res as unknown as Record<string, unknown>;
  r.statusCode = 200;
  r.headersSent = false;
  r.writableEnded = false;
  r.setHeader = (k: string, v: unknown) => {
    resHeaders[k.toLowerCase()] = String(v);
    return res;
  };
  r.getHeader = (k: string) => resHeaders[k.toLowerCase()];
  r.removeHeader = (k: string) => {
    delete resHeaders[k.toLowerCase()];
  };
  r.writeHead = (code: number, arg2?: unknown, arg3?: unknown) => {
    statusCode = code;
    const hdrs = (typeof arg2 === "object" && arg2 ? arg2 : arg3) as Record<string, unknown> | undefined;
    if (hdrs) for (const [k, v] of Object.entries(hdrs)) resHeaders[k.toLowerCase()] = String(v);
    r.headersSent = true;
    return res;
  };
  r.write = (chunk: unknown) => {
    if (chunk) chunks.push(Buffer.from(chunk as Uint8Array | string));
    return true;
  };
  r.flushHeaders = () => {};
  r.end = (chunk?: unknown) => {
    if (chunk && typeof chunk !== "function") chunks.push(Buffer.from(chunk as Uint8Array | string));
    r.writableEnded = true;
    const body = Buffer.concat(chunks);
    resolveDone(new Response(body.length ? body : null, { status: statusCode, headers: resHeaders }));
    res.emit("close");
    return res;
  };

  const server = buildServer(built);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
  return done;
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
