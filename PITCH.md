# Quaestor — Pitch & Submission

> **Give agents budgets, not keys.**

---

## One-liner

Quaestor gives AI agents **hierarchical, on-chain-enforced USDC budgets** on Solana —
so a human can fund a whole tree of agents, cap every branch, and freeze any of it
instantly, without ever handing an agent a private key.

## Elevator pitch (30s)

Autonomous agents are starting to spend money — on data, compute, APIs, and each other.
Today you either hand an agent a private key (and hope a bug or prompt injection doesn't
drain it) or use a flat allowance built for *one human → one agent*. But real agent
systems are **hierarchies**: an orchestrator spawns researchers, a researcher spawns
scrapers. Quaestor makes the **budget** the primitive. A human funds a project; each agent
gets a budget node it can sub-delegate — never more than it holds — with per-transaction
and time-window limits. Every spend is checked against the entire ancestor chain **inside
the Solana program**, so freezing one node stops its whole subtree instantly. Agents reach
their budget over **MCP** and need no SOL — a relayer pays fees. Compromise an agent and
you leak a *budget*, never a wallet.

---

## The problem

- **Keys are all-or-nothing.** Give an agent a funded key and one bug/injection drains it.
- **Existing agent wallets are flat.** Coinbase Agentic Wallets, Turnkey, SPL delegation all
  model *one human → one agent*. They can't express "the research branch may spend ≤ 2 USDC,
  0.50/tx, and I can freeze that entire branch."
- **Off-chain guardrails are bypassable.** If the limit lives in a server or the agent's
  prompt, a compromised agent ignores it. The rule has to live where the money does.

## The solution

The budget — not the key — is the first-class object.

| | Flat agent wallets | **Quaestor** |
|---|---|---|
| Structure | one human → one agent | **arbitrary hierarchy** (orchestrator → researcher → scraper) |
| Delegation | — | agent sub-delegates, **capped by what it holds** |
| Limits | balance only | per-tx + time-window + expiry, **tighter-or-equal down the tree** |
| Enforcement | server / SDK | **in the Solana program** |
| Kill switch | revoke one key | **freeze a node → whole subtree stops** |
| Agent needs SOL? | yes | **no — relayer pays fees** |
| Blast radius if agent compromised | whole wallet | **one budget node** |

## Why now

- Agent frameworks (MCP, agentic wallets) shipped in 2025–26; agents-that-pay is the next step.
- Stablecoin rails on Solana are fast and cheap enough for per-action machine payments.
- MCP gives every agent a standard way to call tools — so a budget can be *a tool*.

---

## What's live (not a mock)

- **Solana program on devnet:** `FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP` — 10 instructions,
  ancestor-chain enforcement, reservation accounting. **28 Rust/LiteSVM tests** incl. a randomized
  property test on the accounting invariant.
- **Multi-chain:** a faithful **EVM port** (`Quaestor.sol`, 18 Foundry tests incl. an invariant
  fuzz) with an **ERC-2771 gasless forwarder** — agents hold no gas on EVM either — behind a
  `QUAESTOR_CHAIN` switch, so the same MCP tools drive Solana or Tempo/Base.
- **Ancestor-agent freeze:** a parent/grandparent *agent* can freeze a descendant subtree on-chain,
  not just the human owner.
- **x402:** agents pay for paywalled HTTP resources **directly from a budget** — the per-tx/daily/
  freeze limits apply to real API payments; an over-limit request is rejected before the resource
  is fetched.
- **Real MCP server** (9 tools) an agent drives from Claude Desktop/Code; encrypted local keystore
  (scrypt + AES-256-GCM) so the model never sees a key. **Owner CLI** + a **live dashboard**:
  https://quaestor-dashboard.vercel.app
- **Reproducible demos** on devnet (Solana) and anvil (EVM gasless + x402) with real explorer links.

## Technical highlights (why judges should care)

- **One invariant secures the system:** `spent + reserved_for_children ≤ allocated`, enforced
  with checked math + a pre-check on every mutation, and fuzz-tested.
- **Forgery-proof ancestor walk:** each ancestor is re-derived from its PDA seeds, type-checked,
  and the chain's termination is enforced — no forged/padded/cyclic chains.
- **Real bugs caught in design review before writing code:** revoked-ancestor reclaim deadlock,
  `0`-as-unlimited sentinel ambiguity, period-boundary burst exploit — all fixed and tested.
- **Relayer/fee-payer separation:** agents sign to prove ownership; the fee-payer is never an
  authority.

---

## Pitch deck outline (7 slides)

1. **Title** — "Quaestor · Give agents budgets, not keys." + live dashboard URL.
2. **Problem** — Agents are starting to spend. Keys = all-or-nothing; existing wallets are flat.
   (Show a drained-wallet horror + a flat allowance that can't express a hierarchy.)
3. **Insight** — Real agent systems are trees, not pairs. Make the *budget* the primitive.
4. **Solution / demo** — the 90s live demo (allocate → spend → over-limit rejected → freeze
   stops subtree → reclaim). This slide *is* the video.
5. **How it works** — one vault, reservation accounting, ancestor-chain enforcement on-chain;
   agents need no SOL (relayer). One diagram.
6. **Why us / why now** — differentiation table + MCP-native + Solana stablecoin rails.
7. **Traction & roadmap** — live on devnet, real MCP + dashboard, 25 tests. Next: multi-chain
   (Tempo + Ethereum, one Solidity contract), ancestor-agent freeze, x402. Close on the tagline.

---

## Colosseum submission — field answers (draft)

- **Name:** Quaestor
- **Tagline:** Give agents budgets, not keys — hierarchical, on-chain-enforced USDC budgets for AI agents.
- **Track:** Solana
- **Category:** Payments / AI agents / infrastructure
- **Short description:** Quaestor lets a human fund a project with USDC and hand AI agents
  *budget nodes* instead of private keys. Agents sub-delegate to sub-agents (never more than
  they hold), with per-transaction and time-window limits enforced inside the Solana program.
  Freeze any node and its whole subtree stops instantly. Agents access budgets over MCP and
  need no SOL — a relayer pays fees.
- **Tech used:** Solana, Anchor 1.2, SPL Token, LiteSVM; **Solidity 0.8 + Foundry, OpenZeppelin
  (ERC-2771 forwarder, SafeERC20), viem** for the EVM port; **x402** payment protocol; Model
  Context Protocol (MCP), TypeScript SDKs, Next.js + Solana Wallet Adapter, Vercel.
- **Links:**
  - Dashboard: https://quaestor-dashboard.vercel.app
  - Program (devnet): https://explorer.solana.com/address/FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP?cluster=devnet
  - Repo: https://github.com/raglibol-re/Quaestor
  - Demo video: <add before submit>
- **What's next:** Public-testnet EVM deployments (Tempo + Base Sepolia — the contract + gasless
  relayer are deploy-ready), a chain-switch dashboard that renders either chain's tree live, and a
  mainnet hardening pass.
