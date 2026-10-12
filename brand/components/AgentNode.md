# AgentNode

AgentNode is one budget in the tree: depth numeral, agent name and address, status, limit and meter.

- Pass `name`, `depth` (1–4, rendered I–IV), `limit`, `spent`, `reserved`, and optionally `status`, `address` (already shortened, `7xKX…q9Fm`) and `selected`.
- The consumer lays nodes out as a tree: indent each level by `space-6` and join parent to child with 1px `line-strong` elbow connectors.
- A frozen node takes a frost border and tint; its whole subtree should render frozen too.
- Keep nodes at most 420px wide. Don't nest interactive controls inside other than a small Button row below the meter.
