# Demo video script (~90–100 seconds)

Goal: show that the limits are **real and on-chain** — not a UI mock. The strongest beats are the
**three rejections** — over-limit spend, frozen-ancestor, and an over-risk **trade** on Hyperliquid —
plus the **live tree** reacting and **attribution** (a task + reason on every spend).

## Setup (before you hit record)

1. Two windows side by side:
   - **Left:** a terminal ready to run the demo.
   - **Right:** the dashboard at https://quaestor-dashboard.vercel.app
2. In the terminal, export the RPC (served by **RPC Fast**) + funded owner keypair, then start the
   demo. Use a slightly longer pause so the tree is readable on camera:
   ```bash
   export QUAESTOR_RPC_URL="<rpc-fast-devnet-endpoint>"
   export QUAESTOR_OWNER_KEYPAIR="$HOME/.config/solana/id.json"
   export DEMO_PAUSE_MS=4000
   bash scripts/demo.sh
   ```
3. STEP 1 prints a **project address**. Paste it into the dashboard's "Load" box so the tree is on
   screen and updating as the terminal advances.
4. For the Hyperliquid coda, have a second terminal ready in `contracts/` to run
   `forge test --match-contract QuaestorDesk -vv` (deterministic; shows the pre-trade rejections).
   Once the desk is live on HyperEVM testnet, you can instead show a live `placeOrder` rejection.
5. Record at 1080p; zoom the terminal font so text is legible. Keep the cursor out of the way.

## Shot list & voiceover

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Title / dashboard empty | "AI agents are starting to spend money. Handing an agent a private key is all-or-nothing — one bug and it's drained. Quaestor gives your agent a **mandate, not a wallet**." |
| 0:08–0:20 | Terminal STEP 1–2; tree shows project → orchestrator | "A human funds a project with 10 USDC, then gives an orchestrator agent a 6-USDC **mandate** — on Solana." |
| 0:20–0:32 | STEP 3; research node appears under orchestrator | "The orchestrator carves a 2-USDC **sub-mandate** for a research agent, capped at 50 cents per transaction. The agent signs to prove it owns the node — but holds **no SOL**; a relayer pays the fee." |
| 0:32–0:44 | STEP 4; two 0.50 spends with `task=` / `reason=` + explorer links | "Research pays for data — twice, within its limit. And every spend is **attributed**: a task id and a reason, hashed on-chain, so you get cost-per-task and a 'why' for each payment." |
| 0:44–0:57 | STEP 5; **BLOCKED** line | "Now it tries to spend 3 USDC — **rejected on-chain**, over the per-transaction limit. The rule lives in the program, not a server it could bypass." |
| 0:57–1:10 | STEP 6; owner freezes orchestrator; research payment **BLOCKED** | "The human freezes the orchestrator — and the research agent below it **can't spend either**. Freeze one node, the whole subtree stops instantly." |
| 1:10–1:20 | STEP 7; reclaim; orchestrator available goes up | "Revoke and reclaim: unused funds flow back up the tree. Already-spent money stays spent — the accounting is exact." |
| 1:20–1:35 | Second terminal: `forge test --match-contract QuaestorDesk`; `OrderNotionalExceeded` / `EquityFloorBreached` reverts scroll by | "Same idea, higher stakes: on **Hyperliquid**, a trading agent gets a mandate — allowed assets, max notional, an equity floor. An order above the risk limit is **rejected pre-trade**, on HyperEVM, before it ever reaches the exchange." |
| 1:35–1:45 | Dashboard final tree + tagline | "One policy schema, across Solana and three EVM chains. Delegated, attributed, revocable. **Give your agent a mandate, not a wallet.**" |

## Tips

- If a transaction is slow on camera, the `DEMO_PAUSE_MS` gap covers it; don't cut mid-step.
- Capture at least one **explorer link** click (STEP 4) to prove it's on-chain — and let the `task=`/`reason=` line show, that's the attribution beat.
- The **three** rejection lines are the punchline — over-limit, frozen-ancestor, over-risk trade. Let each sit on screen for a full beat.
- Keep it tight; the Colosseum audience skims. Lead with the problem, end on the tagline.
- If you want a strict 90s cut, the Hyperliquid coda (1:20–1:35) can be trimmed to a 6-second flash of the two red `revert` lines.
