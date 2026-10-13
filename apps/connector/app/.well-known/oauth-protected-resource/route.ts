export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { protectedResourceMetadata } from "@/lib/oauth";
import { json, preflight } from "@/lib/http";

export function OPTIONS() {
  return preflight();
}

export function GET() {
  return json(protectedResourceMetadata());
}
