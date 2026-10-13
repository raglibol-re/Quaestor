// Token primitives: access-token JWTs (HS256), opaque code/refresh tokens, hashing, and PKCE.
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";
import type { NodeBinding } from "./db";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** PKCE S256: base64url(sha256(verifier)) must equal the stored challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed.length === challenge.length && computed === challenge;
}

export const ACCESS_TTL_SEC = 15 * 60; // short-lived
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export interface AccessClaims extends JWTPayload {
  chain: string;
  project: string;
  node: string;
  cid: string; // client_id
  jti: string;
}

/** Sign a node-bound access token. Returns the JWT and its jti/expiry for the token store. */
export async function signAccessToken(
  b: NodeBinding,
  clientId: string,
  ttlSec = ACCESS_TTL_SEC
): Promise<{ jwt: string; jti: string; expiresAt: Date }> {
  const jti = randomToken(16);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;
  const issuer = env().connectorUrl;
  const jwt = await new SignJWT({
    chain: b.chain,
    project: b.project,
    node: b.mandate_node,
    cid: clientId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(b.mandate_node)
    .setIssuer(issuer)
    .setAudience(issuer)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(env().jwtSecret);
  return { jwt, jti, expiresAt: new Date(exp * 1000) };
}

/** Verify signature + standard claims. Does NOT check jti revocation (caller does, via the store). */
export async function verifyAccessToken(jwt: string): Promise<AccessClaims> {
  const issuer = env().connectorUrl;
  const { payload } = await jwtVerify(jwt, env().jwtSecret, { issuer, audience: issuer });
  const c = payload as AccessClaims;
  if (!c.chain || !c.project || !c.node || !c.jti) throw new Error("token missing node binding");
  return c;
}
