#!/usr/bin/env bash
# Create a demo project + budget tree on the configured cluster, using the owner CLI.
# Requires: QUAESTOR_RPC_URL, QUAESTOR_KEYSTORE_PASSPHRASE (and a funded owner keypair).
set -euo pipefail
cd "${QUAESTOR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
: "${QUAESTOR_RPC_URL:?set QUAESTOR_RPC_URL}"
: "${QUAESTOR_KEYSTORE_PASSPHRASE:?set QUAESTOR_KEYSTORE_PASSPHRASE}"
export QUAESTOR_OWNER_KEYPAIR="${QUAESTOR_OWNER_KEYPAIR:-$HOME/.config/solana/id.json}"

CLI="node packages/mcp-server/dist/cli.js"
PID="${1:-1}"
S=$RANDOM
OWNER=$(solana address -k "$QUAESTOR_OWNER_KEYPAIR")

echo "== create test USDC mint =="
MINT=$($CLI create-mint | awk '/mint:/{print $2}')
echo "MINT=$MINT"
$CLI fund --mint "$MINT" --amount 100 >/dev/null
echo "funded owner with 100 test USDC"

echo "== create project + deposit =="
INIT=$($CLI init --mint "$MINT" --project-id "$PID" --relayer "$OWNER")
echo "$INIT"
PROJECT=$(echo "$INIT" | awk '/^project:/{print $2}')
ROOT=$(echo "$INIT" | awk '/root budget:/{print $3}')
$CLI deposit --project "$PROJECT" --amount 100 >/dev/null
echo "deposited 100 USDC"

echo "== orchestrator (60) =="
ORCH=$($CLI agent-create "demo-orch-$S" | awk '{print $NF}')
OB=$($CLI allocate --project "$PROJECT" --parent "$ROOT" --agent "$ORCH" --label orchestrator --amount 60 --can-delegate | awk '/child budget:/{print $3}')

echo "== research (20, 5/tx) & writer (10, 2/tx) under orchestrator =="
RES=$($CLI agent-create "demo-res-$S" | awk '{print $NF}')
$CLI allocate --project "$PROJECT" --parent "$OB" --agent "$RES" --label research --amount 20 --per-tx 5 >/dev/null
WRI=$($CLI agent-create "demo-wri-$S" | awk '{print $NF}')
$CLI allocate --project "$PROJECT" --parent "$OB" --agent "$WRI" --label writer --amount 10 --per-tx 2 >/dev/null

echo ""
echo "=================================================="
echo "DEMO PROJECT: $PROJECT"
echo "=================================================="
$CLI tree --project "$PROJECT"
