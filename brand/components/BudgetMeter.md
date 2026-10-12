# BudgetMeter

BudgetMeter shows how a budget's limit splits into spent, reserved and available.

- Pass `limit`, `spent` and `reserved` in USDC. Available is derived.
- Spent is solid verdigris, reserved is hatched aurum, available is the empty track. When spent plus reserved exceeds the limit, the spent segment turns cinnabar.
- The legend repeats every number in text; hide it with `legend={false}` only where the numbers are shown next to the meter.
- Give it the width of its container; it has no fixed width.
