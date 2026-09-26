#!/usr/bin/env bash
# Build the program for SBPF v2 (litesvm 0.10 rejects anchor's default v3) and run the LiteSVM tests.
set -euo pipefail
cd "$(dirname "$0")/.."
( cd programs/quaestor && cargo build-sbf --arch v2 )
cargo test -p quaestor "$@"
