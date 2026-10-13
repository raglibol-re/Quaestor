export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consent-screen context: verify the authreq token and return the authorize params the browser
// needs to build the SIWS message (client_id, PKCE challenge) plus the owner + custodied nodes.
import { verifyAuthReq } from "@/lib/oauth";
import { projectOwner, listNodesWithInfo } from "@/lib/chain";
import { env } from "@/lib/env";
import { json, oauthError, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const rt = new URL(req.url).searchParams.get("rt");
  if (!rt) return oauthError(400, "invalid_request", "rt required");
  let a;
  try {
    a = await verifyAuthReq(rt);
  } catch {
    return oauthError(400, "invalid_request", "authorize request expired — restart from your client");
  }
  try {
    const [owner, nodes] = await Promise.all([projectOwner(), listNodesWithInfo()]);
    return json({
      chain: env().chain,
      project: env().project.toBase58(),
      owner,
      nodes,
      clientId: a.clientId,
      codeChallenge: a.codeChallenge,
    });
  } catch (e) {
    console.error("[prepare] error", (e as Error).message);
    return oauthError(500, "server_error", "could not read project state");
  }
}
