# Quaestor

**Hierarchical, on-chain-enforced budgets for AI agents — on Solana.**

> _Give agents budgets, not keys._

A human funds a project with USDC. Agents receive sub-budgets and can themselves
delegate sub-sub-budgets to sub-agents — **never more than they hold**. Every branch
is freezable at any time. Agents access their budget through an **MCP server** and
need **no SOL** (a relayer pays fees). All limits are enforced **in the program**,
not in a server.

## Why this is different

Existing agent wallets (Coinbase Agentic Wallets, Turnkey, SPL delegation) model
**flat** budgets: one human → one agent. Quaestor models real multi-agent
**hierarchies** and enforces the rules on-chain:

```
Owner (human)
└── Orchestrator budget            allocated 10 USDC
    ├── Research sub-agent          2 USDC · 0.50/tx · daily cap
    │   └── Scraper sub-sub-agent   0.5 USDC
    └── Writer sub-agent            1 USDC
```

- **Reservation model:** one vault per project; budgets are pure accounting nodes.
  `available = allocated − spent − reserved_for_children`.
- **Ancestor-chain enforcement:** a `spend` is rejected if the node *or any ancestor*
  is frozen/revoked/expired.
- **Freeze once, stop the whole subtree** — instantly, on-chain.

## Monorepo layout

```
programs/quaestor/     Anchor program (Rust)            — the enforcement core
packages/sdk/          TS SDK: PDAs, ix builders, tree  — (M2)
packages/mcp-server/   MCP server (stdio) + owner CLI   — (M3)
apps/dashboard/        Next.js live budget-tree UI      — (M4)
scripts/demo/          reproducible demo scenario       — (M5)
```

## Toolchain (pinned)

| Tool | Version |
|---|---|
| Anchor | 1.2.0 |
| Solana CLI (Agave) | 4.x (stable) |
| Rust | 1.89 (workspace-pinned) / 1.98 host |
| Node / pnpm | 22 / 10.17 |

Solana/Anchor development runs in **WSL2 Ubuntu**. Build & test:

```bash
anchor build          # compile the program
anchor test           # Rust + LiteSVM tests (in-process, no validator)
```

## Status

Milestone-based build for the Colosseum Crypto World's Fair (submission 2026-10-12).

- [x] **M0** Toolchain + monorepo scaffold
- [ ] **M1** Anchor program + tests (the enforcement core)
- [ ] **M2** TS SDK
- [ ] **M3** MCP server + owner CLI
- [ ] **M4** Dashboard (live tree)
- [ ] **M5** Demo scenario
- [ ] **M6** Devnet deploy, docs, video

Everything runs on **devnet / local validator**. No mainnet keys.

## License

MIT
