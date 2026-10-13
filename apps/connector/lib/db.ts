// Neon Postgres store. Every token/code/invite row carries (chain, project, mandate_node)
// so a credential can only ever address its one node. No secret is stored in plaintext:
// codes/refresh/invite tokens are stored as sha256 hashes; agent keys as envelopes.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";

let _sql: NeonQueryFunction<false, false> | null = null;
function sql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(env().databaseUrl);
  return _sql;
}

export interface OAuthClient {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string | null;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
}

export interface NodeBinding {
  chain: string;
  project: string;
  mandate_node: string;
}

export interface AgentKeyRow {
  chain: string;
  project: string;
  node: string;
  pubkey: string;
  curve: string;
  enc_blob: string;
}

// --- oauth_client ---
export async function insertClient(c: OAuthClient): Promise<void> {
  await sql()`INSERT INTO oauth_client
    (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, grant_types)
    VALUES (${c.client_id}, ${c.client_secret_hash}, ${c.client_name}, ${c.redirect_uris},
            ${c.token_endpoint_auth_method}, ${c.grant_types})`;
}
export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const rows = (await sql()`SELECT client_id, client_secret_hash, client_name, redirect_uris,
    token_endpoint_auth_method, grant_types FROM oauth_client WHERE client_id = ${clientId}`) as OAuthClient[];
  return rows[0] ?? null;
}

// --- auth_code ---
export interface AuthCodeRow extends NodeBinding {
  code_hash: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string | null;
  expires_at: string;
}
export async function insertAuthCode(r: AuthCodeRow): Promise<void> {
  await sql()`INSERT INTO auth_code
    (code_hash, client_id, redirect_uri, code_challenge, scope, chain, project, mandate_node, expires_at)
    VALUES (${r.code_hash}, ${r.client_id}, ${r.redirect_uri}, ${r.code_challenge}, ${r.scope},
            ${r.chain}, ${r.project}, ${r.mandate_node}, ${r.expires_at})`;
}
/** Atomically consume a non-expired, unconsumed code. Returns the row or null. */
export async function consumeAuthCode(codeHash: string): Promise<AuthCodeRow | null> {
  const rows = (await sql()`UPDATE auth_code SET consumed = true
    WHERE code_hash = ${codeHash} AND consumed = false AND expires_at > now()
    RETURNING code_hash, client_id, redirect_uri, code_challenge, scope, chain, project, mandate_node, expires_at`) as AuthCodeRow[];
  return rows[0] ?? null;
}

// --- access_token (jti recorded for revocation) ---
export async function insertAccessToken(jti: string, b: NodeBinding, clientId: string, expiresAt: string): Promise<void> {
  await sql()`INSERT INTO access_token (jti, client_id, chain, project, mandate_node, expires_at)
    VALUES (${jti}, ${clientId}, ${b.chain}, ${b.project}, ${b.mandate_node}, ${expiresAt})`;
}
export async function isAccessRevoked(jti: string): Promise<boolean> {
  const rows = (await sql()`SELECT revoked FROM access_token WHERE jti = ${jti}`) as { revoked: boolean }[];
  // Unknown jti → treat as revoked (fail closed).
  return rows.length === 0 ? true : rows[0].revoked;
}

// --- refresh_token (hashed, rotated) ---
export interface RefreshRow extends NodeBinding {
  token_hash: string;
  client_id: string;
  expires_at: string;
  revoked: boolean;
}
export async function insertRefresh(r: Omit<RefreshRow, "revoked">, rotatedFrom?: string): Promise<void> {
  await sql()`INSERT INTO refresh_token
    (token_hash, client_id, chain, project, mandate_node, rotated_from, expires_at)
    VALUES (${r.token_hash}, ${r.client_id}, ${r.chain}, ${r.project}, ${r.mandate_node},
            ${rotatedFrom ?? null}, ${r.expires_at})`;
}
export async function getRefresh(tokenHash: string): Promise<RefreshRow | null> {
  const rows = (await sql()`SELECT token_hash, client_id, chain, project, mandate_node, expires_at, revoked
    FROM refresh_token WHERE token_hash = ${tokenHash}`) as RefreshRow[];
  return rows[0] ?? null;
}
export async function revokeRefresh(tokenHash: string): Promise<void> {
  await sql()`UPDATE refresh_token SET revoked = true WHERE token_hash = ${tokenHash}`;
}
/** Revoke all access + refresh tokens bound to a node (used by an explicit revoke). */
export async function revokeNode(b: NodeBinding): Promise<void> {
  await sql()`UPDATE access_token SET revoked = true
    WHERE chain = ${b.chain} AND project = ${b.project} AND mandate_node = ${b.mandate_node}`;
  await sql()`UPDATE refresh_token SET revoked = true
    WHERE chain = ${b.chain} AND project = ${b.project} AND mandate_node = ${b.mandate_node}`;
}

