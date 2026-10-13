export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { authServerMetadata } from "@/lib/oauth";
import { json, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export function GET() {
  return json(authServerMetadata());
}
