#!/usr/bin/env bash
# Builds the Anchor program with `anchor build` and runs the Mollusk test with noble ML-DSA-44 and Falcon-512 keys.
# Usage: ./run-mollusk.sh            # needs Node ≥ 20.19, Anchor CLI 1.2.1 and Agave CLI 4.3.0 on PATH
#        ./run-mollusk.sh --docker   # needs Node ≥ 20.19 and Docker instead; x86_64 only (prebuilt Anchor binary)
set -euo pipefail

SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIKES_DIR="$(dirname "$SPIKE_DIR")"
FIXTURES_DIR="$SPIKE_DIR/programs/pq_verify/tests/fixtures"
AGAVE_DOCKERFILE="$SPIKES_DIR/falcon-noble-compat/Dockerfile.sbf"
AGAVE_IMAGE=falcon-sbf
ANCHOR_IMAGE=pq-verify-anchor
USE_DOCKER=0

if [ "${1:-}" = "--docker" ]; then
  USE_DOCKER=1
  docker build -q -t "$AGAVE_IMAGE" - < "$AGAVE_DOCKERFILE" > /dev/null
  docker build -q -t "$ANCHOR_IMAGE" - < "$SPIKE_DIR/Dockerfile.anchor" > /dev/null
fi

# Runs a command natively, or in Docker as the host user with the spikes dir mounted at the same path.
toolchain() {
  if [ "$USE_DOCKER" = 1 ]; then
    docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/root \
      -v "$SPIKES_DIR:$SPIKES_DIR" -w "$PWD" "$ANCHOR_IMAGE" "$@"
  else
    "$@"
  fi
}

(cd "$SPIKE_DIR/js" && npm install --silent && node gen-fixtures.cjs "$FIXTURES_DIR")
cd "$SPIKE_DIR"
# --ignore-keys: the spike is never deployed, so the generated program keypair need not match declare_id!.
toolchain anchor build --ignore-keys
toolchain cargo test -p pq-verify --test noble -- --nocapture --test-threads=1
