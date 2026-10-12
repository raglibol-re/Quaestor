# Submission package — Colosseum Crypto World's Fair

Ready-to-paste answers + a pre-submission checklist. Deadline: **2026-10-12, 11:59 pm PT**
(Superteam sidetracks close **2026-10-13, 06:59 UTC**).

## Colosseum form

- **Name:** Quaestor
- **Tagline:** Give your agent a mandate, not a wallet.
- **One-liner:** Delegable, on-chain-enforced spending authority for AI agents — across Solana, Base, Tempo, and Hyperliquid.
- **Tracks:** Solana · Tempo · Base · Hyperliquid · general pool · University Prize
- **Description (short):**
  > Quaestor makes the **mandate** the first-class object, not the private key. A human grants an agent a Mandate — an amount, a policy, and a lifetime, bound to one agent key — and the agent can carve tighter **sub-mandates** for the agents it spawns. Three invariants are enforced in the contract and tested on Solana and EVM: (1) **monotone delegation** — a sub-mandate can only narrow its parent; (2) **no outflow bypasses the policy check**; (3) **the principal can always freeze or revoke whole branches instantly**. Every spend is **attributed** (task_id + reason, hashed on-chain) so agent spending is auditable, not just capped. Agents reach their mandate over an **MCP server** and hold no gas (a relayer pays fees). One policy schema runs on **Solana** (Anchor), **Base/Tempo** (`Quaestor.sol`), and **Hyperliquid** (`QuaestorDesk` — pre-trade risk limits enforced on HyperEVM against live HyperCore state).
- **Tech:** Anchor/Rust (Solana program, LiteSVM + property tests) · Solidity/Foundry (`Quaestor.sol` + `QuaestorDesk.sol`, invariant fuzz) · TypeScript SDKs (`@quaestor/sdk`, `@quaestor/evm-sdk` with EIP-2771 gasless forwarder) · MCP server (stdio, `QUAESTOR_CHAIN` switch) · Next.js dashboard · x402 · RPC Fast.
- **Links:**
  - Repo: https://github.com/raglibol-re/Quaestor
  - Dashboard: https://quaestor-dashboard.vercel.app
  - Demo video: `<ADD URL>`
  - Solana program (devnet): `FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP`
  - Base Sepolia contract: `0xe704014D856aecD47B797CF47d42648060276d43`
- **What's next:** plain-language mandates (describe a budget in English → policy schema → on-chain), over-limit escalation with human approval (Blink + Telegram), cost-per-task dashboard + burn-rate forecast, identity binding (ERC-8004 / Metaplex Agent Registry), reputation-weighted mandate sizing.

## Superteam Earn — RPC Fast sidetrack

- The Solana devnet RPC is served by **RPC Fast**; stated in the README (under the live-links table) and in the submission. Submit on Superteam Earn **before Oct 13 06:59 UTC** with the repo + a note that the demo + dashboard read Solana state through RPC Fast.
- Endpoint in use: `<ADD RPC FAST ENDPOINT>` (set as `QUAESTOR_RPC_URL` / `NEXT_PUBLIC_RPC_URL`).

## University Prize

- Eligibility: solo founder affiliated with **TUM** (tum-blockchain.com). Attach any required proof of student/university status; flag the University Prize checkbox on the Colosseum form.

## Build-in-public post (Dapping)

> Shipped Quaestor for the Colosseum Crypto World's Fair: **delegable spending authority for AI agents.** Give your agent a *mandate*, not a wallet — an amount + policy + lifetime it can sub-delegate to the agents it spawns, each tighter than the last, enforced on-chain and revocable in one click. Every spend is attributed (task + reason, hashed on-chain), so you get a "why" and cost-per-task. One policy schema runs on Solana, Base, Tempo — and on **Hyperliquid**, where a trading agent's orders are risk-checked *pre-trade* on HyperEVM against live exchange state. Agents hold no gas; a relayer pays. 🏛️ Give your agent a mandate, not a wallet.

## Pre-submission checklist

- [ ] Record the ~90s demo video (script: `docs/demo-script.md`) — three rejection beats (over-limit spend, frozen-ancestor, over-risk Hyperliquid trade) + the attribution line.
- [ ] Add the video URL to the Colosseum form + `PITCH.md`.
- [ ] Set `QUAESTOR_RPC_URL` / `NEXT_PUBLIC_RPC_URL` to the RPC Fast endpoint (verify it serves `getProgramAccounts` for the dashboard tree-fetch).
- [ ] (Optional, go-live) redeploy `Quaestor.sol` to Base Sepolia + Tempo **with attribution** (`forge script Deploy.s.sol --broadcast`); set the dashboard `NEXT_PUBLIC_EVM_*` vars on Vercel to light up the EVM tab.
- [ ] (Optional, go-live) deploy `QuaestorDesk` to HyperEVM testnet (enable big-block first) and run the fork test.
- [ ] Submit the Colosseum form (all tracks), Superteam RPC Fast, University Prize.
- [ ] Post the build-in-public update on Dapping.
