#!/usr/bin/env bash
# Start a local validator with the Quaestor program preloaded, run the SDK TS
# integration tests against it, then stop the validator.
set -uo pipefail
cd "${QUAESTOR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"

PROGRAM_ID="FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP"
SO="target/deploy/quaestor.so"
LEDGER="${QUAESTOR_TEST_LEDGER:-$HOME/.quaestor-test-ledger}"
RPC="http://127.0.0.1:8899"

if [ ! -f "$SO" ]; then
  echo "missing $SO — run 'anchor build' first"
  exit 1
fi

pnpm --filter @quaestor/sdk build

echo "starting solana-test-validator..."
solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --bpf-program "$PROGRAM_ID" "$SO" &
VPID=$!
trap 'kill "$VPID" 2>/dev/null || true' EXIT

up=0
for _ in $(seq 1 60); do
  if solana cluster-version -u "$RPC" >/dev/null 2>&1; then up=1; break; fi
  sleep 1
done
if [ "$up" -ne 1 ]; then echo "validator did not start"; exit 1; fi
echo "validator up"

solana airdrop 100 -u "$RPC" >/dev/null 2>&1 || true

ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$HOME/.config/solana/id.json" \
  pnpm exec ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
