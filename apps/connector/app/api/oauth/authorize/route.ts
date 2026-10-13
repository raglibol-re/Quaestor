export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authorization endpoint. Validates the request (client, redirect, PKCE S256), then hands off to
// the consent screen with a signed authreq token so the browser can't tamper with the params.
import { getClient } from "@/lib/db";
import { env } from "@/lib/env";
import { signAuthReq } from "@/lib/oauth";
import { oauthError } from "@/lib/http";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = u.searchParams;
  const responseType = p.get("response_type");
  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const codeChallenge = p.get("code_challenge") ?? "";
  const method = p.get("code_challenge_method") ?? "";
  const state = p.get("state") ?? undefined;
  const scope = p.get("scope") ?? undefined;

  const client = await getClient(clientId);
  if (!client) return oauthError(400, "invalid_client", "unknown client_id");
  if (!client.redirect_uris.includes(redirectUri)) {
    return oauthError(400, "invalid_request", "redirect_uri not registered for this client");
  }

  // From here, errors redirect back to the client with ?error=...
  const back = (error: string, description: string) => {
    const r = new URL(redirectUri);
    r.searchParams.set("error", error);
    r.searchParams.set("error_description", description);
    if (state) r.searchParams.set("state", state);
    return Response.redirect(r.toString(), 302);
  };
  if (responseType !== "code") return back("unsupported_response_type", "only response_type=code");
  if (!codeChallenge || method !== "S256") return back("invalid_request", "PKCE S256 code_challenge required");

  const rt = await signAuthReq({ clientId, redirectUri, codeChallenge, state, scope });
  return Response.redirect(`${env().connectorUrl}/consent?rt=${encodeURIComponent(rt)}`, 302);
}
