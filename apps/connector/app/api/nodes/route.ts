export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read for the consent screen: the project owner (whose wallet must sign) and the custodied
// nodes a token can be bound to, each with its current limits. No secrets.
import { env } from "@/lib/env";
import { projectOwner, listNodesWithInfo } from "@/lib/chain";
import { json, oauthError, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export async function GET() {
  try {
    const [owner, nodes] = await Promise.all([projectOwner(), listNodesWithInfo()]);
    return json({ chain: env().chain, project: env().project.toBase58(), owner, nodes });
  } catch (e) {
    console.error("[nodes] error", (e as Error).message);
    return oauthError(500, "server_error", "could not read project state");
  }
}
