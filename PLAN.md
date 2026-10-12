# Quaestor — `PLAN.md` (Crypto World's Fair, submission day 2026-10-12)

> **Execution plan for submission day.** Scope is **maximal breadth** (all of Tier A + Tier B). Each task is written atomically enough to hand to a coding agent. This file is the source of truth for *what* and *why*; live status is tracked in the working session.

---

## Context — why this change

Quaestor today is "hierarchical on-chain **budgets** for AI agents": a working Solana devnet demo, an EVM port (`Quaestor.sol` + anvil demo), a 9-tool MCP server behind a `ChainOps` switch, and a Solana-only dashboard. The brief **repositions** it and the submission must reflect that:

> **Quaestor is delegable spending authority for AI agents. "Give your agent a mandate, not a wallet."**

A human states, in plain language, what an agent may spend; the agent gets a **Mandate** (amount + policy + lifetime), can carve **sub-mandates**, and every level is enforced on-chain, attributed, and revocable. The job today is to make the *submission* express this — **budget → Mandate** everywhere user-facing, spend **attribution**, the **Hyperliquid trading-risk** showcase, **RPC Fast**, and a positioning-led README.

**Three guarantees** (already enforced in both chains; nothing today may regress them — state them in the README, keep the tests):
1. **Monotone delegation** — a sub-mandate is tighter-or-equal on every dimension (`_limitWithin`/`_expiryWithin`, `contracts/src/Quaestor.sol:157-175`; child-≤-parent in `programs/quaestor/src/instructions/allocate_child.rs`).
2. **No outflow bypasses the policy check** — one checked path; owner withdraw is the only owner-signed exception.
3. **The principal can always freeze/revoke whole branches** — freeze cascades via the ancestor walk; revoke returns unspent funds up-tree.

---

## Strategy — what actually wins, and the cut-line

**Scope: Maximal breadth (confirmed).** Attempt all of Tier A **and** Tier B today — full Hyperliquid (incl. live fork test + deploy), live Base + Tempo deploys, and the dashboard chain-switch. The cut-line below is a **last-resort safety net**, not the default path; cut only if the clock genuinely forces it. (This was chosen with the focused-quality alternative explicitly weighed.)

The brief says judges score **startup potential, business model, product quality — not feature count**. The founder chose, today: *full Tier-0 Hyperliquid*, *go live on public testnets*, and *rename the MCP tool names*. Those are the **targets**. But cramming four live deploys + a new multi-chain dashboard + a live fork test into one solo day is the fastest way to ship four flaky things and *lower* product quality. So this plan honors the aggressive target **and** protects quality with an explicit order and cut-line:

- **The winning story** (lead every surface with it): *one policy schema → mandates that sub-delegate, are attributed and revocable, across Solana + 3 EVM chains; and on Hyperliquid, pre-trade **trading-risk** mandates enforced against live exchange state.* Hyperliquid is the differentiator — no competitor (Cloaked Agent, Squads limits, SPL delegates, Altitude) delegates *authority down a chain of agents*, and none touches trading risk.
- **Tier A — submission-critical (must land; this is the thesis, all low/medium risk):** rename→Mandate · attribution · RPC Fast · `QuaestorDesk` contract + tests + a **scripted** HL demo (provable locally) · positioning-led README/PITCH · 90s demo-script update · forms.
- **Tier B — go-live stretch (do only while each stays solid; a flaky live deploy hurts more than a clean local demo):** live Base/Tempo/HyperEVM deploys · live fork test · MCP desk backend · dashboard chain-switch.
- **Cut-line (shed in this order if the day tightens, so quality never degrades):** B5 dashboard chain-switch → B4 MCP desk → B3-forktest (keep the deploy, drop the live fork test) → B2 Tempo → B1 Base. Tier A is never cut.
- **The cut-line has a track cost (decide per track):** entering the Solana/Tempo/Base/Hyperliquid tracks generally expects a presence *on that chain* — cutting B1/B2/B3 weakens the matching **track entry**, not just a feature. The HL track effectively wants a HyperEVM-deployed desk, so B3 is "optional for the day, not optional for the HL track." Pick chain-by-chain which track entries to actually contest.
- **Tier-A-minimal fallback (if only hours remain):** Tier A alone is ~8h solo. If the clock forces it, the smallest *coherent* submission is **A1 (rename) + A5 (positioning README) + A6 (demo) + A7 (forms)** — the repositioning is the thesis and ships even without attribution or HL. Add back A2 (attribution) then A4 (HL desk), in that order.