// --- invite ---
export interface InviteRow extends NodeBinding {
  token_hash: string;
  parent_node: string;
  child_params: unknown;
  child_node: string | null;
  expires_at: string;
}
export async function insertInvite(r: Omit<InviteRow, "mandate_node"> & { parent_node: string }): Promise<void> {
  await sql()`INSERT INTO invite (token_hash, chain, project, parent_node, child_params, child_node, expires_at)
    VALUES (${r.token_hash}, ${r.chain}, ${r.project}, ${r.parent_node},
            ${JSON.stringify(r.child_params)}, ${r.child_node}, ${r.expires_at})`;
}
export async function getInvite(tokenHash: string): Promise<InviteRow | null> {
  const rows = (await sql()`SELECT token_hash, chain, project, parent_node, child_params, child_node, expires_at
    FROM invite WHERE token_hash = ${tokenHash} AND consumed = false AND expires_at > now()`) as InviteRow[];
  return rows[0] ?? null;
}
export async function consumeInvite(tokenHash: string, childNode: string): Promise<boolean> {
  const rows = (await sql()`UPDATE invite SET consumed = true, child_node = ${childNode}
    WHERE token_hash = ${tokenHash} AND consumed = false AND expires_at > now() RETURNING token_hash`) as { token_hash: string }[];
  return rows.length > 0;
}

// --- agent_key (node → custodied signer key) ---
export async function insertAgentKey(r: AgentKeyRow): Promise<void> {
  await sql()`INSERT INTO agent_key (chain, project, node, pubkey, curve, enc_blob)
    VALUES (${r.chain}, ${r.project}, ${r.node}, ${r.pubkey}, ${r.curve}, ${r.enc_blob})
    ON CONFLICT (chain, project, node) DO NOTHING`;
}
export async function getAgentKey(chain: string, project: string, node: string): Promise<AgentKeyRow | null> {
  const rows = (await sql()`SELECT chain, project, node, pubkey, curve, enc_blob
    FROM agent_key WHERE chain = ${chain} AND project = ${project} AND node = ${node}`) as AgentKeyRow[];
  return rows[0] ?? null;
}
export async function listAgentKeys(chain: string, project: string): Promise<AgentKeyRow[]> {
  return (await sql()`SELECT chain, project, node, pubkey, curve, enc_blob
    FROM agent_key WHERE chain = ${chain} AND project = ${project} ORDER BY created_at`) as AgentKeyRow[];
}

// --- tool_call (audit log + rate-limit backing store) ---
const WRITE_TOOLS = ["pay", "create_submandate"];

export async function logToolCall(b: NodeBinding, tool: string, okFlag: boolean, ip: string | null): Promise<void> {
  await sql()`INSERT INTO tool_call (chain, project, node, tool, ok, ip)
    VALUES (${b.chain}, ${b.project}, ${b.mandate_node}, ${tool}, ${okFlag}, ${ip})`;
}

/** Count recent WRITE tool calls in the last `windowSec` seconds, by node and (optionally) by IP. */
export async function countRecentWrites(
  node: string,
  ip: string | null,
  windowSec: number
): Promise<{ byNode: number; byIp: number }> {
  const n = (await sql()`SELECT count(*)::int AS c FROM tool_call
    WHERE node = ${node} AND tool = ANY(${WRITE_TOOLS})
      AND created_at > now() - make_interval(secs => ${windowSec})`) as { c: number }[];
  let byIp = 0;
  if (ip) {
    const r = (await sql()`SELECT count(*)::int AS c FROM tool_call
      WHERE ip = ${ip} AND tool = ANY(${WRITE_TOOLS})
        AND created_at > now() - make_interval(secs => ${windowSec})`) as { c: number }[];
    byIp = r[0]?.c ?? 0;
  }
  return { byNode: n[0]?.c ?? 0, byIp };
}
