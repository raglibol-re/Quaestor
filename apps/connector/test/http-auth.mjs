// HTTP auth-matrix smoke test against a deployed connector (the 401 path needs no secrets).
//   node test/http-auth.mjs [baseUrl]
// Checks: no token -> 401 + WWW-Authenticate(resource_metadata); bad token -> 401; GET -> 405.
const base = (process.argv[2] || "https://quaestor-connector.vercel.app").replace(/\/+$/, "");
const mcp = `${base}/api/mcp`;
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${name}${cond ? "" : ` — ${detail}`}`);
  if (!cond) failed++;
};
const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

// 1. No Authorization header -> 401 with a WWW-Authenticate pointing at the resource metadata.
{
  const r = await fetch(mcp, { method: "POST", headers: { "Content-Type": "application/json" }, body: rpc });
  const wa = r.headers.get("www-authenticate") || "";
  check("no token -> 401", r.status === 401, `got ${r.status}`);
  check("401 advertises resource_metadata", /resource_metadata=/.test(wa), `WWW-Authenticate: ${wa || "(none)"}`);
}

// 2. Garbage bearer token -> 401 (fail-closed).
{
  const r = await fetch(mcp, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
    body: rpc,
  });
  check("bad token -> 401", r.status === 401, `got ${r.status}`);
}

// 3. GET -> 405 (no sessions).
{
  const r = await fetch(mcp, { method: "GET" });
  check("GET -> 405", r.status === 405, `got ${r.status}`);
}

// 4. Discovery (informational — 200 once the deployment is fully configured).
{
  const r = await fetch(`${base}/.well-known/oauth-protected-resource`);
  console.log(`  info discovery /.well-known/oauth-protected-resource -> ${r.status}`);
}

console.log(failed === 0 ? "\nauth matrix: PASS" : `\nauth matrix: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
