# Brand system in the app

How the Quaestor design system is wired into the codebase. The **source of truth** is
[`brand/`](../brand) — `brand/README.md` (voice, colour, type, layout, MCP surfaces),
`brand/tokens.json` → `brand/tokens.css` (design tokens), `brand/components/` (the reference
component bundle + per-component specs), and `brand/assets/` (logo marks). This document
describes the **implementation** of that system in three surfaces plus one shared formatter.

```
brand/ (design spec)  ──▶  packages/sdk/src/format.ts  ──┬──▶  apps/dashboard  (visual UI)
                            (one money + text formatter)  └──▶  packages/mcp-server  (MCP text + metadata)
```

The money string `1,250.00 USDC` and every tool-result line are produced by the **same** SDK
module, so the dashboard, the MCP server and logs print identical output.

---

## 1. Shared formatter — `packages/sdk/src/format.ts`

Pure TypeScript (no React), re-exported from the SDK barrel (`packages/sdk/src/index.ts`), so
both the Node MCP server and the browser dashboard import it.

| Export | Purpose |
|---|---|
| `formatUSDC(base, { unit? })` | Brand money from **base units** (6-dp USDC): two decimals, comma thousands. `formatUSDC(new BN(1_250_000000))` → `"1,250.00"`. BN/string based — no float precision loss. `fromBaseUnits` stays the lossless parse round-trip helper; this is for display. |
| `baseUnitsString(base)` | Integer base-units string for `structuredContent` `*_base_units` fields. |
| `depthNumeral(depth)` | Roman tree depth `I\|II\|III\|IV` (clamped 1–4). |
| `renderResult({ state, sentence, rows?, next? })` | One tool result as text: CAPS state word + sentence, then an aligned two-space key/value block, then an optional `Next:` line. |
| `renderRejection({ reason, requested?, available?, limit?, next })` | A refusal in the brand's exact shape: `REJECTED onchain. <reason>` + aligned `requested/available/limit` rows + `Next:`. |
| `renderBudgetTree(root)` | A full `BudgetTreeNode` tree as `├─ └─ │` text with `[II]` depth numerals. |
| `renderBudget(view)` | A single budget (`BudgetView`) as an aligned text block (allocated/spent/reserved/available + limits, depth numeral). |
| `renderBudgetList({ title, items })` | Direct subagents (`SubagentView[]`) as a titled list with tree connectors. |

`BudgetView` / `SubagentView` are chain-neutral shapes (decimal-USDC strings) returned by the
MCP backends. `ResultRow` / `BaseUnits` are the supporting types.

---

## 2. Dashboard — `apps/dashboard` (Next 15 App Router, no Tailwind)

Default theme is **Basalt** (dark); **Travertine** (light) tokens ship too. The rebrand adopted
the brand visuals in the existing components, keeping all data/action logic.

- **`app/layout.tsx`** — loads Instrument Serif / IBM Plex Sans / IBM Plex Mono via
  `next/font/google` as `--font-display/sans/mono`; sets `<html data-theme="basalt" class="…font vars…">`;
  brand metadata. **`app/icon.svg`** is the brand app icon (favicon).
- **`app/globals.css`** — the single stylesheet. Brand tokens for both themes
  (`:root,[data-theme="basalt"]` and `[data-theme="travertine"]`), the type scale, and the
  `q-*` component classes ported from `brand/components/bundle.css`. The app-shell classes
  (`.wrap/.header/.summary/.stat/.panel/.tree/.children/.feed/.toast/…`) were rebuilt on the
  tokens: **no radial-glow gradients**, small radii (`--radius-md/-sm`, nothing pill-shaped),
  borders over shadows, 2px `--focus-ring`. Colour semantics: spent/active → verdigris,
  reserved → hatched **aurum**, frozen → **frost**, rejected/revoked → **cinnabar**.
- **`components/brand/`** — small stateless primitives ported from the brand bundle:
  `Mark` (ring-and-fork logo), `StatusBadge` (adds a `revoked` variant), `Amount`,
  `BudgetMeter` (hatched aurum reserved; cinnabar when over), `Button`. All amounts go through
  the SDK `formatUSDC`.
- **`components/BudgetNode.tsx`** — refactored to the brand `AgentNode`: Roman-numeral depth,
  `StatusBadge`, `BudgetMeter`, mono `Amount`, brand-voice action labels (“Freeze branch” …).
  Recursion, owner actions, limits row and `onAction` wiring unchanged.
- **`app/page.tsx`** — Mark + Instrument Serif wordmark + tagline “Onchain budgets for AI
  agents.”, `.label` stat keys with `Amount size="lg"`, brand-voice empty/error/toast copy
  (no emoji). **`components/TxFeed.tsx`** restyled purely via the new CSS classes.

