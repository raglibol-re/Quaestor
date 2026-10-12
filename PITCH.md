# Quaestor — Pitch & Submission

> **Give your agent a mandate, not a wallet.**

---

## One-liner

**Quaestor is delegable spending authority for AI agents.** A human grants an agent a
**Mandate** — an amount, a policy, and a lifetime bound to one agent key — and the agent can
carve **sub-mandates** for the agents it spawns. Every level is enforced on-chain, attributed
per spend, and revocable instantly, without ever handing an agent a private key.

## Elevator pitch (30s)

Autonomous agents are starting to spend money — on data, compute, APIs, and each other. Today
you either hand an agent a private key (and hope a bug or prompt injection doesn't drain it) or
use a spend limit built to cap **one wallet**: *one human → one agent*. But real agent systems
are **hierarchies** — an orchestrator spawns researchers, a researcher spawns scrapers. Quaestor
makes the **Mandate** the primitive. A human funds a project; each agent gets a mandate it can
sub-delegate — **never wider than its own**, with per-transaction and time-window limits. Every
spend is checked against the entire ancestor chain **inside the contract**, so freezing one node
stops its whole subtree instantly, and every spend carries a **task_id + reason** you can audit.
Agents reach their mandate over **MCP** and need no gas — a relayer pays fees. Compromise an
agent and you leak a *mandate*, never a wallet.

---

## The problem

- **Keys are all-or-nothing.** Give an agent a funded key and one bug/injection drains it.
- **Existing agent wallets and spend limits are flat.** Coinbase Agentic Wallets, Squads spending
  limits, and native SPL delegates all cap **one wallet**. They can't express "the research branch
  may spend ≤ 2 USDC, 0.50/tx, and I can freeze that entire branch."
- **Off-chain guardrails are bypassable.** If the limit lives in a server or the agent's prompt, a
  compromised agent ignores it. The rule has to live where the money does.

## The solution

The **Mandate** — not the key — is the first-class object. Three invariants, stated plainly,
enforced in the contracts and tested on **both** Solana and EVM:

1. **Monotone delegation.** A sub-mandate is tighter-or-equal to its parent on **every** dimension
   — amount, allowlists, rate, expiry, escalation threshold. No agent can widen its own authority.
2. **No path out of the vault bypasses the policy check.** Every outflow goes through the same
   check-and-spend path; owner withdrawal is the only exception and is owner-signed.
3. **The principal can always revoke/freeze whole branches, immediately, without the agent's
   cooperation.** Freeze cascades; revoke returns unspent amounts up the tree.

| | Flat agent wallets / spend limits | **Quaestor** |
|---|---|---|
| Scope | caps **one wallet** | delegates **authority down a chain of agents** |
| Delegation | — | agent sub-delegates, **capped by what it holds** |
| Limits | balance only | per-tx + time-window + expiry, **tighter-or-equal down the tree** |
| Enforcement | server / SDK | **in the contract** |
| Attribution | — | **task_id + reason per spend**, hashed on-chain |
| Kill switch | revoke one key | **freeze a node → whole subtree stops** |
| Agent needs gas? | yes | **no — relayer pays fees** |
| Blast radius if agent compromised | whole wallet | **one mandate node** |

**Positioning.** Cloaked Agent, Squads spending limits, and native SPL delegates all cap a
*single wallet*. Quaestor delegates *authority down a chain of agents* — with monotone tightening,
attribution, and human escalation. **Altitude (Squads) is the humans' stablecoin account; Quaestor
is the agents' mandate layer on top of it.**

## Why now

- Agent frameworks (MCP, agentic wallets) shipped in 2025–26; agents-that-pay is the next step.
- Stablecoin rails on Solana are fast and cheap enough for per-action machine payments.
- MCP gives every agent a standard way to call tools — so a mandate can be *a tool*.

## Business model

The mandate/policy layer is the **control plane for agent spend**: **SaaS** for the dashboard +
policy engine, plus a **take-rate on mandated agent spend** — sitting *atop* Altitude-style
stablecoin accounts rather than competing with them.

---

## Per-chain showcase

One story per chain, no overlap — each plays to what that chain is best at:

| Chain | Showcase | Why this chain |
|---|---|---|
| **Solana** | A **research agent fleet** paying x402 APIs. One agent overspends → **rejected on-chain** → its **branch is frozen** → **cost per report chapter** on the dashboard. | Fast, cheap, richest x402 / MCP tooling. |
| **Tempo** | A **stablecoin payout agent** paying contractors in tranches, with attribution in the chain's **native memo**. | A stablecoin-native payments chain. |
| **Base** | A mandate **bound to an agent identity** (ERC-8004 on the roadmap), running the **same policy schema** as Solana. | EVM reach and the Coinbase agent ecosystem. |
| **Hyperliquid** | A **trading desk**: pre-trade risk limits — allowed assets, max notional/order, max notional/day, **equity-floor drawdown stop** — enforced on **HyperEVM against live HyperCore state** *before* the CoreWriter order. | The one chain where **agent trading risk** is the obvious product. |

---

## What's live (not a mock)

- **Solana program on devnet:** `FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP` — 10 instructions,
  ancestor-chain enforcement, reservation accounting. **28 Rust/LiteSVM tests** incl. a randomized
  property test on the accounting invariant.
- **EVM port** (`Quaestor.sol`) — a faithful Solidity port, **18 Foundry tests incl. an invariant
  fuzz**, with **on-chain attribution** (`Spent(…, taskId, reasonHash)`) and an **ERC-2771 gasless
  forwarder** so agents hold no gas on EVM either.
- **QuaestorDesk** (`contracts/src/QuaestorDesk.sol`) — the **Hyperliquid trading-risk mandate**:
  allowed assets, max notional/order, max notional/day, and an equity-floor drawdown stop, checked
  on HyperEVM against live HyperCore state before the CoreWriter order. **12 Foundry tests incl. an
  invariant.**
- **Spend attribution:** every spend carries **task_id + reason** — an **SPL Memo** on Solana/Tempo
  and the **`Spent` event** on EVM, plaintext in an off-chain log — so spend is auditable, a "Why?"
  per payment, and rolls up to **cost per task**.
- **9-tool MCP server** an agent drives from Claude Desktop/Code (`get_my_mandate`, `pay`,
  `create_submandate`, `list_subagents`, `freeze_subagent`, `revoke_subagent`, `reclaim_subagent`,
  `get_history`, `pay_x402`) behind a **`QUAESTOR_CHAIN`** switch — same tools drive Solana or EVM.
  Encrypted local keystore (scrypt + AES-256-GCM) so the model never sees a key.
- **x402:** agents pay for paywalled HTTP resources **directly from a mandate** — the per-tx/daily/
  freeze limits apply to real API payments; an over-limit request is rejected before the resource is
  fetched.
- **Owner CLI** + a **live dashboard:** https://quaestor-dashboard.vercel.app
- **Reproducible demos** on devnet (Solana) and anvil (EVM gasless + x402) with real explorer links.

## Technical highlights (why judges should care)

- **One invariant secures the system:** `spent + reserved_for_children ≤ allocated`, enforced with
  checked math + a pre-check on every mutation, and fuzz-tested.
- **Forgery-proof ancestor walk:** each ancestor is re-derived from its PDA seeds, type-checked, and
  the chain's termination is enforced — no forged/padded/cyclic chains.
- **Real bugs caught in design review before writing code:** revoked-ancestor reclaim deadlock,
  `0`-as-unlimited sentinel ambiguity, period-boundary burst exploit — all fixed and tested.
- **Relayer/fee-payer separation:** agents sign to prove authority; the fee-payer is never an
  authority.

---

## Pitch deck outline (7 slides)

1. **Title** — "Quaestor · Give your agent a mandate, not a wallet." + live dashboard URL.
2. **Problem** — Agents are starting to spend. Keys = all-or-nothing; existing wallets cap one wallet.
   (Show a drained-wallet horror + a flat allowance that can't express a hierarchy.)
3. **Insight** — Real agent systems are chains of agents, not pairs. Make the *mandate* the primitive.
4. **Solution / demo** — the 90s live demo (delegate → spend → over-limit rejected → freeze stops
   subtree → reclaim). This slide *is* the video.
5. **How it works** — one vault, reservation accounting, ancestor-chain enforcement on-chain, per-spend
   attribution; agents need no gas (relayer). One diagram.
6. **Why us / why now** — the three guarantees + positioning (Altitude is the humans' account; Quaestor
   is the agents' mandate layer on top) + MCP-native + multi-chain.
7. **Traction & business model** — live on Solana/EVM/Hyperliquid, real MCP + dashboard, fuzz-tested
   contracts. Control plane for agent spend: SaaS + take-rate. Close on the tagline.

---

## Colosseum submission — field answers (draft)

- **Name:** Quaestor
- **Tagline:** Give your agent a mandate, not a wallet — delegable spending authority for AI agents.
- **Tracks:** Solana · Tempo · Base · Hyperliquid · general pool · University Prize
- **Category:** Payments / AI agents / infrastructure
- **Short description:** Quaestor is **delegable spending authority for AI agents**. A human grants an
  agent a **Mandate** (amount + policy + lifetime, bound to one agent key); the agent carves
  **sub-mandates** for the agents it spawns — each **tighter-or-equal** to its own. Three guarantees,
  enforced in the contract and tested on Solana and EVM: **monotone delegation** (no agent widens its
  own authority), **no outflow bypasses the policy check** (owner withdrawal is the only, owner-signed,
  exception), and **the principal can freeze/revoke whole branches instantly** (freeze cascades, revoke
  returns unspent funds up the tree). Every spend carries a **task_id + reason** hashed on-chain.
  Agents access mandates over MCP and need no gas — a relayer pays fees.
- **Per-chain showcase:** Solana — a research agent fleet paying x402 APIs, an overspend rejected and
  its branch frozen, cost per report chapter. Tempo — a stablecoin payout agent paying contractors in
  tranches, attribution in the native memo. Base — a mandate bound to an agent identity (ERC-8004 on
  the roadmap), same policy schema as Solana. Hyperliquid — a trading desk with pre-trade risk limits
  (allowed assets, max notional/order, max notional/day, equity-floor drawdown stop) enforced on
  HyperEVM against live HyperCore state before the CoreWriter order.
- **Tech used:** Solana, Anchor 1.2, SPL Token (+ SPL Memo for attribution), LiteSVM; **Solidity 0.8 +
  Foundry, OpenZeppelin (ERC-2771 forwarder, SafeERC20), viem** for the EVM port; **QuaestorDesk** on
  HyperEVM + HyperCore (CoreWriter); **x402** payment protocol; Model Context Protocol (MCP),
  TypeScript SDKs, Next.js + Solana Wallet Adapter, Vercel. Solana devnet RPC by **RPC Fast** (Superteam
  sidetrack).
- **Business model:** the mandate/policy layer as the control plane for agent spend — SaaS for the
  dashboard + policy engine, and a take-rate on mandated agent spend, sitting atop Altitude-style
  stablecoin accounts.
- **Links:**
  - Dashboard: https://quaestor-dashboard.vercel.app
  - Solana program (devnet): https://explorer.solana.com/address/FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP?cluster=devnet
  - EVM contract (Base Sepolia): https://sepolia.basescan.org/address/0xe704014D856aecD47B797CF47d42648060276d43
  - Repo: https://github.com/raglibol-re/Quaestor
  - Demo video: <add before submit>
- **What's next (roadmap):** *Near-term* — plain-language mandates (Claude API fills a policy schema),
  escalation/approvals (Blink + Telegram), dead-man switch, session keys, cost-per-task dashboard +
  burn-rate forecast, x402 receipts, Reflect yield on the idle vault, Phantom Connect, policy replay.
  *Later* — identity binding (Metaplex Agent Registry / ERC-8004 "Know Your Agent"), reputation-weighted
  mandate sizing, cross-org sub-mandates with escrow, governance-originated mandates (Realms),
  confidential mandates.
