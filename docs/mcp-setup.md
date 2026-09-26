# Quaestor MCP — setup & usage

The Quaestor MCP server gives an AI agent a **budget, not a key**. It runs locally
(stdio), one instance per agent. The agent's keypair lives encrypted in a local
keystore (`~/.quaestor/keys`); **the model never sees a secret key**. A relayer
keypair pays all fees and rent, so agents need no SOL.

## 1. Build

```bash
pnpm install
pnpm --filter @quaestor/sdk build
pnpm --filter @quaestor/mcp-server build
anchor build            # produces target/deploy/quaestor.so + IDL
```

## 2. One-time owner setup (devnet or localnet)

```bash
export QUAESTOR_RPC_URL=https://api.devnet.solana.com
export QUAESTOR_OWNER_KEYPAIR=~/.config/solana/id.json
export QUAESTOR_KEYSTORE_PASSPHRASE='choose-a-strong-passphrase'

# a test USDC mint you control (skip on mainnet — use real USDC)
node packages/mcp-server/dist/cli.js create-mint            # -> MINT
node packages/mcp-server/dist/cli.js fund --mint <MINT> --amount 100

# a relayer that pays fees for agents
solana-keygen new -o ~/.quaestor/relayer.json
solana airdrop 2 $(solana-keygen pubkey ~/.quaestor/relayer.json) -u "$QUAESTOR_RPC_URL"

# create the project + deposit
node packages/mcp-server/dist/cli.js init --mint <MINT> --project-id 1 \
  --relayer $(solana-keygen pubkey ~/.quaestor/relayer.json)          # -> PROJECT
node packages/mcp-server/dist/cli.js deposit --project <PROJECT> --amount 10

# create the top agent and give it a budget
node packages/mcp-server/dist/cli.js agent-create orchestrator         # -> AGENT PUBKEY
# (allocate to it from the owner via the CLI/dashboard, or let the owner's MCP do it)
```

## 3. Point Claude at the agent

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quaestor-orchestrator": {
      "command": "node",
      "args": ["<ABS_PATH>/packages/mcp-server/dist/server.js"],
      "env": {
        "QUAESTOR_RPC_URL": "https://api.devnet.solana.com",
        "QUAESTOR_PROJECT": "<PROJECT>",
        "QUAESTOR_AGENT": "orchestrator",
        "QUAESTOR_KEYSTORE_PASSPHRASE": "choose-a-strong-passphrase",
        "QUAESTOR_RELAYER_KEYPAIR": "<HOME>/.quaestor/relayer.json"
      }
    }
  }
}
```

**Claude Code** — same entry in `.mcp.json`, or:

```bash
claude mcp add quaestor-orchestrator -- node <ABS_PATH>/packages/mcp-server/dist/server.js
# then set the QUAESTOR_* env in the generated config
```

When an agent calls `create_subagent_budget`, the tool returns a ready-to-paste
config snippet for the new sub-agent — spin up a second MCP instance for it the
same way.

## Tools

| Tool | What it does |
|---|---|
| `get_my_budget` | available / spent / limits / status / expiry (USDC) |
| `pay` | send USDC to a recipient wallet (enforced on-chain) |
| `create_subagent_budget` | delegate a sub-budget (limits ≤ your own) + get its config snippet |
| `list_subagents` | direct sub-agents with balances/status |
| `freeze_subagent` / `revoke_subagent` | stop a sub-tree (owner authority) |
| `reclaim_subagent` | pull back a revoked/expired sub-agent's unused funds |
| `get_history` | recent transactions of this budget |

## Notes

- Amounts are USDC decimal strings (e.g. `"0.50"`); converted to base units internally.
- Errors are human-readable, e.g. *"Per-transaction limit exceeded: limit 0.50 USDC, tried 1 USDC."*
- `freeze`/`revoke` require **project-owner** authority in this version (run them from the
  owner's MCP or the CLI/dashboard). Ancestor-agent freeze is a planned follow-up.
- Everything runs on **devnet / localnet**. Never use mainnet keys.
