// OAuth 2.1 AS helpers: discovery metadata and the short-lived signed "authorize request" token
// that carries the validated authorize params from /authorize to the consent screen and back
// (so the browser can't tamper with client_id / redirect_uri / PKCE between the two steps).
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export function protectedResourceMetadata() {
  const url = env().connectorUrl;
  return {
    resource: `${url}/api/mcp`,
    authorization_servers: [url],
    bearer_methods_supported: ["header"],
    resource_name: "Quaestor mandate connector",
    resource_documentation: `${url}/`,
  };
}

export function authServerMetadata() {
  const url = env().connectorUrl;
  return {
    issuer: url,
    authorization_endpoint: `${url}/api/oauth/authorize`,
    token_endpoint: `${url}/api/oauth/token`,
    registration_endpoint: `${url}/api/oauth/register`,
    revocation_endpoint: `${url}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    scopes_supported: ["mandate"],
  };
}

export interface AuthReq {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scope?: string;
}

const AUTHREQ_TTL_SEC = 10 * 60;

export async function signAuthReq(a: AuthReq): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ typ: "authreq", ...a })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + AUTHREQ_TTL_SEC)
    .sign(env().jwtSecret);
}

export async function verifyAuthReq(token: string): Promise<AuthReq> {
  const { payload } = await jwtVerify(token, env().jwtSecret);
  if (payload.typ !== "authreq") throw new Error("not an authreq token");
  const a = payload as unknown as AuthReq;
  if (!a.clientId || !a.redirectUri || !a.codeChallenge) throw new Error("authreq missing fields");
  return a;
}
