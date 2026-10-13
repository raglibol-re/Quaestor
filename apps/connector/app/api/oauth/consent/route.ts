export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent approval: the owner has signed a SIWS message binding a token to ONE node. Verify the
// signature against Project.owner, then mint a single-use, node-bound authorization code.
import { verifyAuthReq } from "@/lib/oauth";
import { buildSiwsMessage, verifySiws } from "@/lib/siws";
import { projectOwner } from "@/lib/chain";
import { env } from "@/lib/env";
import { getAgentKey, insertAuthCode } from "@/lib/db";
import { randomToken, sha256hex } from "@/lib/tokens";
import { json, oauthError, preflight } from "@/lib/http";

const SIWS_WINDOW_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = (await req.json()) as Record<string, string>;
  } catch {
    return oauthError(400, "invalid_request", "body must be JSON");
  }
  const { rt, node, nonce, issuedAt, signature } = body;
  if (!rt || !node || !nonce || !issuedAt || !signature) {
    return oauthError(400, "invalid_request", "rt, node, nonce, issuedAt, signature required");
  }

  let authReq;
  try {
    authReq = await verifyAuthReq(rt);
  } catch {
    return oauthError(400, "invalid_request", "authorize request expired — restart the flow");
  }

  const chain = env().chain;
  const project = env().project.toBase58();

  // The node must be a real custodied node of this project.
  const key = await getAgentKey(chain, project, node);
  if (!key) return oauthError(400, "invalid_request", "unknown node");

  // Freshness.
  const ts = Date.parse(issuedAt);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIWS_WINDOW_MS) {
    return oauthError(400, "invalid_request", "signature expired — restart the flow");
  }

  // Reconstruct the exact message the owner must have signed and verify vs Project.owner.
  const message = buildSiwsMessage({
    project,
    node,
    clientId: authReq.clientId,
    codeChallenge: authReq.codeChallenge,
    nonce,
    issuedAt,
  });
  let owner: string;
  try {
    owner = await projectOwner();
  } catch {
    return oauthError(500, "server_error", "could not read project owner");
  }
  if (!verifySiws(message, signature, owner)) {
    return oauthError(403, "access_denied", "signature is not from the project owner");
  }

  // Mint a single-use, node-bound code.
  const code = randomToken(32);
  await insertAuthCode({
    code_hash: sha256hex(code),
    client_id: authReq.clientId,
    redirect_uri: authReq.redirectUri,
    code_challenge: authReq.codeChallenge,
    scope: authReq.scope ?? "mandate",
    chain,
    project,
    mandate_node: node,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  const r = new URL(authReq.redirectUri);
  r.searchParams.set("code", code);
  if (authReq.state) r.searchParams.set("state", authReq.state);
  return json({ redirect: r.toString() });
}
