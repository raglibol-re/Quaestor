export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="wrap">
      <p className="label">Quaestor</p>
      <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 40, margin: "8px 0 16px" }}>
        Remote MCP connector
      </h1>
      <p className="muted">
        Add this server as a Custom Connector in claude.ai to give an agent a Quaestor mandate — an
        onchain-enforced USDC budget — over MCP. Each connection is bound to exactly one mandate node;
        the agent key is custodied server-side and the model never sees it.
      </p>
      <div className="card" style={{ marginTop: 24 }}>
        <p className="label">Add in claude.ai</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Settings → Connectors → Add custom connector → paste this server&rsquo;s{" "}
          <span className="mono">/api/mcp</span> URL. Complete the wallet sign-in (the project owner
          approves), pick a mandate node, and the Quaestor tools appear.
        </p>
      </div>
      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        Docs: <a href="https://github.com/raglibol-re/Quaestor/blob/main/docs/remote-connector.md">remote-connector.md</a>
        {"  ·  "}
        <a href="https://github.com/raglibol-re/Quaestor">GitHub</a>
      </p>
    </div>
  );
}
