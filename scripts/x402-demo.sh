#!/usr/bin/env bash
# Self-contained Quaestor x402 demo on a local anvil node.
# Starts anvil, builds the SDK + MCP server, runs scripts/x402-demo.ts, then kills anvil.
#
# WSL: source the toolchain env + Foundry first, e.g.
#   . "$HOME/.quaestor_env.sh"; export PATH="$HOME/.foundry/bin:$PATH"
#   bash scripts/x402-demo.sh
set -euo pipefail
cd "${QUAESTOR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"

RPC_PORT="${ANVIL_PORT:-8545}"
export QUAESTOR_EVM_RPC_URL="http://127.0.0.1:${RPC_PORT}"

command -v anvil >/dev/null 2>&1 || { echo "anvil not found on PATH (add ~/.foundry/bin)"; exit 1; }

echo "== build @quaestor/evm-sdk + @quaestor/mcp-server =="
pnpm --filter @quaestor/evm-sdk build >/dev/null
pnpm --filter @quaestor/mcp-server build >/dev/null

echo "== start anvil on ${RPC_PORT} =="
anvil --port "${RPC_PORT}" --silent &
ANVIL_PID=$!
cleanup() { kill "${ANVIL_PID}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Wait for the RPC to answer.
for i in $(seq 1 50); do
  if curl -s -o /dev/null "${QUAESTOR_EVM_RPC_URL}" \
      -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; then
    break
  fi
  sleep 0.2
done

echo "== run x402 demo =="
pnpm exec ts-node --transpile-only scripts/x402-demo.ts
