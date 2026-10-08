#!/usr/bin/env bash
# Deploys upstream's verifier program (fresh noble Falcon-512 pubkey baked in) to devnet, sends one valid and
# one tampered transaction, then closes the program to reclaim its SOL.
# Usage: ./run-devnet.sh [--docker]   # same toolchain options as run-mollusk.sh
set -euo pipefail
source "$(dirname "$0")/common.sh"

DEVNET_DIR="$SPIKE_DIR/.devnet"
PAYER="$DEVNET_DIR/payer.json"
PROGRAM_KEYPAIR="$DEVNET_DIR/program-keypair.json"
# Deploy peak: buffer + program data rent ≈ 2 × 0.52 SOL (measured). The buffer is refunded after deploy,
# the program data on close; a full run costs ~0.002 SOL in fees.
MIN_BALANCE_SOL=1.5
AIRDROP_SOL=2
DEPLOY_PRIORITY_MICROLAMPORTS=10000
DEPLOY_MAX_SIGN_ATTEMPTS=100

explorer_account_url() { echo "https://explorer.solana.com/address/$1?cluster=devnet"; }

solana_devnet() { toolchain solana --url devnet --keypair "$PAYER" "$@"; }

# Payer persists across runs; the program id is fresh each run because a closed program id cannot be reused.
create_keypairs() {
  mkdir -p "$DEVNET_DIR"
  [ -f "$PAYER" ] || toolchain solana-keygen new --no-bip39-passphrase --silent --outfile "$PAYER"
  rm -f "$PROGRAM_KEYPAIR"
  toolchain solana-keygen new --no-bip39-passphrase --silent --outfile "$PROGRAM_KEYPAIR"
}

ensure_payer_balance() {
  local balance
  balance=$(solana_devnet balance | awk '{print $1}')
  echo "payer balance: $balance SOL"
  if awk "BEGIN {exit !($balance < $MIN_BALANCE_SOL)}"; then
    solana_devnet airdrop "$AIRDROP_SOL" || {
      echo "Airdrop failed (devnet faucet is rate-limited). Fund the payer at https://faucet.solana.com and rerun." >&2
      exit 1
    }
  fi
}

close_program() { solana_devnet program close "$PROGRAM_ID" --bypass-warning; }

parse_toolchain_mode "$@"
prepare_upstream_with_noble_fixtures
cd "$PROGRAM_DIR"
toolchain cargo build-sbf
cd "$SPIKE_DIR"
create_keypairs
PAYER_ADDRESS=$(toolchain solana-keygen pubkey "$PAYER")
PROGRAM_ID=$(toolchain solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Watch live (payer history: deploy, verify txs, close): $(explorer_account_url "$PAYER_ADDRESS")"
echo "Program: $(explorer_account_url "$PROGRAM_ID")"
ensure_payer_balance
# Not --use-rpc: the public devnet RPC drops buffer writes ("Max retries exceeded"); validator TPU path works.
solana_devnet program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEYPAIR" \
  --with-compute-unit-price "$DEPLOY_PRIORITY_MICROLAMPORTS" --max-sign-attempts "$DEPLOY_MAX_SIGN_ATTEMPTS"
trap close_program EXIT
node js/devnet-client.cjs "$PAYER" "$PROGRAM_ID" "$FALCON_FIXTURES_DIR/falcon.sk"
