# Demo video script (~90 seconds)

Goal: show that the limits are **real and on-chain** — not a UI mock. The strongest beats
are the two **rejections** (over-limit + frozen-ancestor) and the **live tree** reacting.

## Setup (before you hit record)

1. Two windows side by side:
   - **Left:** a terminal ready to run the demo.
   - **Right:** the dashboard at https://quaestor-dashboard.vercel.app
2. In the terminal, export the devnet RPC + funded owner keypair, then start the demo. Use a
   slightly longer pause so the tree is readable on camera:
   ```bash
   export QUAESTOR_RPC_URL="<devnet-rpc>"
   export QUAESTOR_OWNER_KEYPAIR="$HOME/.config/solana/id.json"
   export DEMO_PAUSE_MS=4000
   bash scripts/demo.sh
   ```
3. STEP 1 prints a **project address**. Paste it into the dashboard's "Load" box so the tree
   is on screen and updating as the terminal advances.
4. Record at 1080p; zoom the terminal font so text is legible. Keep the cursor out of the way.

## Shot list & voiceover

| Time | On screen | Voiceover |
|---|---|---|
| 0:00–0:08 | Title / dashboard empty | "AI agents are starting to spend money. But handing an agent a private key is all-or-nothing — one bug and it's drained. Quaestor gives agents **budgets**, not keys." |
| 0:08–0:20 | Terminal STEP 1–2; tree shows project → orchestrator | "A human funds a project with 10 USDC, then gives an orchestrator agent a 6-USDC budget — all on Solana." |
| 0:20–0:32 | STEP 3; research node appears under orchestrator | "The orchestrator delegates 2 USDC to a research sub-agent, capped at 50 cents per transaction. The agent signs to prove it owns the node — but it holds **no SOL**; a relayer pays the fee." |
| 0:32–0:42 | STEP 4; two 0.50 spends, explorer links | "Research pays for data — twice, within its limit. Real transactions, real USDC." |
| 0:42–0:55 | STEP 5; **BLOCKED** line | "Now it tries to spend 3 USDC — **rejected on-chain**, because it's over the per-transaction limit. The rule lives in the program, not a server it could bypass." |
| 0:55–1:10 | STEP 6; owner freezes orchestrator; research payment **BLOCKED** | "The human freezes the orchestrator — and the research agent below it **can't spend either**. Freeze one node, and the whole subtree stops instantly." |
| 1:10–1:22 | STEP 7; reclaim; orchestrator available goes up | "Revoke and reclaim: the unused funds flow back up the tree. Already-spent money stays spent — the accounting is exact." |
| 1:22–1:30 | Final tree on dashboard | "Hierarchical budgets, enforced on Solana, accessed over MCP. **Give agents budgets, not keys.**" |

## Tips

- If a transaction is slow on camera, the `DEMO_PAUSE_MS` gap covers it; don't cut mid-step.
- Capture at least one **explorer link** click (STEP 4) to prove it's on-chain — optional B-roll.
- The two rejection lines are the punchline — let them sit on screen for a full beat.
- Keep it under 90s; the Colosseum audience skims. Lead with the problem, end on the tagline.
