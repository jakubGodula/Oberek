# Spike: @noble/post-quantum Falcon-512 ↔ solana-falcon512

Checks that Falcon-512 signatures made in JS with `@noble/post-quantum` (dashboard side) verify with
[`blueshift-gg/solana-falcon512`](https://github.com/blueshift-gg/solana-falcon512) (on-chain verifier).

## Run

From this directory.

### Local: host Rust, 200 random signatures

Needs Node ≥ 20.19 and Rust.

```sh
(cd js && npm install && npm run gen)                 # writes ../vectors.json: 1 keypair, 200 signed messages
(cd rust && cargo run --release -- ../vectors.json)
```

Expect `valid accepted: 200/200, tampered rejected: 200/200`.

### Local Solana VM (Mollusk)

Compiles upstream's verifier program to SBF with a noble public key baked in and runs its 3 Mollusk tests:
valid signature, tampered message, tampered signature. The script clones upstream at a pinned commit into
`upstream/` (gitignored) and writes noble fixtures into it. Runs in a local SVM, not on devnet.

```sh
./run-mollusk.sh              # needs Node ≥ 20.19, Rust, Agave CLI (cargo build-sbf) on PATH
./run-mollusk.sh --docker     # needs Node ≥ 20.19 and Docker; builds the toolchain image from Dockerfile.sbf
```

Use `--docker` when the prebuilt Agave CLI does not start (glibc < 2.34, e.g. Ubuntu 20.04). The first
`--docker` run builds the image (several minutes). Append `2>/dev/null` to hide cargo and Mollusk debug logs.

Expect `verify_fixed_message OK — compute units consumed: …` and `test result: ok. 3 passed`.

### Devnet (real on-chain)

Builds the same program with a fresh noble key, deploys it to devnet under a new program id, sends two
transactions from Node (`js/devnet-client.cjs`, `@solana/web3.js` 1.99): a message signed with noble at run time
(must succeed) and the same signature with a tampered message (must fail on-chain with `Custom: 3`). Then closes
the program to reclaim its rent.

```sh
./run-devnet.sh               # needs Node ≥ 20.19, Rust, Agave CLI on PATH
./run-devnet.sh --docker      # needs Node ≥ 20.19 and Docker
```

The payer keypair lives in `.devnet/payer.json` (gitignored) and is reused across runs. A run needs ≥ 1.5 SOL
on it (deploy peak ≈ 1.04 SOL, refunded); the script tries an airdrop, which the devnet faucet often
rate-limits. Then fund the printed payer address at https://faucet.solana.com and rerun.

Watch it on Solana Explorer: the script prints the payer's address page, which lists every transaction
(buffer writes, deploy, both verifies, close); reload to update. Each verify transaction's page shows the CU
used and, for the tampered one, `custom program error: 0x3` under "Program Instruction Logs".

Expect `PASS: valid accepted, tampered rejected on devnet`.

## Result (2026-10-08, noble 0.7.1, solana-falcon512 @ ed45663, Agave 4.3.0)

- Local: 200/200 valid accepted, 200/200 tampered rejected, via both `verify` (897 B wire pubkey) and
  `verify_with_prepared` (1024 B prepared pubkey, the form stored in a PDA).
- Local Solana VM (`--docker` only; native not tested): 3/3 passed. Valid verify cost ~167.5–167.8k CU with a
  compile-time prepared pubkey, under upstream's ~173–183k.
- Devnet (`--docker`): PASS in both runs. Tampered rejected with `Custom: 3`; each transaction 921 B (legacy format,
  under 1232 B); ~0.002 SOL per run. Valid verify CU varies with the signature nonce.
  - Run 1, script steps run by hand after fixing the deploy flags: valid 167,918 CU —
    [valid tx](https://explorer.solana.com/tx/5Rm64ewbuHD5dG79rzP4Y56jjhvmw2YrCv1XUnhYVMBmsGPyhfQnLHHu2CcRGrz3Bs1ButtDTnuYhxnyVi3hQpg2?cluster=devnet),
    [tampered tx](https://explorer.solana.com/tx/5nRGAK6y8CEXtQUiYhjtVrAeemLSC5zANBfybqUVnop6vYhfMWGS117D647PJiZNnQQkBk7muMqYUE6iYnsnGsSs?cluster=devnet).
  - Run 2, full `./run-devnet.sh --docker`: valid 177,630 CU —
    [valid tx](https://explorer.solana.com/tx/2zoywcQByTcuQQy2vseEo6krs7U5BhuifTec7hTaCMCg5Gzo6rFBksdaZZxq3HWfcZjeEGTfv6Cpm62fJt9VYZxv?cluster=devnet),
    [tampered tx](https://explorer.solana.com/tx/49h9RshQdJUypa9mksVhYntpJrkHneU1KBMBWDcNxBgFE5qiU2q4H72TtESLN9qFvitNnc7CS7ziEDkBPDN4fqY3?cluster=devnet).
  - All transactions of both runs (deploys, verifies, closes):
    [payer history](https://explorer.solana.com/address/ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq?cluster=devnet).

Caveats:

- Both libraries implement **Falcon Round 3**, not FN-DSA (FIPS 206). Noble expects FIPS 206 to be incompatible.
- The verifier accepts only 666 B signatures (header `0x39`, zero-padded). Use `falcon512padded` in JS.
  Plain `falcon512` gives 651–659 B and must be zero-padded to 666.
- The verifier has no domain separation (`SHAKE256(nonce ‖ msg)`). Prefix signed messages, e.g. `aegis:resume:v1`.
- `@noble/post-quantum` is self-audited only (at 0.6.1), not independently audited.
- Deploy with `--use-rpc` fails on the public devnet RPC (`Max retries exceeded`); the script uses the default
  validator path with a priority fee.

## Not covered

- Prepared pubkey read from a PDA at runtime (`Falcon512PreparedPubkey::try_from_slice`); the test bakes it in at compile time.
