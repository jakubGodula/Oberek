#!/usr/bin/env bash
# Runs upstream's Mollusk SBF tests with a noble-generated Falcon-512 key and signature.
# Usage: ./run-mollusk.sh            # needs Agave CLI (cargo build-sbf) on PATH
#        ./run-mollusk.sh --docker   # needs Docker instead of Agave; for glibc < 2.34 hosts
set -euo pipefail
source "$(dirname "$0")/common.sh"

parse_toolchain_mode "$@"
prepare_upstream_with_noble_fixtures
cd "$PROGRAM_DIR"
# Not `cargo test-sbf`: Agave 4.3.0 swallows its libtest output (pass/fail lines, CU printout).
toolchain sh -c "cargo build-sbf && cargo test -- --nocapture"
