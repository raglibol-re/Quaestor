// Shared HTTP helpers for the connector routes: JSON responses + permissive CORS (the OAuth
// discovery/token and MCP endpoints are called cross-origin by claude.ai).
export function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...cors(), ...(init?.headers ?? {}) },
  });
}

export function oauthError(status: number, error: string, description?: string): Response {
  return json(description ? { error, error_description: description } : { error }, { status });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: cors() });
}
