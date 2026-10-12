Quaestor is a hierarchical budget system for AI agents on Solana: a human funds a project vault in USDC, agents receive sub-budgets and delegate smaller ones to subagents, and an Anchor program enforces every limit onchain. The name is the Roman treasurer — the official who held the public purse and answered for every coin. The brand borrows that: an old, accountable office, applied to new machinery. It should feel like a ledger cut in stone, not like a crypto casino.

## Brand idea

- **Accountable, not flashy.** Precision and restraint signal that money is safe here. No glow, no gradients, no neon.
- **Roman, lightly.** One serif for headlines and Roman numerals for tree depth (I–IV). No columns, laurels, togas, SPQR or Latin taglines.
- **The tree is the hero.** Vault → agent → subagent → subagent. Max depth is four, so depth is always written `I`, `II`, `III`, `IV`.

## Voice and content

- Plain, exact, unhurried. Short declarative sentences. State what the program did, not how anyone should feel.
- Sentence case for headings and buttons ("Freeze branch", "Fund vault"). Uppercase only in the `label` style.
- Every amount carries its unit: `38.40 USDC`. Two decimals, comma thousands separator, set in `amount` / `amount-lg`; the unit in `ink-muted`.
- Vocabulary: **vault** (the root budget), **agent** and **subagent**, **budget** / **limit**, **reserve** / **reserved**, **spent**, **available**, **delegate**, **freeze** / **frozen**, **reject** / **rejected onchain**. Say "onchain" as one word.
- Address people as "you"; the product speaks as "Quaestor", never "we".
- No emoji, no exclamation marks, no hype words ("revolutionary", "seamless", "unleash").
- Real copy:
  - Rejection: "Rejected onchain. research-agent tried to spend 12.00 USDC; 4.60 USDC available."
  - Freeze: "Branch frozen. 3 agents paused, 41.20 USDC held."
  - Empty state: "No agents yet. Delegate a budget to start."
  - Tagline: "Onchain budgets for AI agents." Longer line: "Every agent answers to a budget."

## Colour

Two themes from one token set. **Basalt** (dark) is the default for the dashboard, demo video and slides; **Travertine** (light) is for docs, the README and print.

- Ground is `surface`; cards and nodes are `surface-raised` with a 1px `line` border. Wells and meter tracks are `surface-sunken`.
- Text is `ink`; secondary text and units are `ink-muted`.
- `verdigris` is the brand — the green of oxidised Roman bronze. Use it for the mark, the one primary action per view, active state and the spent segment of meters. Text on a verdigris fill is `on-verdigris`.
- `aurum` means money held: reserved amounts and the reserved meter segment. It is also `focus-ring`.
- Budget states each have a hue, a soft tint and a word. Always show the word (or the `StatusBadge`); never rely on colour alone:
  - Active → `verdigris` on `verdigris-soft`
  - Reserved → `aurum` on `aurum-soft`
  - Rejected → `cinnabar` on `cinnabar-soft`
  - Frozen → `frost` on `frost-soft`
- `cinnabar` is never decorative. If something is red, something was refused.
- Proportions on any screen: mostly `surface` + `ink`, small amounts of `verdigris`, state colours only where a state exists.

## Type

- `display` and `heading-1` in Instrument Serif — the inscription voice. Use at most one display line per view.
- Everything functional in IBM Plex Sans: `heading-2`, `body`, `small`, `label`.
- All numbers that are money, addresses or IDs in IBM Plex Mono: `amount-lg`, `amount`, `mono`. Tabular figures, so columns align.
- `numeral` (serif) renders depth: I, II, III, IV. Never write "Level 2" or "Depth 2".
- Fonts load from Google Fonts: Instrument Serif 400, IBM Plex Sans 400/500/600, IBM Plex Mono 400/500.

## Layout, shape and depth

- 8px grid via `space-*`. Card padding `space-4`, card gaps `space-6`, page margins `space-12`.
- Small radii: `radius-sm` for badges and meters, `radius-md` for buttons and cards, `radius-lg` only for modals. Nothing is pill-shaped.
- Borders, not shadows. `shadow-overlay` is only for modals and popovers.
- Tree connectors are 1px `line-strong` orthogonal lines (elbows, no curves), indented `space-6` per level.
- Motion is functional only: 120–200ms ease-out for state changes. A freeze may ripple down the subtree, parent first. No bouncing, no looping animation.
- Focus: 2px solid `focus-ring`, 2px offset, on every interactive element.

## Logo

The mark is a ring — the vault, or a coin — whose tail forks into two square nodes: one budget dividing into sub-budgets. It doubles as a Q.

- `quaestor-app-icon.svg` for app icons, favicons and MCP server/tool icons.
- `quaestor-mark.svg` (verdigris) on Travertine; `quaestor-mark-on-dark.svg` on Basalt; `quaestor-mark-ink.svg` and `quaestor-mark-reversed.svg` for one-colour use.
- The wordmark is typeset, not drawn: "Quaestor" in Instrument Serif, sentence case, `ink`, cap height roughly equal to the mark's ring. Place the mark left of the word with a gap of half the mark's width.
- Clear space: half the mark's width on all sides. Minimum size 16px (favicon).
- Don't recolour outside the four provided inks, rotate, outline, add effects, or put the mark on `verdigris`.

## Iconography