**Critical path:** A1 → A2 → A4(contract+tests) → A6/A5 → A7. A3 (RPC Fast) and all of Tier B parallelize against A4 as URLs/funds arrive. **The ~90s demo video is founder-recorded, gates the final submission, and sits on the critical path to A7 — record it once Tier A is stable.**

**Execution rules:** commit+push after each task (`git add <path>`, **never `-A`** — a parallel session commits `brand/`+dashboard under the same identity). **Coordinate, don't collide:** `brand/` and the dashboard chain-switch (B5) are owned by the founder / that parallel session — don't commit `brand/` or rebuild B5 without checking it isn't already in flight. The Solana demo is the one thing already working; A2 is designed so it need not break (below). **Where things build:** Rust/Anchor/`forge` run in **WSL2** (`forge` at `~/.foundry/bin`); verify tx-confirming flows on **devnet**, not the WSL local validator (it cold-starts confirmations — a known artifact). After A2's IDL regen, rebuild the SDK before the demo. **Secrets:** deploy/relayer keys live only in `.env` (gitignored) — never commit keys or `.env`; keep the secret-scan clean.

---

## 1. Tier 0 task list

Legend — **Risk**: 🟢 none · 🟡 contained · 🔴 can break the live Solana demo.

### Tier A — submission-critical (must land)

| # | Task | Package / files | Acceptance | Risk · Est |
|---|---|---|---|---|
| **A1** | **Rename budget → Mandate** (incl. tool names + legacy aliases) | dashboard `apps/dashboard/app/page.tsx` (L135,152,179,181,19,189), `app/layout.tsx` (L26-27), `components/BudgetNode.tsx` (L39,62), `components/brand/StatusBadge.tsx` labels; MCP `packages/mcp-server/src/server.ts` (titles/descriptions L52-301; rename `get_my_budget`→`get_my_mandate`, `create_subagent_budget`→`create_submandate` + register old names as hidden aliases), `errors.ts` (L6-32,64,68), `evmOps.ts` (L29-47), backing `chainOps.ts` methods; SDK rendered text `packages/sdk/src/format.ts:142,149`; `README.md`,`PITCH.md`,`docs/*`,`brand/README.md` | `rg -i "\bbudget" apps/ README.md PITCH.md docs/` → only intentional/internal hits; dashboard builds; MCP advertises `*_mandate` and old aliases still resolve | 🟡 · 60–90m |
| **A2** | **Spend attribution** `task_id` + `reason` | **Solana — primary (product-correct):** add `task_id:[u8;32]` + `reason_hash:[u8;32]` to `spend` (`programs/quaestor/src/lib.rs:71`, `instructions/spend.rs:37`) and to the `Spent` event (`events.rs:30`, emit `spend.rs:122`); redeploy devnet (same program id), regen IDL via `scripts/gen-idl-bundle.js`, rebuild SDK, re-run demo. **Safe fallback if redeploy misbehaves:** relayer appends an **SPL Memo** ix carrying `task_id\|reason_hash` to the spend tx — *no program change*. **EVM (free, deploying fresh):** add `bytes32 taskId,bytes32 reasonHash` to `spend`+`Spent` (`contracts/src/Quaestor.sol:429,114,462`), update `evm-sdk/src/client.ts:404` + regen `abi/quaestor.ts`. **Both:** wire MCP `pay` (`server.ts` handler → `chainOps.ts:55` → `operations.ts:40`; reuse the already-declared optional `memo` as `reason`, add `task_id`); append plaintext to `~/.quaestor/attribution.jsonl`; enrich `get_history` (`operations.ts:186`) | a spend shows the two hashes on-chain (event or Memo) on the explorer; JSONL has plaintext; demo prints `task=… reason=…`; **all 28 Solana tests + the property test stay green** (attribution must not touch accounting) | 🔴→🟡 · 90m |
| **A3** | **RPC Fast** swap + note | `packages/mcp-server/src/config.ts:21`, `apps/dashboard/lib/config.ts:1-2`, `.env.example:24`, `README.md`, `docs/devnet.md` | demo + dashboard run on the RPC Fast endpoint; README + submission cite it; **verify it serves `getProgramAccounts`** (the dashboard tree-fetch needs it — public devnet RPC disables it). **Needs the URL — Q1** | 🟢 · 20m |
| **A4** | **`QuaestorDesk` contract + tests + scripted demo** (§4) | **new** `contracts/src/QuaestorDesk.sol` (+ optional `src/libraries/HyperCore.sol`), `contracts/test/QuaestorDesk.t.sol` (unit + mocked precompiles + invariant), a scripted demo (anvil/mock) mirroring `scripts/x402-demo.ts` STEP 5 | `cd contracts && forge test` green incl. the new invariants; the scripted demo shows: place order ✓, over-notional ✗, equity-floor freeze ✗ | 🟡 · 150m |
| **A5** | **Positioning-led README + PITCH** | `README.md`, `PITCH.md` | README carries the tagline, the **3 guarantees**, the **positioning paragraph** (vs Cloaked Agent / Squads limits / SPL delegates / Altitude), the **per-chain showcase table**, the roadmap, the RPC Fast note | 🟢 · 45m |
| **A6** | **90s demo-script update** | `scripts/demo/run-demo.ts` (insert the attribution beat + renumber), `docs/demo-script.md` (voiceover rows for attribution + the HL trading-risk rejection) | demo runs end-to-end; shot-list keeps ~90s with **two** rejection punchlines (spend over-limit + trade over-risk) | 🟢 · 45m |
| **A7** | **Submissions** | Colosseum form, Superteam Earn (RPC Fast), University, Dapping | all four submitted (see §6); Superteam **by Oct 13 06:59 UTC** | 🟢 · 45m |

