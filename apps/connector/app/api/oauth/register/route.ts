export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dynamic Client Registration (RFC 7591). claude.ai registers itself here. We only accept clients
// whose redirect_uris are all on the allowlist (claude.ai's callback is always allowed).
import { randomToken } from "@/lib/tokens";
import { insertClient } from "@/lib/db";
import { isAllowedRedirect } from "@/lib/env";
import { json, oauthError, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return oauthError(400, "invalid_client_metadata", "body must be JSON");
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
  if (redirectUris.length === 0) {
    return oauthError(400, "invalid_redirect_uri", "redirect_uris is required");
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirect(uri)) {
      return oauthError(400, "invalid_redirect_uri", `redirect_uri not allowed: ${uri}`);
    }
  }

  const clientId = `qc_${randomToken(16)}`;
  const grantTypes =
    Array.isArray(body.grant_types) && body.grant_types.length
      ? (body.grant_types as string[])
      : ["authorization_code", "refresh_token"];

  await insertClient({
    client_id: clientId,
    client_secret_hash: null, // public client; PKCE is required
    client_name: typeof body.client_name === "string" ? body.client_name : null,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: grantTypes,
  });

  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: grantTypes,
      response_types: ["code"],
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    },
    { status: 201 }
  );
}
