# StatusBadge

StatusBadge names the state of a budget, agent or transaction: Active, Reserved, Rejected or Frozen.

- Pass `status`; the label defaults to the state's name. Override children only to add a count ("Rejected · 3").
- Each state has its own colour, tint and marker shape (solid square, hollow square, diamond, pause bars), so it reads without colour.
- Use in agent nodes, transaction logs and table rows. Never use these colours for anything that is not a state.
