# Quaestor

**Hierarchical, on-chain-enforced USDC budgets for AI agents — on Solana.**

> _Give agents budgets, not keys._

A human funds a project with USDC. Agents receive sub-budgets and can themselves
delegate sub-sub-budgets to sub-agents — **never more than they hold**. Every branch
is freezable at any time. Agents access their budget through an **MCP server** and
need **no SOL** (a relayer pays the fees). Every limit is enforced **in the Solana
program** — not in a server that can be bypassed.

---

### 🔗 Live

| | |
|---|---|
| **Dashboard (live budget tree)** | https://quaestor-dashboard.vercel.app |
| **Program (devnet)** | [`FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP`](https://explorer.solana.com/address/FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP?cluster=devnet) |
| **Demo project (devnet)** | [`Bgo4nN4D5mVB7yjT5ymcGjhA83k23fbFPf5Ta44L3Kkr`](https://explorer.solana.com/address/Bgo4nN4D5mVB7yjT5ymcGjhA83k23fbFPf5Ta44L3Kkr?cluster=devnet) |

Built solo for the **Colosseum Crypto World's Fair** (Solana track).

---

## The problem

Autonomous agents increasingly need to *pay* for things — data, compute, APIs, other
agents. The moment you give an agent the ability to spend, you face a control problem:

- Hand it a **private key** and it can drain the whole wallet. One prompt injection, one
  bug, and the money is gone.
- Existing agent wallets (Coinbase Agentic Wallets, Turnkey, SPL delegation) model **flat**
  budgets: *one human → one agent*. But real agent systems are **hierarchies** — an
  orchestrator spawns researchers, a researcher spawns scrapers. A flat allowance can't
  express "the research branch may spend at most 2 USDC, 0.50 per transaction, and I can
  freeze that entire branch in one click."

## The solution

Quaestor makes the **budget** the first-class object, not the key. The agent never holds
a private key to a funded wallet — it holds an *authority* over a budget **node**, and
every spend is checked against the whole ancestor chain, on-chain.

```
Owner (human)  ── funds the project vault with USDC
└── Orchestrator budget              allocated 6 USDC
    ├── Research sub-agent            2 USDC · max 0.50 / tx · daily cap
    │   └── Scraper sub-sub-agent     0.5 USDC
    └── Writer sub-agent              1 USDC
```

- **Delegation is capped by construction.** A node can only allocate what it *has available*.
  A child's per-tx limit and expiry must be **tighter-or-equal** to its parent's.
- **Freeze once, stop the whole subtree.** Freezing the orchestrator instantly blocks every
  descendant's `spend` — enforced by an ancestor-chain walk inside the program.
- **Agents need no SOL.** A relayer pays the transaction fee; the agent only signs to prove
  it owns the budget node. Compromising an agent leaks a *budget*, never a wallet.

---

## How it works

### Reservation accounting (one invariant keeps it safe)

There is **one vault per project** (an ATA owned by the project PDA). Budgets are pure
accounting nodes — no token account per node. Each node tracks:

```
available = allocated − spent − reserved_for_children
```

with the single invariant **`spent + reserved_for_children ≤ allocated`** enforced on every
mutation via `checked_add`/`checked_sub` + a pre-check:

| Instruction | Pre-check |
|---|---|
| `allocate_child` / `increase_allocation` | `amount ≤ available(parent)` |
| `spend` | `amount ≤ available(node)` **and** per-tx / period limits **and** whole ancestor chain active |
| `reclaim` | `unused ≤ parent.reserved_for_children` (bottom-up only) |
| `withdraw` | `amount ≤ available(root)`, owner-only |

A randomized **property test** hammers the accounting core: after every random op it asserts
`spent + reserved ≤ allocated` per node and `Σ available ≤ vault balance`.

### Ancestor-chain enforcement

`spend` and `reclaim` receive the node's ancestors as `remaining_accounts`. The program
walks the chain, and for **each** ancestor: deserializes it as a `Budget` (checks program
ownership + discriminator), re-derives its PDA from `(project, agent)`, verifies
`acc.key == child.parent`, and enforces termination (`parent == None` exactly at the root,
depth strictly decreasing). This makes a forged, padded, foreign, or cyclic chain
impossible — and lets a freeze/revoke high in the tree stop every leaf below it.

### Security-critical design decisions

These were caught in a pre-implementation design review and are covered by tests:

- **Reclaim survives a revoked ancestor** — otherwise revoking a parent would lock a child's
  funds forever (no path to reclaim). `reclaim` is allowed when the child *or any ancestor*
  is revoked/expired.
- **`Option`-typed limits** — "unlimited" is `None`, never a `0` sentinel that could be
  confused with "zero allowed" in the child-≤-parent comparison.
- **Snap-to-now period reset** — `if now ≥ period_start + period_seconds { reset }` avoids the
  boundary-burst exploit of advancing by whole periods.
- **`init`, never `init_if_needed`** — no re-init / resurrection of a spent node.
- Classic `anchor_spl::token` (not Token-2022); `has_one` guards on owner/mint/vault/project;
  relayer is fee-payer only, never an authority.

---

## The 90-second demo

`scripts/demo.sh` runs the whole story live on devnet (each step is a real transaction with
an explorer link). Paste the printed project address into the dashboard to watch the tree
update live.

1. Human creates a project and deposits **10 USDC**.
2. **Orchestrator** agent gets a **6 USDC** budget.
3. Orchestrator delegates **2 USDC** to a **research** sub-agent, capped at **0.50 / tx**
   *(the agent signs; the relayer pays the fee — the agent holds no SOL)*.
4. Research pays **2 × 0.50 USDC** for data. ✅
5. Research tries to spend **3 USDC** → **REJECTED on-chain** (exceeds per-tx limit). ⛔
6. Human **freezes the orchestrator** → research's next payment is **BLOCKED because an
   ancestor is frozen** — the whole subtree stops instantly. ⛔
7. Owner **revokes + reclaims** research's **unused 1 USDC** back up to the orchestrator
   (already-spent funds correctly stay spent). ♻️

```bash
QUAESTOR_RPC_URL="<devnet-rpc>" \
QUAESTOR_OWNER_KEYPAIR="$HOME/.config/solana/id.json" \
  bash scripts/demo.sh
```

---

## Repo layout

```
programs/quaestor/     Anchor program (Rust)            — the enforcement core (9 instructions)
programs/quaestor/tests/                                — 25 LiteSVM tests (incl. property test)
packages/sdk/          @quaestor/sdk: PDAs, ix builders, budget-tree fetch, unit conversion
packages/mcp-server/   MCP server (stdio, 8 tools) + owner CLI (11 commands)
apps/dashboard/        Next.js live budget-tree UI (deployed to Vercel)
scripts/demo/          reproducible ~90s demo scenario
docs/                  mcp-setup.md, devnet.md
```

### On-chain instructions

`create_project` · `deposit` · `allocate_child` · `increase_allocation` · `spend` ·
`set_status` (freeze/unfreeze) · `revoke` · `reclaim` · `withdraw`

### MCP tools (what an agent sees)

`get_my_budget` · `pay` · `create_subagent_budget` · `list_subagents` ·
`freeze_subagent` · `revoke_subagent` · `reclaim_subagent` · `get_history`

Amounts are in decimal USDC; errors are human-readable (`"Per-transaction limit exceeded:
limit 0.50 USDC"`). The agent's private key lives in an encrypted local keystore
(scrypt + AES-256-GCM) — the model **never** sees it.

### Owner CLI

`create-mint` · `fund` · `init` · `deposit` · `tree` · `allocate` · `freeze` · `revoke` ·
`withdraw` · `agent-create` · `agent-list`

---

## Getting started

Solana/Anchor development runs in **WSL2 Ubuntu**. Node tooling runs anywhere.

```bash
pnpm install

# 1. Program: build + run the 25 Rust/LiteSVM tests (in-process, no validator)
bash scripts/test.sh

# 2. SDK: build + test against a local validator
bash scripts/test-sdk.sh

# 3. MCP server end-to-end test
bash scripts/test-mcp.sh

# 4. Dashboard (local)
pnpm --filter @quaestor/sdk build && pnpm --filter @quaestor/dashboard dev
```

Connecting the MCP server to Claude Desktop/Code: see [`docs/mcp-setup.md`](docs/mcp-setup.md).
Devnet deployment notes: see [`docs/devnet.md`](docs/devnet.md).

### Toolchain (pinned)

| Tool | Version |
|---|---|
| Anchor (Rust `anchor-lang` / CLI) | 1.2.0 |
| `@coral-xyz/anchor` (JS) | 0.32.1 |
| Solana CLI (Agave) | 4.x (stable) |
| `@solana/web3.js` / `@solana/spl-token` | 1.99 / 0.4 |
| MCP TS SDK | 1.30.1 |
| Node / pnpm | 22 / 10.17 |

---

## Status

Milestone-based build for the Colosseum Crypto World's Fair (submission 2026-10-12).

- [x] **M0** Toolchain + monorepo scaffold
- [x] **M1** Anchor program + 25 LiteSVM tests (the enforcement core)
- [x] **M2** TS SDK (PDAs, ix builders, budget-tree fetch)
- [x] **M3** MCP server (8 tools) + owner CLI (11 commands)
- [x] **M4** Dashboard — live tree, deployed to Vercel
- [x] **M5** Reproducible ~90s demo scenario
- [x] **M6** Devnet deploy · docs · submission

Everything runs on **devnet / local validator**. No mainnet keys; no private keys in git.

### Roadmap / stretch

Multi-chain: one Solidity `Quaestor.sol` (same reservation invariants, `mappings` instead of
PDAs) on **Tempo** + an Ethereum testnet, with a `QUAESTOR_CHAIN` switch in the MCP server.
Ancestor-**agent** freeze (today freeze/revoke are owner-only). x402 payment integration.

## License

MIT
