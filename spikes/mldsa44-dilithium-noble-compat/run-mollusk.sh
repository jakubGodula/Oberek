#!/usr/bin/env bash
# Builds upstream's ML-DSA-44 example program to SBF and runs a Mollusk test with a noble key and signature.
# Usage: ./run-mollusk.sh            # needs Agave CLI (cargo build-sbf) on PATH
#        ./run-mollusk.sh --docker   # needs Docker instead of Agave; for glibc < 2.34 hosts
set -euo pipefail
source "$(dirname "$0")/common.sh"

parse_toolchain_mode "$@"
prepare_upstream
(cd "$SPIKE_DIR/js" && node gen-sbf-fixtures.cjs "$TESTS_DIR/fixtures")
cp "$SPIKE_DIR/mollusk/noble.rs" "$TESTS_DIR/noble.rs"
build_example_program

cd "$UPSTREAM_DIR"
# Not `cargo test-sbf`: Agave 4.3.0 swallows its libtest output (pass/fail lines, CU printout).
toolchain cargo test -p solana-ml-dsa-example --test noble -- --nocapture
