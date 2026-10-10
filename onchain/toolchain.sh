# Docker toolchain for the onchain/ scripts: Agave 4.3.0 (spikes/falcon-noble-compat/Dockerfile.sbf) plus the Anchor
# CLI 1.2.1 (spikes/pq-verify-anchor/Dockerfile.anchor). The host's glibc 2.31 is too old for the native CLIs.
# Source it; it sets ONCHAIN_DIR, REPO_DIR and BUN.
ONCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$ONCHAIN_DIR")"
AGAVE_IMAGE=falcon-sbf
ANCHOR_IMAGE=pq-verify-anchor
BUN="${BUN:-$HOME/.bun/bin/bun}"

build_images() {
  docker build -q -t "$AGAVE_IMAGE" - < "$REPO_DIR/spikes/falcon-noble-compat/Dockerfile.sbf" > /dev/null
  docker build -q -t "$ANCHOR_IMAGE" - < "$REPO_DIR/spikes/pq-verify-anchor/Dockerfile.anchor" > /dev/null
}

# Runs a command in the toolchain image as the host user, with the repo mounted at the same path. Host network:
# Docker's resolver once returned a devnet RPC node that refused connections while the host's worked.
toolchain() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/root \
    -v "$REPO_DIR:$REPO_DIR" -w "$PWD" "$ANCHOR_IMAGE" "$@"
}
