#!/usr/bin/env bash
# Run the Quaestor live demo scenario. Requires QUAESTOR_RPC_URL (+ funded owner keypair).
set -euo pipefail
cd "${QUAESTOR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
: "${QUAESTOR_RPC_URL:?set QUAESTOR_RPC_URL}"
export QUAESTOR_OWNER_KEYPAIR="${QUAESTOR_OWNER_KEYPAIR:-$HOME/.config/solana/id.json}"
export NEXT_PUBLIC_CLUSTER="${NEXT_PUBLIC_CLUSTER:-devnet}"
pnpm --filter @quaestor/sdk build >/dev/null 2>&1
pnpm exec ts-node --transpile-only -P tsconfig.mcp.json scripts/demo/run-demo.ts
