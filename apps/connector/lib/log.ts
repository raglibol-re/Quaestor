// Structured, secret-redacted logging. Error messages are passed through `redact` so a secret
// (DB URL/password, master key, JWT key, relayer key) can never land in a log line. Callers pass
// only non-secret fields (node, tool, ip, request id).
import { secretValues } from "./env";

function redact(s: string): string {
  let out = s;
  try {
    for (const sec of secretValues()) if (sec) out = out.split(sec).join("***");
  } catch {
    /* env not loaded yet — nothing to redact from env */
  }
  // Defense-in-depth regexes, independent of env:
  out = out.replace(/postgres(ql)?:\/\/[^\s"']+/gi, "postgres://***");
  out = out.replace(/\bnpg_[A-Za-z0-9]+/g, "npg_***");
  return out;
}

export function logInfo(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(
    JSON.stringify({
      level: "error",
      event,
      name: err instanceof Error ? err.name : undefined,
      error: redact(msg),
      ...fields,
    })
  );
}