- Use Lucide icons (line, 1.5px stroke, 16px or 20px), coloured `ink-muted` by default and the state colour when they mark a state. Core set: `wallet` (vault), `bot` (agent), `git-fork` (delegate), `snowflake` (freeze), `ban` (rejected), `lock` (reserved).
- No emoji, no 3D or illustrated icons, no Solana-gradient glyphs.

## Components

`window.Quaestor` exposes `Button`, `StatusBadge`, `Amount`, `BudgetMeter`, `AgentNode` and `ToolResult` (React 18, styles in `components/bundle.css`, classes prefixed `q-`). Each component's guidelines sit beside its preview.

## MCP surfaces

Quaestor lives inside MCP clients as much as in its own dashboard. The brand has to survive three surfaces, from least to most visual:

### 1. Plain-text tool results (every client, and the model itself)

Most hosts show tool output as raw text, and the agent reads every word. This is the primary MCP surface: design it as text, not as decoration.

- Line 1 is a state word in capitals, then one sentence: `APPROVED`, `RESERVED`, `REJECTED`, `FROZEN`, `RELEASED`. These are the same states as `StatusBadge`.
- Then an aligned key/value block, two-space indent, keys lowercase, amounts right-aligned with two decimals and `USDC`.
- Trees use `├─`, `└─` and `│` with the depth numeral in brackets, so they read in any monospace terminal.
- No ANSI colour, no emoji, no Markdown tables (many clients don't render them), no box-drawing frames.
- On rejection, set `isError: true`, state requested, available and limit, and end with one next step the agent can act on.
- Write for an agent reader: exact numbers, the reason, the next action. No pleasantries.

```text
REJECTED onchain. Spend exceeds this agent's available budget.
  agent       research-agent [II]
  requested    12.00 USDC
  available     4.60 USDC
  limit        60.00 USDC
Next: request a larger budget from your parent agent, or spend at most 4.60 USDC.
```

```text
BUDGET TREE  vault 1,250.00 USDC
├─ [II]  research-agent    60.00 USDC   active
│  └─ [III] scraper-sub    15.00 USDC   frozen
└─ [II]  writer-agent      40.00 USDC   active
```

- Return the same data as `structuredContent` with snake_case keys matching the text (`requested`, `available`, `limit`, `status`, `depth`). Amounts as decimal strings (`"12.00"`) plus `_base_units` integers (6 decimals for USDC), so neither model nor code has to reformat.

### 2. Host UI metadata (server list, tool approvals, tool-call chips)

- Server `name` is `quaestor`, display `title` is `Quaestor`.
- Server and tool icon: `quaestor-app-icon.svg` (Basalt tile, verdigris mark). It is legible from 16px up on light and dark host chrome.
- Tool names are `verb_noun` in snake_case; tool `title`s are sentence case and use the brand vocabulary ("Request spend", "Delegate budget", "Freeze branch").
- Tool descriptions are one or two plain sentences that state the limit behaviour ("Fails onchain if the amount exceeds the available budget."). No marketing.

### 3. MCP App widgets (inline UI in hosts that support it)

Use `ToolResult` (or a composition of `AgentNode` / `BudgetMeter`) as the widget. Inside someone else's chat, the brand gives way to the host:

- Follow the host theme: Travertine in a light host, Basalt in a dark one. Widget background is `surface-embed` (transparent); only the inner card uses `surface-raised` with a `line` border.
- Brand comes through verdigris, the mark at 16px, mono amounts and depth numerals, not through large dark panels.
- Fluid width from 320px to 640px, initial height at most 360px; no fixed widths.
- Self-contained: inline the mark as SVG, bundle all scripts. Declare `fonts.googleapis.com` and `fonts.gstatic.com` in the resource's CSP metadata if the host allows it; otherwise the system fallbacks in every family stack take over, and the widget must look correct that way.
- One widget per tool result. A destructive action in a widget (Freeze branch) asks the human to confirm; the widget never spends.
- Every widget still returns the plain-text result above, for hosts and models that can't see UI.

## Using this system in code (Claude Code)

- Read this README first, then `tokens.json`. Every token becomes a CSS custom property with the same name: `var(--surface)`, `var(--verdigris)`, `var(--space-4)`, `var(--radius-md)`, `var(--font-mono)`.
- In the Next.js dashboard, declare the Basalt values on `:root, [data-theme="basalt"]` and the Travertine values on `[data-theme="travertine"]` in `globals.css`; default `<html data-theme="basalt">`.
- If Tailwind is used, map theme colours to the variables (`colors: { surface: 'var(--surface)', verdigris: 'var(--verdigris)', … }`) rather than copying hex values.
- Load fonts with `next/font/google` (`Instrument_Serif`, `IBM_Plex_Sans`, `IBM_Plex_Mono`) and expose them as `--font-display`, `--font-sans`, `--font-mono`.
- For the MCP server, follow "MCP surfaces" above: shared text formatters for tool results live next to the SDK so the dashboard, MCP server and logs print identical lines.
- Port components from `components/bundle.js` and `components/bundle.css` as real TSX components with the same names and props (`components/index.d.ts`).
- Format money with one helper: `n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` plus a muted `USDC` suffix.

## Using this system in design (Claude Design)

- Pick this system as the design system for decks, the landing page, social posts and the demo title cards.
- Slides and video: Basalt ground, one `display` line, the tree or a single `AgentNode` as the image. Amounts always in mono with unit.
- Social cards (1200×630): mark top-left, one `display` line, tagline in `ink-muted`, a strip of the budget tree in `verdigris`, `aurum` and `ink` along one edge.
