# Shared setup for run-mollusk.sh and run-devnet.sh. Source it, then call parse_toolchain_mode "$@".

UPSTREAM_URL=https://github.com/blueshift-gg/solana-falcon512
UPSTREAM_REV=ed456633dc281e313d2d0c99557bfaadf544d093
DOCKER_IMAGE=falcon-sbf
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM_DIR="$SPIKE_DIR/upstream"
PROGRAM_DIR="$UPSTREAM_DIR/program"
PROGRAM_SO="$UPSTREAM_DIR/target/deploy/program.so"
FALCON_FIXTURES_DIR="$PROGRAM_DIR/tests/fixtures"
USE_DOCKER=0

parse_toolchain_mode() {
  if [ "${1:-}" = "--docker" ]; then
    USE_DOCKER=1
    docker build -q -t "$DOCKER_IMAGE" - < "$SPIKE_DIR/Dockerfile.sbf" > /dev/null
  fi
}

# Runs a command with the Agave toolchain: natively, or in Docker as the host user with the spike dir
# mounted at the same path, so paths and file ownership match either way. Call from inside $SPIKE_DIR.
toolchain() {
  if [ "$USE_DOCKER" = 1 ]; then
    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/root \
      -v "$SPIKE_DIR:$SPIKE_DIR" -w "$PWD" "$DOCKER_IMAGE" "$@"
  else
    "$@"
  fi
}

# Writes a fresh noble Falcon-512 keypair + signature into upstream's fixtures; the program bakes in falcon.pk.
prepare_upstream_with_noble_fixtures() {
  if [ ! -d "$UPSTREAM_DIR" ]; then
    git clone -q "$UPSTREAM_URL" "$UPSTREAM_DIR"
  fi
  git -C "$UPSTREAM_DIR" checkout -q "$UPSTREAM_REV"
  (cd "$SPIKE_DIR/js" && npm install --silent && node gen-sbf-fixtures.cjs "$FALCON_FIXTURES_DIR")
}
