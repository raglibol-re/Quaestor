import { Mark } from "@/components/Mark";
import { CodeBlock } from "@/components/CodeBlock";
import { ConfigWizard } from "@/components/ConfigWizard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TOOLS, COMPARISON, LINKS } from "@/lib/data";

const BUILD = `git clone https://github.com/raglibol-re/Quaestor
cd Quaestor
pnpm install
pnpm --filter @quaestor/sdk build
pnpm --filter @quaestor/mcp-server build
anchor build            # Solana only — builds the program + IDL
                        # EVM: build the contracts with Foundry (see docs/evm.md)`;

const OWNER_SETUP = `export QUAESTOR_RPC_URL=https://api.devnet.solana.com
export QUAESTOR_OWNER_KEYPAIR=~/.config/solana/id.json
export QUAESTOR_KEYSTORE_PASSPHRASE='choose-a-strong-passphrase'

# a test USDC mint you control
node packages/mcp-server/dist/cli.js create-mint                   # -> MINT
node packages/mcp-server/dist/cli.js fund --mint <MINT> --amount 100

# a relayer that pays fees, so agents need no SOL
solana-keygen new -o ~/.quaestor/relayer.json
solana airdrop 2 $(solana-keygen pubkey ~/.quaestor/relayer.json) -u "$QUAESTOR_RPC_URL"

# create the project, deposit, and the top agent
node packages/mcp-server/dist/cli.js init --mint <MINT> --project-id 1 \\
  --relayer $(solana-keygen pubkey ~/.quaestor/relayer.json)       # -> PROJECT
node packages/mcp-server/dist/cli.js deposit --project <PROJECT> --amount 10
node packages/mcp-server/dist/cli.js agent-create orchestrator     # -> AGENT`;

