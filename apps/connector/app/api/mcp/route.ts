export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The remote MCP endpoint. Stateless Streamable HTTP: authenticate the bearer token, resolve the
// ONE mandate node it is bound to, build a per-request server acting as that node, and handle the
// JSON-RPC. No tool input can change the acting agent — identity comes only from the token.
import { handleMcpWeb } from "@quaestor/mcp-server";
import { principalFromBearer } from "@/lib/resolve";
import { remoteBuiltOps } from "@/lib/remoteOps";
import { env } from "@/lib/env";
import { cors, preflight } from "@/lib/http";

function jsonRpc(status: number, code: number, message: string, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...cors(), ...(extra ?? {}) },
  });
}

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  // 1. Authenticate — on failure, point the client at the resource metadata so it can start OAuth.
  let principal;
  try {
    principal = await principalFromBearer(req.headers.get("authorization"));
  } catch {
    const rm = `${env().connectorUrl}/.well-known/oauth-protected-resource`;
    return jsonRpc(401, -32001, "unauthorized", {
      "WWW-Authenticate": `Bearer resource_metadata="${rm}"`,
    });
  }

  // 2. Resolve the node's custodied backend. Internal errors never leak details to the client.
  let built;
  try {
    built = await remoteBuiltOps(principal);
  } catch (e) {
    console.error("[mcp] resolve error:", (e as Error)?.message ?? e);
    return jsonRpc(500, -32603, "internal error");
  }

  // 3. Handle the JSON-RPC via the stateless transport, then add CORS to the response.
  const res = await handleMcpWeb(built, req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors())) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function GET() {
  return jsonRpc(405, -32000, "Method not allowed. Use POST.", { Allow: "POST" });
}

export function DELETE() {
  return jsonRpc(405, -32000, "Method not allowed. Use POST.", { Allow: "POST" });
}
