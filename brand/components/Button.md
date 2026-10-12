# Button

Buttons trigger one action, labelled verb-first in sentence case: "Fund vault", "Delegate budget", "Freeze branch".

- `variant="primary"` (verdigris) at most once per view, for the action the view exists for.
- `variant="secondary"` is the default for everything else.
- `variant="danger"` (cinnabar outline) for freezing, revoking or closing. Confirm before an onchain freeze.
- `size="sm"` inside tables and agent nodes.
- The consumer provides the label as children and the `onClick`; all native button attributes pass through.
- Don't use icons alone without an `aria-label`; don't put two primaries side by side.