export default function Home() {
  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="#top" aria-label="Quaestor">
            <Mark className="brand-mark" />
            <span className="wordmark">Quaestor</span>
          </a>
          <div className="nav-links">
            <a className="nav-link hide-sm" href="#how">
              How it works
            </a>
            <a className="nav-link" href="#setup">
              Set up the MCP
            </a>
            <a className="nav-link hide-sm" href={LINKS.dashboard}>
              Dashboard
            </a>
            <a className="nav-link" href={LINKS.github}>
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main id="top">
        {/* Hero */}
        <section className="wrap hero">
          <div className="hero-grid">
            <div>
              <p className="eyebrow">Onchain spending mandates for AI agents</p>
              <h1 className="hero-title">Give your agent a mandate, not a wallet.</h1>
              <p className="hero-sub">
                A human funds a project with USDC. Agents receive sub-mandates and can delegate their
                own — never more than they hold. Every limit is enforced in the onchain program, and
                any branch is freezable in an instant. Agents reach their mandate over MCP and need no
                gas.
              </p>
              <div className="hero-cta">
                <a className="q-btn q-btn-primary q-btn-lg" href="#setup">
                  Set up the MCP
                </a>
                <a className="q-btn q-btn-lg" href={LINKS.dashboard}>
                  Live dashboard
                </a>
                <a className="q-btn q-btn-lg" href={LINKS.github}>
                  GitHub
                </a>
              </div>
              <div className="hero-meta">
                <div>
                  <span className="label">Chains</span>
                  <span className="mono">Solana · Base</span>
                </div>
                <div>
                  <span className="label">Access</span>
                  <span className="mono">MCP · 9 tools</span>
                </div>
                <div>
                  <span className="label">Agent gas</span>
                  <span className="mono">none — relayer pays</span>
                </div>
              </div>
            </div>

            {/* Mandate-tree visual */}
            <div className="visual" aria-hidden="true">
              <div className="visual-head">
                <span className="label">Project vault</span>
                <span className="q-amount q-amount-md q-tone-active">
                  100.00<span className="q-amount-unit">USDC</span>
                </span>
              </div>
              <div className="tree">
                <div className="q-node">
                  <div className="q-node-depth">I</div>
                  <div className="q-node-body">
                    <div className="q-node-head">
                      <span className="q-node-name">orchestrator</span>
                      <span className="q-badge q-badge-active">active</span>
                    </div>
                    <div className="q-meter">
                      <div className="q-meter-track">
                        <div className="q-meter-spent" style={{ width: "28%" }} />
                        <div className="q-meter-reserved" style={{ width: "50%" }} />
                      </div>
                    </div>
                    <span className="q-amount q-amount-md">
                      60.00<span className="q-amount-unit">USDC allocated</span>
                    </span>
                    <div className="children">
                      <div className="q-node">
                        <div className="q-node-depth">II</div>
                        <div className="q-node-body">
                          <div className="q-node-head">
                            <span className="q-node-name">research</span>
                            <span className="q-badge q-badge-active">active</span>
                          </div>
                          <span className="q-amount q-amount-md q-tone-reserved">
                            20.00<span className="q-amount-unit">USDC</span>
                          </span>
                        </div>
                      </div>
                      <div className="q-node q-node-frozen">
                        <div className="q-node-depth">II</div>
                        <div className="q-node-body">
                          <div className="q-node-head">
                            <span className="q-node-name">writer</span>
                            <span className="q-badge q-badge-frozen">frozen</span>
                          </div>
                          <span className="q-amount q-amount-md">
                            10.00<span className="q-amount-unit">USDC held</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why */}
        <section className="wrap section" id="why">
          <div className="section-head">
            <p className="eyebrow">The problem</p>
            <h2 className="heading-1">A key is all-or-nothing. A mandate is not.</h2>
            <p>
              Agents are starting to spend money — on data, compute, APIs, and each other. Hand an
              agent a funded key and one bug or prompt injection drains it. Existing agent wallets are
              flat (one human → one agent) and off-chain guardrails are bypassable. Real agent systems
              are hierarchies, so the mandate should be the primitive.
            </p>
          </div>
          <div className="cmp-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Flat agent wallets</th>
                  <th className="q">Quaestor</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.dim}>
                    <td>{row.dim}</td>
                    <td>{row.flat}</td>
                    <td className="q">{row.quaestor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* How it works */}
        <section className="wrap section" id="how">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2 className="heading-1">The mandate is the first-class object.</h2>
            <p>
              Compromise an agent and you leak a mandate, never a wallet. Three ideas make that true.
            </p>
          </div>
          <div className="grid3">
            <div className="card">
              <span className="numeral">I</span>
              <h3>Hierarchical delegation</h3>
              <p>
                Each agent holds a mandate node and can sub-delegate to children — capped by what it
                holds, with per-tx, daily and expiry limits that only tighten down the tree.
              </p>
            </div>
            <div className="card">
              <span className="numeral">II</span>
              <h3>Enforced in the program</h3>
              <p>
                Every spend is checked against the entire ancestor chain inside the onchain program —
                not a server that can be bypassed. Freeze one node and its whole subtree stops at once.
              </p>
            </div>
            <div className="card">
              <span className="numeral">III</span>
              <h3>No gas for agents</h3>
              <p>
                A relayer pays fees and rent, so agents need no SOL or ETH. The agent&rsquo;s key stays
                encrypted in a local keystore — the model never sees a secret.
              </p>
            </div>
          </div>
          <div className="invariant">
            <span className="label">Invariant</span>
            <code>spent + reserved_for_children ≤ allocated</code>
            <span>— checked on every transaction, at every node.</span>
          </div>
        </section>

        {/* Setup */}
        <section className="wrap section" id="setup">
          <div className="section-head">
            <p className="eyebrow">Set up the MCP</p>
            <h2 className="heading-1">From clone to a mandated agent.</h2>
            <p>
              Quaestor runs locally over stdio — one MCP instance per agent. Prerequisites: Node 22 and
              pnpm 10; plus the Solana CLI and Anchor for Solana, or Foundry for EVM. Everything runs on
              devnet / testnet.
            </p>
          </div>

          <ol className="steps">
            <li className="step">
              <div className="step-num">1</div>
              <div className="step-body">
                <h3>Clone and build</h3>
                <p>Build the SDK and the MCP server from the monorepo.</p>
                <CodeBlock label="terminal" code={BUILD} />
              </div>
            </li>

            <li className="step">
              <div className="step-num">2</div>
              <div className="step-body">
                <h3>One-time owner setup</h3>
                <p>
                  As the human owner, mint test USDC, create a relayer, open a project, deposit, and
                  create your top agent. This prints the <span className="mono">PROJECT</span> address
                  you&rsquo;ll paste below.
                </p>
                <CodeBlock label="Solana — owner CLI" code={OWNER_SETUP} />
                <p>
                  On <strong>Base (EVM)</strong> you can skip deployment entirely — the generator below
                  is prefilled with the live Base Sepolia contracts. To deploy your own, see{" "}
                  <a href={LINKS.evmDoc}>docs/evm.md</a>.
                </p>
              </div>
            </li>

            <li className="step">
              <div className="step-num">3</div>
              <div className="step-body">
                <h3>Generate your Claude config</h3>
                <p>
                  Pick your chain and host, fill in the fields, and copy the result. Defaults are
                  prefilled so the output is valid out of the box.
                </p>
                <ConfigWizard />
              </div>
            </li>

            <li className="step">
              <div className="step-num">4</div>
              <div className="step-body">
                <h3>Paste and restart Claude</h3>
                <p>
                  Add the block to <span className="mono">claude_desktop_config.json</span> (Claude
                  Desktop) or <span className="mono">.mcp.json</span> at your project root (Claude Code),
                  then restart. The Quaestor tools — <span className="mono">get_my_mandate</span>,{" "}
                  <span className="mono">pay</span>, and the rest — appear in the agent.
                </p>
              </div>
            </li>

            <li className="step">
              <div className="step-num">5</div>
              <div className="step-body">
                <h3>Spin up subagents</h3>
                <p>
                  When an agent calls <span className="mono">create_submandate</span>, the tool
                  returns a ready-to-paste config snippet for the child. Start a second MCP instance for
                  it the same way — the tree grows itself.
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* Tools */}
        <section className="wrap section" id="tools">
          <div className="section-head">
            <p className="eyebrow">The tools</p>
            <h2 className="heading-1">Nine tools, one mandate.</h2>
            <p>
              What an agent sees over MCP. Amounts are decimal USDC; errors are human-readable, e.g.{" "}
              <span className="mono">Per-transaction limit exceeded: limit 0.50 USDC</span>.
            </p>
          </div>
          <div className="tool-grid">
            {TOOLS.map((tool) => (
              <div className="tool" key={tool.name}>
                <code>{tool.name}</code>
                <p>{tool.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-col">
              <div className="brand" style={{ marginBottom: "var(--space-2)" }}>
                <Mark className="brand-mark" />
                <span className="wordmark">Quaestor</span>
              </div>
              <span className="small" style={{ color: "var(--ink-muted)", maxWidth: "26ch" }}>
                Hierarchical, onchain-enforced USDC spending mandates for AI agents.
              </span>
            </div>
            <div className="footer-col">
              <span className="label">Product</span>
              <a href={LINKS.dashboard}>Live dashboard</a>
              <a href={LINKS.github}>GitHub</a>
              <a href={LINKS.mcpSetupDoc}>MCP setup</a>
              <a href={LINKS.evmDoc}>EVM guide</a>
            </div>
            <div className="footer-col">
              <span className="label">Onchain</span>
              <a href={LINKS.programExplorer}>Solana program</a>
              <a href={LINKS.demoProjectExplorer}>Demo project</a>
              <a href={LINKS.evmContract}>Base contract</a>
              <a href={LINKS.evmForwarder}>Gasless forwarder</a>
            </div>
          </div>
          <p className="footer-line">Every agent answers to a mandate.</p>
        </div>
      </footer>
    </>
  );
}
