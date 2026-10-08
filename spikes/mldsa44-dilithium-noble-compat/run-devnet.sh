#!/usr/bin/env bash
# Deploys upstream's ML-DSA-44 example program to devnet, sends V1 transactions from @solana/kit (register a
# fresh noble key, verify a valid and a tampered signature), then closes the program to reclaim its SOL.
# Usage: ./run-devnet.sh [--docker]   # same toolchain options as run-mollusk.sh
set -euo pipefail
source "$(dirname "$0")/common.sh"

DEVNET_DIR="$SPIKE_DIR/.devnet"
# Devnet payer shared with the Falcon spike, so one wallet carries the faucet-limited devnet SOL.
PAYER="$SPIKES_DIR/falcon-noble-compat/.devnet/payer.json"
PROGRAM_KEYPAIR="$DEVNET_DIR/program-keypair.json"
# Deploy peak: buffer + program data rent ≈ 2 × 1.71 SOL for the 336 KB program, plus 0.105 SOL rent for the
# key account. The buffer is refunded after deploy, the program data on close; the key account rent is lost
# because the example program cannot close it.
MIN_BALANCE_SOL=3.6
AIRDROP_SOL=2
DEPLOY_PRIORITY_MICROLAMPORTS=10000
DEPLOY_MAX_SIGN_ATTEMPTS=100

explorer_account_url() { echo "https://explorer.solana.com/address/$1?cluster=devnet"; }

solana_devnet() { toolchain solana --url devnet --keypair "$PAYER" "$@"; }

# The program id is fresh each run because a closed program id cannot be reused.
create_keypairs() {
  mkdir -p "$DEVNET_DIR" "$(dirname "$PAYER")"
  [ -f "$PAYER" ] || toolchain solana-keygen new --no-bip39-passphrase --silent --outfile "$PAYER"
  rm -f "$PROGRAM_KEYPAIR"
  toolchain solana-keygen new --no-bip39-passphrase --silent --outfile "$PROGRAM_KEYPAIR"
}

payer_balance_below_minimum() {
  local balance
  balance=$(solana_devnet balance | awk '{print $1}')
  echo "payer balance: $balance SOL (need $MIN_BALANCE_SOL)"
  awk "BEGIN {exit !($balance < $MIN_BALANCE_SOL)}"
}

ensure_payer_balance() {
  payer_balance_below_minimum || return 0
  solana_devnet airdrop "$AIRDROP_SOL" || true
  if payer_balance_below_minimum; then
    echo "Not enough SOL (devnet faucet is rate-limited). Fund the payer at https://faucet.solana.com and rerun." >&2
    exit 1
  fi
}

close_program() { solana_devnet program close "$PROGRAM_ID" --bypass-warning; }

parse_toolchain_mode "$@"
prepare_upstream
build_example_program
cd "$SPIKE_DIR"
create_keypairs
PAYER_ADDRESS=$(toolchain solana-keygen pubkey "$PAYER")
PROGRAM_ID=$(toolchain solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "Watch live (payer history: deploy, register, verify txs, close): $(explorer_account_url "$PAYER_ADDRESS")"
echo "Program: $(explorer_account_url "$PROGRAM_ID")"
ensure_payer_balance
# Not --use-rpc: the public devnet RPC drops buffer writes ("Max retries exceeded"); validator TPU path works.
solana_devnet program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEYPAIR" \
  --with-compute-unit-price "$DEPLOY_PRIORITY_MICROLAMPORTS" --max-sign-attempts "$DEPLOY_MAX_SIGN_ATTEMPTS"
trap close_program EXIT
node js/devnet-client.cjs "$PAYER" "$PROGRAM_ID"