### Tier B — go-live stretch (cut in order B5→B4→B3ft→B2→B1 if the day tightens)

| # | Task | Files | Acceptance | Risk · Est |
|---|---|---|---|---|
| **B1** | Deploy `Quaestor.sol` → **Base Sepolia** (84532) | `contracts/script/Deploy.s.sol` (USDC `0x036CbD…` or mock), `.env` EVM block | on BaseScan; `QUAESTOR_CHAIN=base` MCP does a gasless attributed spend. **Needs funds — Q4** | 🟡 · 40m |
| **B2** | Deploy `Quaestor.sol` → **Tempo** + native-memo attribution | `Deploy.s.sol`, `docs/evm.md` | live; a spend records attribution in Tempo's **native memo**. **Needs chain params — Q2** | 🟡 · 40–60m |
| **B3** | **HyperEVM** deploy (big-block) + live fork test | **new** `contracts/script/DeployDesk.s.sol`; `forge test --fork-url $HYPEREVM_RPC` | deployed; fork test passes; a real `placeOrder` emits the CoreWriter action. **Needs RPC+funds+big-block — Q3,Q4** | 🟡 · 90m |
| **B4** | MCP `QUAESTOR_CHAIN=hyperliquid` **desk backend** | `config.ts` (extend `ChainKind`), **new** `deskOps.ts`, `opsFactory.ts` branch | MCP drives `place_order` + a rejection; agent holds no gas (ERC-2771) | 🟡 · 60m |
| **B5** | Dashboard **chain-switch** (live trees) | `apps/dashboard/`: `@quaestor/evm-sdk` read client + chain selector + EVM tree reusing `BudgetNode` + minimal HL desk view | renders Solana + Base/Tempo/HL live trees | 🟡 · 120m |

> 🔴 **A2 risk note (required flag):** adding args to the Solana `spend` instruction changes its data layout → forces a devnet **redeploy + IDL regen + SDK rebuild + demo re-verify**. Do A2-Solana **early** in the day so there's slack to re-verify, and keep the **SPL Memo** fallback ready — it yields identical on-chain attribution (hash in a Memo ix, same tx) with *zero* program change if the redeploy fights back. The EVM contract change carries no such risk (Base/Tempo/HL deploy fresh today).

> **Demo-design notes.** (1) **Solana showcase** — the brief's Solana story is an *x402 research fleet* with per-chapter cost attribution, and x402 is **already shipped** (`packages/mcp-server/src/x402.ts`, `scripts/x402-demo.ts`). Reshape A6's Solana demo toward that narrative (agent pays x402 APIs → one overspends → rejected → branch frozen → reasons printed as "cost per chapter") instead of the generic pay flow — it matches the submission table and reuses shipped code. (2) **Hyperliquid** — lead the HL demo with the **rejection** (over-notional / equity-floor): it's synchronous and reverts on the EVM side. A *successful* fill is async + fire-and-forget on Core (not deterministically showable live) and deposit→order must span blocks. The enforceable, visible beat is the pre-trade block, not the fill.

