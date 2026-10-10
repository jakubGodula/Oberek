#!/usr/bin/env bash
# Builds onchain_agent_guard and deploys it to devnet at the address of onchain/.devnet/program-keypair.json. Running
# it again upgrades the program in place (upgrade authority: the payer). Usage: onchain/deploy-devnet.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/toolchain.sh"

PAYER="$REPO_DIR/spikes/falcon-noble-compat/.devnet/payer.json"
PROGRAM_KEYPAIR="$ONCHAIN_DIR/.devnet/program-keypair.json"
DEPLOY_PRIORITY_MICROLAMPORTS=10000
DEPLOY_MAX_SIGN_ATTEMPTS=100

solana_devnet() { toolchain solana --url devnet --keypair "$PAYER" "$@"; }

build_images
cd "$ONCHAIN_DIR"
toolchain anchor build --ignore-keys
echo "payer balance: $(solana_devnet balance)"
# Not --use-rpc: the public devnet RPC drops buffer writes ("Max retries exceeded"); the TPU path works.
solana_devnet program deploy target/deploy/onchain_agent_guard.so --program-id "$PROGRAM_KEYPAIR" \
  --with-compute-unit-price "$DEPLOY_PRIORITY_MICROLAMPORTS" --max-sign-attempts "$DEPLOY_MAX_SIGN_ATTEMPTS"
PROGRAM_ID=$(toolchain solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "GUARD_PROGRAM_ID=$PROGRAM_ID"
echo "https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
