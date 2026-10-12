# Amount

Amount renders a money value in IBM Plex Mono with two decimals, tabular figures and a muted unit.

- Pass a number as `value`; formatting is done for you (`1,250.00 USDC`). Never pre-format strings.
- `size="lg"` for headline balances (vault total, branch limit); `md` elsewhere.
- `tone` colours the figure only when it carries a state: `reserved` (aurum), `rejected` (cinnabar), `active` (verdigris).
- `unit` defaults to `USDC`; pass `null` only inside tables whose header already names the unit.