---

## 2. Rename plan (budget → Mandate)

Inventory command (grep-based): `rg -ni "budget" programs/ packages/ apps/ docs/ README.md PITCH.md -g '!**/target/**' -g '!**/node_modules/**'`.

**Baked-in → stays internal `budget` (changing it changes on-chain addresses):** PDA seed `b"budget"` (`programs/quaestor/src/constants.rs:9`, `sdk/constants.ts:8`); IDL account name `budget` (`sdk/src/idl/*`, `program.account.budget`); Rust `Budget` struct / `BudgetStatus` / account fields / events. **SDK TS type/identifier names** (`BudgetData`,`BudgetTreeNode`,`findBudgetPda`, dashboard `BudgetNode`/`BudgetMeter`): code-level only — **leave as-is** (cheap-to-skip, not user-visible).

**Must become "Mandate" (user-/model-facing):**
- **MCP tool names** → `get_my_mandate`, `create_submandate` (register legacy names as hidden aliases → no breaking change to saved `.mcp.json` or demo wiring); backing `ChainOps` methods rename in lockstep (`chainOps.ts:54,56`).
- **MCP tool titles/descriptions/errors** (all 9 tools mention "budget"): `server.ts` L52-301; `errors.ts` L6-32,64,68; `evmOps.ts` L29-47.
- **Owner CLI** descriptions/flags/stdout (command *names* already clean): `cli.ts` L66,83,108,114,130,132,160,166,168,181,183.
- **Dashboard literals**: `page.tsx` L135,152,179,181,19,189; `layout.tsx` L26-27; `BudgetNode.tsx` L39 (fallback "budget"),62; `StatusBadge.tsx` labels.
- **SDK rendered output**: `renderBudgetTree` header `"BUDGET TREE"` + fallback `"budget"` (`format.ts:142,149`).
- **Prose**: `README.md`, `PITCH.md`, `docs/*`, `brand/README.md` vocabulary.

---

## 3. Policy schema v1 (JSON Schema)

