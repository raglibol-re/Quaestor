export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent approval: the owner has signed a SIWS message binding a token to ONE node. Verify the
// signature against Project.owner, then mint a single-use, node-bound authorization code.
import { verifyAuthReq } from "@/lib/oauth";
import { buildSiwsMessage, verifySiws } from "@/lib/siws";
import { projectOwner } from "@/lib/chain";
import { env } from "@/lib/env";
import { consumeInvite, getAgentKey, getInvite, insertAuthCode } from "@/lib/db";
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
  const rt = body.rt;
  if (!rt) return oauthError(400, "invalid_request", "rt required");

  let authReq;
  try {
    authReq = await verifyAuthReq(rt);
  } catch {
    return oauthError(400, "invalid_request", "authorize request expired — restart the flow");
  }

  const chain = env().chain;
  const project = env().project.toBase58();

  // Resolve the bound node, either via an invite code (no wallet) or owner SIWS.
  let node: string;
  if (body.invite) {
    const inv = await getInvite(sha256hex(body.invite));
    if (!inv || inv.chain !== chain || inv.project !== project || !inv.child_node) {
      return oauthError(400, "invalid_grant", "invite invalid, expired, or already used");
    }
    if (!(await consumeInvite(sha256hex(body.invite), inv.child_node))) {
      return oauthError(400, "invalid_grant", "invite already used");
    }
    node = inv.child_node;
  } else {
    const { node: n, nonce, issuedAt, signature } = body;
    if (!n || !nonce || !issuedAt || !signature) {
      return oauthError(400, "invalid_request", "node, nonce, issuedAt, signature (or invite) required");
    }
    // The node must be a real custodied node of this project.
    if (!(await getAgentKey(chain, project, n))) return oauthError(400, "invalid_request", "unknown node");
    // Freshness.
    const ts = Date.parse(issuedAt);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIWS_WINDOW_MS) {
      return oauthError(400, "invalid_request", "signature expired — restart the flow");
    }
    // Reconstruct the exact message the owner must have signed and verify vs Project.owner.
    const message = buildSiwsMessage({
      project,
      node: n,
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
    node = n;
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
