export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token endpoint: authorization_code (+ PKCE S256) and refresh_token (rotated). Every issued token
// carries the (chain, project, mandate_node) binding from the code/refresh row — never from input.
import {
  consumeAuthCode,
  getRefresh,
  insertAccessToken,
  insertRefresh,
  revokeRefresh,
  type NodeBinding,
} from "@/lib/db";
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_SEC,
  randomToken,
  sha256hex,
  signAccessToken,
  verifyPkceS256,
} from "@/lib/tokens";
import { json, oauthError, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  const text = await req.text();
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text) as Record<string, string>;
    } catch {
      return {};
    }
  }
  const out: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => (out[k] = v));
  return out;
}

async function issue(b: NodeBinding, clientId: string, rotatedFrom?: string): Promise<Response> {
  const { jwt, jti, expiresAt } = await signAccessToken(b, clientId);
  await insertAccessToken(jti, b, clientId, expiresAt.toISOString());

  const refresh = randomToken(32);
  const refreshExp = new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString();
  await insertRefresh(
    { token_hash: sha256hex(refresh), client_id: clientId, ...b, expires_at: refreshExp },
    rotatedFrom
  );

  return json({
    access_token: jwt,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refresh,
    scope: "mandate",
  });
}

export async function POST(req: Request) {
  const p = await readParams(req);
  const grant = p.grant_type;

  if (grant === "authorization_code") {
    const { code, code_verifier, client_id, redirect_uri } = p;
    if (!code || !code_verifier || !client_id) {
      return oauthError(400, "invalid_request", "code, code_verifier, client_id required");
    }
    const row = await consumeAuthCode(sha256hex(code));
    if (!row) return oauthError(400, "invalid_grant", "code invalid, expired, or already used");
    if (row.client_id !== client_id) return oauthError(400, "invalid_grant", "client mismatch");
    if (redirect_uri && row.redirect_uri !== redirect_uri) {
      return oauthError(400, "invalid_grant", "redirect_uri mismatch");
    }
    if (!verifyPkceS256(code_verifier, row.code_challenge)) {
      return oauthError(400, "invalid_grant", "PKCE verification failed");
    }
    return issue({ chain: row.chain, project: row.project, mandate_node: row.mandate_node }, client_id);
  }

  if (grant === "refresh_token") {
    const { refresh_token, client_id } = p;
    if (!refresh_token) return oauthError(400, "invalid_request", "refresh_token required");
    const hash = sha256hex(refresh_token);
    const row = await getRefresh(hash);
    if (!row || row.revoked || Date.parse(row.expires_at) < Date.now()) {
      return oauthError(400, "invalid_grant", "refresh token invalid, expired, or revoked");
    }
    if (client_id && row.client_id !== client_id) {
      return oauthError(400, "invalid_grant", "client mismatch");
    }
    await revokeRefresh(hash); // rotate: old refresh is now dead
    return issue(
      { chain: row.chain, project: row.project, mandate_node: row.mandate_node },
      row.client_id,
      hash
    );
  }

  return oauthError(400, "unsupported_grant_type", "use authorization_code or refresh_token");
}
