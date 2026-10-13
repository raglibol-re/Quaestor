export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Token revocation (RFC 7009). Revoking a refresh token also revokes every token bound to its node,
// so an explicit revoke invalidates access server-side (onchain enforcement is independent).
import { getRefresh, revokeNode, revokeRefresh } from "@/lib/db";
import { sha256hex } from "@/lib/tokens";
import { json, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export async function POST(req: Request) {
  const text = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(text).forEach((v, k) => (params[k] = v));
  const token = params.token;
  // RFC 7009: always return 200, even for unknown tokens.
  if (token) {
    const hash = sha256hex(token);
    const row = await getRefresh(hash);
    if (row) {
      await revokeRefresh(hash);
      await revokeNode({ chain: row.chain, project: row.project, mandate_node: row.mandate_node });
    }
  }
  return json({});
}
