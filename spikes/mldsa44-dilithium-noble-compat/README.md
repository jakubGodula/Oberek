# Spike: @noble/post-quantum ML-DSA-44 ↔ solana-ml-dsa

Checks that ML-DSA-44 (FIPS 204) signatures made in JS with `@noble/post-quantum` verify with
[`blueshift-gg/solana-ml-dsa`](https://github.com/blueshift-gg/solana-ml-dsa) (on-chain verifier, same authors as
solana-falcon512), and what that costs in compute units (CU) and transaction bytes, locally and on devnet with V1
transactions sent from `@solana/kit`.

## Run

From this directory.

### Local: host Rust, 200 random signatures

Needs Node ≥ 20.19 and Rust ≥ 1.85.

```sh
(cd js && npm install && npm run gen)                 # writes ../vectors.json: 1 keypair, 200 signed messages
(cd rust && cargo run --release -- ../vectors.json)
```

Messages are 1–300 B; half are signed with a FIPS 204 context string, half without. Each signature is checked
with both the compact public key and the prepared key. Expect `200/200` on all four lines.

### Local Solana VM (Mollusk)

Clones upstream at a pinned commit into `upstream/` (gitignored), writes a fresh noble key and signature into
`upstream/program/tests/fixtures/`, copies `mollusk/noble.rs` next to upstream's tests, builds upstream's example
program for SBPF v3 and runs the test. The test registers the key (create a 20,552 B account and prepare the key in
it, one transaction), then verifies a valid signature, a tampered message and a tampered signature from that account.

```sh
./run-mollusk.sh              # needs Node ≥ 20.19, Rust, Agave CLI (cargo build-sbf) on PATH
./run-mollusk.sh --docker     # needs Node ≥ 20.19 and Docker; reuses ../falcon-noble-compat/Dockerfile.sbf
```

Append `2>/dev/null` to hide cargo output. Expect `verify valid: Ok(())`, both tampered cases
`Err(InstructionError(0, Custom(1)))` and `test result: ok. 1 passed`.

### Devnet

Deploys upstream's example program under a fresh program id, then `js/devnet-client.cjs` sends three V1
transactions with `@solana/kit`: register a fresh noble key, verify a valid signature, verify it over a tampered
message. The program is closed at the end to reclaim its rent.

```sh
./run-devnet.sh --docker      # same toolchain options as run-mollusk.sh
```

Uses the Falcon spike's devnet payer (`../falcon-noble-compat/.devnet/payer.json`), which needs ≥ 3.6 SOL: deploying
the 336 KB program locks ~3.4 SOL for a moment (buffer + program data). If the CLI airdrop is rate-limited, fund the
payer at https://faucet.solana.com. Expect `PASS`. A run costs ~0.108 SOL, almost all of it the 0.105 SOL rent of the
key account, which the example program cannot close.

## Result (2026-10-08, noble 0.7.1, solana-ml-dsa @ e61fac4, Agave 4.3.0)

- Local: 200/200 valid accepted, and 200/200 rejected for each of tampered message, tampered signature and wrong
  context. Compact and prepared keys gave the same decision on every vector.
- Local Solana VM (`--docker` only; native not tested), 5 runs with fresh keys:

| Step | CU (of 1,400,000) | V1 transaction |
|---|---:|---:|
| Register: create key account + prepare key (once per key) | 1,086,597–1,086,742 | 1,686 B |
| Verify with the prepared key (32 B message) | 259,308–260,075 | 2,672 B |
| Tampered message / signature → `Custom(1)` | ~259.3–260.1k | 2,672 B |

- Devnet (`--docker`), 1 run: PASS, all three transactions returned by `getTransaction` as `version: 1`. CU match
  Mollusk; each transaction is 4 B larger (loaded accounts data size field) and verify 13 B more (45 B message).
  - Register: 1,086,743 CU, 1,690 B —
    [tx](https://explorer.solana.com/tx/4zQF6FpumhkwSXEgQT2w2aMPTcce7WtuN5NKpqnCVT1W74JZgD7JaQpx2LwZ7nq3gU7g1nA1KKqLWGHVk8r5Ud3q?cluster=devnet).
  - Verify valid: 259,462 CU, 2,689 B —
    [tx](https://explorer.solana.com/tx/3S1dKKJgP9noA6qy27RxGTHPnM1Ct5QcQXwWZZ5bRLMy4Jh9KXcw17Wd9eK76J6t8U2tRLGvbmYkfAm9xxjjnVqJ?cluster=devnet).
  - Verify tampered message: `InstructionError(0, Custom(1))`, 259,471 CU, 2,689 B —
    [tx](https://explorer.solana.com/tx/Y1vGDMkRPjYw8pS5DSkzQWN3SbVrj6fvvr3UoQ6fxKfcgiWx5gjFL991N3FKqD6LHnPk5biyCtWcTof1LWRiHgi?cluster=devnet).
  - All transactions (deploy, register, verify, close):
    [payer history](https://explorer.solana.com/address/ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq?cluster=devnet).

For comparison, Falcon-512 verify costs ~168–178k CU in a 921 B legacy transaction (`../falcon-noble-compat`).

Caveats:

- Only ML-DSA-44 (NIST category 2). There is no ML-DSA-65 verifier for Solana programs; `fips204` and RustCrypto
  `ml-dsa` exceed the SBF 4 KiB stack frame (per [QShield's report](https://github.com/sol-9/QShield/blob/main/docs/MLDSA_SOLANA_FEASIBILITY.md)).
- Use upstream's SHAKE mode (`VerifyingKey<false>`, tags `0`/`1`). Its TurboSHAKE mode is cheaper but not FIPS 204 and
  not compatible with noble's `ml_dsa44`.
- Both transactions exceed the legacy 1,232 B limit, so they need V1 transactions (4,096 B), which
  `@solana/web3.js` 1.x cannot send and `@solana/kit` 8.4.0 can. Devnet has SIMD-0385 (Transaction V1) and SBPF v3
  active. Legacy would need the public key and the signature uploaded to a buffer account in several transactions.
- V1 has no compute budget defaults: an unset `computeUnitLimit` or `loadedAccountsDataSizeLimit` budgets zero.
  The first devnet attempt failed with `MaxLoadedAccountsDataSizeExceeded` and was still charged the fee. Set both on
  every V1 transaction; loaded data includes the 336 KB program data and the 20.5 KB key account. The Mollusk test
  compiles the V1 message only to measure its size, so it cannot catch this.
- `getTransaction` can return `null` for a few seconds after the send is confirmed; the client polls.
- Verification without a prepared key costs ~1.33M CU (upstream's figure), leaving almost nothing for program logic.
  Keep the prepared key in an account written by the program itself; never accept prepared bytes from the client.
- The key account (20,552 B) must be created by a top-level System Program instruction, as here: an account created
  through CPI can grow by at most 10 KiB per instruction.
- FIPS 204 has native domain separation (context string, ≤ 255 B), e.g. `aegis:resume:v1`. The upstream example
  program hardcodes `solana-ml-dsa`.
- Neither library is independently audited. solana-ml-dsa was published 2026-09-13 (5 commits).

## Not covered

- ML-DSA-65: no verifier exists; it would need a port of solana-ml-dsa.
- CU as a function of message length on-chain (Mollusk signs one 32 B message, devnet one 45 B message).
- Native toolchain (Agave CLI on the host); both runs used Docker.