One schema, both chains; `hyperliquid.*` is the extension. Decimal USDC. `null` = unlimited/never (mirrors the contracts' `Option`/`(bool hasX,…)` encoding — never a `0` sentinel).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "QuaestorMandatePolicy", "type": "object", "required": ["amount"],
  "properties": {
    "amount":        { "type": "number", "minimum": 0, "description": "allocated USDC" },
    "perTxLimit":    { "type": ["number","null"], "minimum": 0 },
    "period":        { "type": ["object","null"], "properties": {
                         "limit":   { "type": ["number","null"], "minimum": 0 },
                         "seconds": { "type": "integer", "minimum": 1, "description": "rolling window; snap-to-now reset" } } },
    "expiresAt":     { "type": ["integer","null"], "description": "unix seconds; null = never" },
    "allowlist":     { "type": "array", "items": {"type":"string"}, "maxItems": 8, "description": "[] = any recipient" },
    "canDelegate":   { "type": "boolean", "default": false },
    "maxChildDepth": { "type": "integer", "minimum": 0, "maximum": 4 },

    "rateLimit":     { "type": ["object","null"], "description": "Tier 1",
                         "properties": { "maxSpends": {"type":"integer","minimum":1}, "windowSeconds": {"type":"integer","minimum":1} } },
    "timeWindows":   { "type": ["array","null"], "description": "Tier 1",
                         "items": {"type":"object","properties":{"startHourUtc":{"type":"integer"},"endHourUtc":{"type":"integer"},"days":{"type":"array","items":{"type":"integer"}}}} },
    "escalation":    { "type": ["object","null"], "description": "Tier 1: over-threshold → approval",
                         "properties": { "threshold": {"type":"number","minimum":0}, "approver": {"type":"string"} } },
    "heartbeatTtl":  { "type": ["integer","null"], "minimum": 1, "description": "Tier 1 dead-man switch (seconds)" },

    "hyperliquid":   { "type": "object", "description": "QuaestorDesk trading extension",
                         "properties": {
                           "allowedAssets":       { "type": "array", "items": {"type":"integer"}, "maxItems": 8, "description": "HyperCore asset indices; [] = none" },
                           "maxNotionalPerOrder": { "type": ["number","null"], "minimum": 0 },
                           "maxNotionalPerDay":   { "type": ["number","null"], "minimum": 0, "description": "rolling 24h, snap-to-now" },
                           "equityFloor":         { "type": "number", "minimum": 0, "description": "drawdown stop; pre-trade equity must stay ≥ this" },
                           "allowedSides":        { "type": "array", "items": {"enum":["buy","sell"]} } } }
  }
}
```

**Monotone tightening per field** (child vs parent; parent-unlimited → any child ok; child-unlimited-under-finite-parent → REJECT):

| Field | Tighter means |
|---|---|
| `amount` | `child.allocated ≤ parent.available` |
| `perTxLimit` / `period.limit` | `_limitWithin`: `!parent.has→ok`; else `child.has && child ≤ parent` |
| `period.seconds` | child window `≤` parent window |
| `expiresAt` | `_expiryWithin`: `!parent.has→ok`; else `child.has && child ≤ parent` |
| `allowlist` | `child ⊆ parent` (parent `[]` → any subset) |
| `canDelegate` | `child ⇒ parent` |
| `maxChildDepth` | `child ≤ parent − 1` |
| `rateLimit` | `child.maxSpends/window ≤` parent rate |
| `escalation.threshold` | `child ≤ parent` |
| `hyperliquid.allowedAssets` | `child ⊆ parent` |
| `hyperliquid.maxNotionalPerOrder/Day` | `≤ parent` (null→any) |
| **`hyperliquid.equityFloor`** | **`child ≥ parent`** — the only inverted field: a *floor* tightens upward |

---

## 4. Hyperliquid milestone — `QuaestorDesk`

New files (flat Foundry layout): `contracts/src/QuaestorDesk.sol`, `contracts/test/QuaestorDesk.t.sol`, `contracts/script/DeployDesk.s.sol`. **Reuse from `Quaestor.sol`:** Option-typed limits (`:53-61`), snap-to-now rolling period (`:443-447`), `Status{Active,Frozen,Revoked}` + `setStatus`/`revoke`, allowlist→`allowedAssets` + `_inAllowlist` (`:216`), `ERC2771Context` constructor (`:122`), CEI + `SafeERC20`.

```solidity
contract QuaestorDesk is ERC2771Context {
  address constant CORE_WRITER = 0x3333333333333333333333333333333333333333;
  // read precompiles 0x0800+: account equity/margin, position per asset, mark px (exact addrs: Q3)
  enum Status { Active, Frozen, Revoked }
  struct DeskMandate {
    address principal; address agent; uint256 deposited;
    uint32[8] allowedAssets; uint8 allowedLen;
    bool hasMaxOrder; uint256 maxNotionalPerOrder;
    bool hasMaxDay;   uint256 maxNotionalPerDay; int64 dayStart; uint256 dayNotionalUsed;
    uint256 equityFloor; bool hasExpiry; int64 expiresAt; Status status; bool exists;
  }
  mapping(bytes32 => DeskMandate) private mandates;
  event MandateCreated(bytes32 indexed id, address principal, address agent);
  event Deposited(bytes32 indexed id, uint256 amount);
  event OrderPlaced(bytes32 indexed id, uint32 asset, bool isBuy, uint64 px, uint64 sz, uint256 notional, bytes32 taskId, bytes32 reasonHash);
  event OrderCancelled(bytes32 indexed id, uint32 asset, uint64 oidOrCloid);
  event StatusChanged(bytes32 indexed id, uint8 status);
  event Withdrawn(bytes32 indexed id, address to, uint256 amount);
  function createMandate(address agent, uint32[] calldata assets, bool hasMaxOrder,uint256 maxOrder, bool hasMaxDay,uint256 maxDay, uint256 equityFloor, bool hasExpiry,int64 expiresAt) external returns (bytes32 id);
  function deposit(bytes32 id, uint256 amount) external;                 // + USD-class transfer (action 7, toPerp=true) in a SEPARATE block
  function placeOrder(bytes32 id, uint32 asset, bool isBuy, uint64 px, uint64 sz, uint8 tif, uint64 cloid, bytes32 taskId, bytes32 reasonHash) external;
  function cancel(bytes32 id, uint32 asset, uint64 oidOrCloid) external;
  function setStatus(bytes32 id, bool freeze) external;                  // principal/owner
  function revoke(bytes32 id) external;                                  // principal/owner
  function withdraw(bytes32 id, address to, uint256 amount) external;    // principal only
}
```

`placeOrder` checks (all BEFORE the fire-and-forget CoreWriter call): `Active` → not expired → `_assetAllowed` → `notional=px*sz ≤ maxNotionalPerOrder` → snap-to-now day reset then `dayNotionalUsed+notional ≤ maxNotionalPerDay` → `_readEquity(agent) ≥ equityFloor` → encode **CoreWriter action 1** → `CORE_WRITER.sendRawAction` → account notional → emit `OrderPlaced`. **Conservative accounting:** count notional at placement (Core fills are async); reconcile via precompile reads. Actions are fire-and-forget (no revert on Core rejection) → **validate before, verify after**.

**Invariants (Foundry fuzz, mirror `Quaestor.t.sol` Handler `:394`; `bound()`+`try/catch`, `fail_on_revert=false`):** (1) limits never widened post-creation; (2) no order without a passing check; (3) post-freeze `placeOrder` reverts; (4) `dayNotionalUsed ≤ maxNotionalPerDay`; (5) accepted orders have pre-trade `equity ≥ equityFloor`; (6) `deposited == token.balanceOf(desk)` (modulo perp transfers).

**Test plan:** unit tests with CoreWriter mocked via `vm.etch(0x3333…, mock.code)` (assert the encoded action-1 bytes) and read precompiles via `vm.mockCall` returning equity/position; reverts for asset-not-allowed, per-order notional, per-day notional (+`vm.warp` reset), equity-floor breach, expiry, freeze; `cancel`. Invariant harness `hdl_deposit/hdl_placeOrder/hdl_cancel/hdl_freeze`. **Live fork test (Tier B3):** `forge test --fork-url $HYPEREVM_RPC` — real `sendRawAction` + real precompile read; assert EVM state + plausible read (not a guaranteed fill). **Deploy (B3):** enable big-block mode for the deployer (large-contract constraint), then `DeployDesk.s.sol`; confirm `evm_version=cancun` is accepted on HyperEVM or add a Desk profile (Q3).

---

## 5. Tier 1 milestones (document; build post-submission)

| Milestone | Depends on | One-line demo |
|---|---|---|
| Plain-language mandate (Claude API fills the §3 schema; schema is the contract) | greenfield — add `@anthropic-ai/sdk` + a Next route (none today) | "research agent, max $2, $0.50/tx, 1h" → read-back → confirm → on-chain |
| Escalation (on-chain approval; parent key / human via Blink+Telegram; EVM approver) | schema `escalation` | $3 over a $0.50 cap → escalation → human approves in Telegram → spend |
| Policy extensions (rolling caps, rate limits, time windows, expiry clawback) | contract fields | 6th spend in a minute is rate-limited |
| Dead-man switch (auto-pause without heartbeat) | schema `heartbeatTtl` + relayer cron | kill heartbeat → mandate auto-pauses |
| Short-lived session keys (relayer TTL + rotation) | keystore | 10-min key; expires; agent can't sign |
| Dashboard: cost-per-task tree · "Why?" panel · burn-rate forecast · CSV | A2 attribution | hover a node → reason + "exhausted in ~40 min" |
| x402 receipts (payment hash + response hash + task id) | x402 shipped (`mcp-server/src/x402.ts`) | paid API call → verifiable receipt |
| Reflect (idle vault in a yield-bearing dollar) | Reflect SDK | idle balance earns yield; a spend draws it down |
| Phantom Connect (email login / embedded wallet) | dashboard | email login → embedded wallet → funds a vault |
| Policy replay (simulate a policy vs history) | A2 attribution log | "what would a $0.25/tx cap have blocked?" → 4 rejected |
| Dry-run mode in MCP | ops layer | `pay --dry-run` → allow/deny + reason, no spend |

---

## 6. Submission checklist

- **README** (positioning-led, A5): tagline *"Give your agent a mandate, not a wallet"*; the **3 guarantees**; **positioning paragraph** (Cloaked Agent / Squads limits / SPL delegates cap *one* wallet; Quaestor delegates authority down a chain with monotone tightening, attribution, human escalation; Altitude is the humans' stablecoin account, Quaestor the agents' mandate layer on top); **per-chain showcase table** (Solana research fleet · Tempo payout tranches · Base identity-bound mandate · Hyperliquid trading desk); roadmap; RPC Fast note.
- **Demo script** (A6): keep ~90s; add the **attribution** beat (task_id + reason visible) and the **Hyperliquid** rejection (over-notional or equity-floor rejected pre-trade). Two rejection punchlines.
- **Colosseum form**: name; tagline; tracks (Solana, Tempo, Base, Hyperliquid, general, University); description; tech; links (repo, video, dashboard, Solana program + each live EVM contract if Tier B landed).
- **Superteam Earn — RPC Fast**: Solana RPC switched to RPC Fast + stated in the submission; **by Oct 13 06:59 UTC**.
- **University Prize**: flag eligibility (founder @tum-blockchain.com) + any required fields.
- **Dapping build-in-public post.**
- **Demo video (~90s)** — founder-recorded; depends on A6 + whichever features land; a required artifact gating A7. Record after Tier A is stable.
- **Business-model line** — judges score business model: one line in the README/submission on the wedge + monetization (the mandate/policy layer as SaaS + a take-rate on mandated agent spend, atop Altitude-style stablecoin accounts).

---

## 7. Open questions (cannot resolve from the repo)

1. **RPC Fast endpoint** — the exact Solana RPC Fast URL (+ API key?) for `config.ts`/dashboard and the Superteam submission.
2. **Tempo testnet** — chain id, RPC URL, USDC/stablecoin address (repo says "see Tempo docs"). Note: event-based attribution (the `Spent` fields) already works on Tempo via the same contract; a **native transfer memo** is an *additional* flourish that may not apply to contract-mediated ERC20 transfers — treat it as nice-to-have, not the mechanism.
3. **HyperEVM testnet** — exact read-precompile addresses (`0x0800+`) for equity/margin + position; USDC address; CoreWriter encodings (action 1 order, action 7 USD-class transfer, cancel); is `evm_version=cancun` accepted or must the Desk use an older profile? (Vendor `hyperevm-tools` or confirm from HL docs.)
4. **Deployer funding** — which keypair funds Base Sepolia / Tempo / HyperEVM; faucets; big-block enablement for the HyperEVM deployer.
5. **Dashboard scope (B5)** — "one dashboard aggregating all vaults": literally aggregate, or a **chain selector** rendering one tree at a time? (Recommend the selector; aggregation later.)
6. **A2-Solana** — ship attribution as a **program change** (product-correct, needs a devnet redeploy) or the **SPL Memo fallback** (zero redeploy)? Recommendation in §1: attempt the program change early; keep Memo ready.
7. **Attribution persistence** — confirm the lightweight **JSONL** relayer log satisfies "plaintext in relayer/indexer DB" for Tier 0 (a real indexer is Tier 1).

---

## Verification (how each change is proven end-to-end)

- **Solana**: `bash scripts/test.sh` (28 LiteSVM tests) → rebuild SDK → `bash scripts/demo.sh` on the **RPC Fast** endpoint → paste the printed project into the dashboard → confirm the tree renders and a spend shows its attribution (event or Memo) on the explorer + in `attribution.jsonl`.
- **EVM / HL**: `cd contracts && forge test` (existing 18 + new `QuaestorDesk` unit/invariant) → (Tier B3) `forge test --fork-url $HYPEREVM_RPC` → `scripts/demo-evm.ts` (anvil) → `scripts/x402-demo.sh`.
- **Deploys (Tier B)**: `forge script Deploy --broadcast` → Base Sepolia + Tempo; `DeployDesk` → HyperEVM (big-block); verify on each explorer; `QUAESTOR_CHAIN=base|tempo|hyperliquid` MCP drives a spend/order.
- **MCP**: `scripts/smoke-mcp-devnet.ts`; `get_my_mandate`/`create_submandate` **and** legacy aliases respond; `pay` with `task_id`+`reason` → attribution on the explorer; a `place_order` over the notional/equity-floor limit → rejected.
- **Dashboard (B5)**: chain selector renders Solana + Base/Tempo/HL live trees; the HL desk view shows the mandate + a rejected order; RPC Fast endpoint in use.
```