Live at **https://quaestor-dashboard.vercel.app** (Basalt theme).

---

## 3. MCP server — `packages/mcp-server/src/server.ts` (+ `chainOps.ts`, `solanaOps.ts`)

The server registers its tools against a chain-agnostic `ChainOps` (Solana + EVM backends), so
one edit in `server.ts` brands **both** chains.

- **Identity** — `new McpServer({ name:"quaestor", version, title:"Quaestor", icons:[…] })` with
  the app icon inlined as an SVG data URI.
- **Tool metadata** — brand titles (`Request spend`, `Delegate mandate`, `Freeze branch`,
  `List subagents`, …); `subagent` / `onchain` as one word in every title/description. The two
  formerly budget-named tools were renamed to `get_my_mandate` / `create_submandate` in the
  Mandate repositioning; the other seven tool names are unchanged.
- **Result text** — every result is a CAPS state word + sentence + aligned rows via
  `renderResult`: `APPROVED` / `DELEGATED` / `FROZEN` / `RELEASED` / `REVOKED`. Amounts are
  reformatted with `formatUSDC(toBaseUnits(decimal))` because the ops layer returns decimal
  strings. `get_my_mandate` → `renderBudget`; `list_subagents` → `renderBudgetList`.
- **Rejections** — a mandate-limit refusal renders `REJECTED onchain. <reason>` with aligned
  `requested / available / limit` rows and a `Next:` line. The numbers travel from the backend
  via a `BudgetRejection` error (`chainOps.ts`) that `solanaOps.pay` throws (it already computed
  them); EVM falls back to the plain `REJECTED` line. `isError: true` on every refusal.
- **`structuredContent`** — every result also returns snake_case structured data with
  `*_base_units` integers, so hosts/models get machine-readable values alongside the text.

MCP App **inline UI widgets** (the brand's third MCP surface) are intentionally not built — the
plain-text surface is primary and every host sees it. See “Not implemented” below.

---

## Design decisions & coordination

- **One money helper.** `formatUSDC` is the single source; `fromBaseUnits` remained the lossless
  parse helper. Display call sites switched to `formatUSDC`.
- **`structuredContent` over JSON-in-text.** The read tools return brand text in `content` and
  the raw object in `structuredContent`; the MCP tests read the structured data, not the prose.
- **Additive, non-breaking changes to shared code.** `BudgetRejection` is a new error class
  whose `.message` is unchanged, so existing callers and error-substring assertions still pass.
- **Built alongside a second agent on `main`.** Every commit staged explicit paths (never
  `git add -A`), `brand/` was left untracked (a prior decision by the other agent), and work was
  sequenced to avoid touching their in-flight files (the EVM program, `evm-sdk`, EVM dashboard,
  x402). Dashboard production deploys ran from a clean throwaway git worktree of the pushed
  commit, so no uncommitted WIP ever shipped.

## Verification

- `pnpm --filter @quaestor/sdk build`, `… @quaestor/dashboard build`, `… @quaestor/mcp-server build` all green.
- SDK formatters unit-checked against the templates in `brand/README.md` (rejection block,
  `├─└─│` tree, `renderBudget`/`renderBudgetList`, `formatUSDC` rounding/grouping).
- Dashboard verified in the built output (Basalt theme, `next/font` vars, both token sets,
  hatched meter, Mark/favicon) and live at 200.
- MCP metadata verified compiled into `dist` (server + tool titles, icon, `onchain` wording,
  zero stray `sub-agent`/`on-chain`).
- MCP tests (`tests/mcp.test.ts` litesvm, `scripts/smoke-mcp-devnet.ts` devnet) updated to read
  `structuredContent`; they require a validator/devnet to execute end-to-end.

## Commit map

| Scope | Commit |
|---|---|
| Shared SDK formatter | `b02befd` |
| Dashboard rebrand | `20ff079` |
| MCP brand voice + metadata | `990aee2` |
| Rich REJECTED rows (Solana) | `4499ac8` |
| Branded read-tool text + `structuredContent` | `b851b99` |

## Not implemented (future)

- **MCP App inline widgets** — the `ToolResult` UI resource (brand MCP surface #3): register a
  UI resource, bundle the component, declare font CSP. The plain-text result would still be
  returned alongside, per the brand.
- **Rich rejection numbers on EVM** — `evmOps.pay` would need to fetch the budget on revert to
  populate `BudgetRejection.details` (Solana already does).
- **Travertine theme toggle** — tokens ship; a UI switch is not wired.
- **Landing page / decks / social cards** — out of scope for the app.
