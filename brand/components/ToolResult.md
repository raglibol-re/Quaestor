# ToolResult

ToolResult is the MCP App widget for one Quaestor tool call: mark, tool title, state, a one-line message, key amounts, an optional meter and the transaction signature.

- The consumer provides `title` (the tool's sentence-case title), `status`, `message` (the same sentence as line 1 of the plain-text result), `rows` (numbers render as `Amount`), optional `meter` (`BudgetMeter` props), `signature` (shortened) and `meta` (cluster, time).
- Render it on a `q-embed` (transparent `surface-embed`) root so the host chat shows through; set `data-theme` from the host's light/dark theme.
- Keep it to one card, at most five rows. Put full trees in the dashboard, not in the chat.
- Always return the plain-text result alongside it; the widget is an enhancement, never the only output.
