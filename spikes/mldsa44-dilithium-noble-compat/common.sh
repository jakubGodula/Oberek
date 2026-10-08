# Shared setup for run-mollusk.sh and run-devnet.sh. Source it, then call parse_toolchain_mode "$@".

UPSTREAM_URL=https://github.com/blueshift-gg/solana-ml-dsa
UPSTREAM_REV=e61fac4920bd7ca21464ab4ed04afa2259227e0d
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIKES_DIR="$(dirname "$SPIKE_DIR")"
UPSTREAM_DIR="$SPIKE_DIR/upstream"
TESTS_DIR="$UPSTREAM_DIR/program/tests"
PROGRAM_SO="$UPSTREAM_DIR/target/deploy/solana_ml_dsa_example.so"
# Same Agave 4.3.0 toolchain image as the Falcon spike.
DOCKERFILE="$SPIKES_DIR/falcon-noble-compat/Dockerfile.sbf"
DOCKER_IMAGE=falcon-sbf
USE_DOCKER=0

parse_toolchain_mode() {
  if [ "${1:-}" = "--docker" ]; then
    USE_DOCKER=1
    docker build -q -t "$DOCKER_IMAGE" - < "$DOCKERFILE" > /dev/null
  fi
}

# Runs a command with the Agave toolchain: natively, or in Docker as the host user with the spikes dir
# mounted at the same path (it also holds the devnet payer shared with the Falcon spike), so paths and
# file ownership match either way. Host network: Docker's resolver once returned a devnet RPC node that
# refused connections while the host's resolved to a working one.
toolchain() {
  if [ "$USE_DOCKER" = 1 ]; then
    docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/root \
      -v "$SPIKES_DIR:$SPIKES_DIR" -w "$PWD" "$DOCKER_IMAGE" "$@"
  else
    "$@"
  fi
}

prepare_upstream() {
  if [ ! -d "$UPSTREAM_DIR" ]; then
    git clone -q "$UPSTREAM_URL" "$UPSTREAM_DIR"
  fi
  git -C "$UPSTREAM_DIR" checkout -q "$UPSTREAM_REV"
  (cd "$SPIKE_DIR/js" && npm install --silent)
}

build_example_program() {
  (cd "$UPSTREAM_DIR" && toolchain cargo build-sbf --arch v3 --manifest-path program/Cargo.toml)
}
