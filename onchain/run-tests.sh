#!/usr/bin/env bash
# Builds onchain_agent_guard, copies its IDL to the TypeScript module, writes fresh noble fixtures and runs the
# Mollusk tests. Usage: onchain/run-tests.sh   (Docker on x86_64 + Bun; append 2>/dev/null to hide cargo logs)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/toolchain.sh"

FIXTURES_DIR="$ONCHAIN_DIR/programs/onchain_agent_guard/tests/fixtures"
IDL_COPY="$REPO_DIR/kit/src/onchain_agent_guard.idl.json"
PROGRAM_ID=$(sed -n 's/^onchain_agent_guard = "\(.*\)"$/\1/p' "$ONCHAIN_DIR/Anchor.toml" | head -1)

build_images
"$BUN" "$REPO_DIR/scripts/gen-guard-fixtures.ts" "$PROGRAM_ID" "$FIXTURES_DIR"
cd "$ONCHAIN_DIR"
# --ignore-keys: target/deploy holds a generated keypair; the real one is onchain/.devnet/program-keypair.json.
toolchain anchor build --ignore-keys
cp target/idl/onchain_agent_guard.json "$IDL_COPY"
toolchain cargo test -p onchain-agent-guard -- --nocapture --test-threads=1
