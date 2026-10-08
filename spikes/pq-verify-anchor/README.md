# Spike: ML-DSA-44 and Falcon-512 verification in an Anchor program

Checks that the on-chain verifiers from `../mldsa44-dilithium-noble-compat` (solana-ml-dsa) and
`../falcon-noble-compat` (solana-falcon512) work inside an Anchor program built with the WP-02 toolchain
(Anchor 1.2.1, Agave 4.3.0), and what Anchor adds in compute units (CU) and transaction bytes.

One program, `programs/pq_verify`, has a register and a verify instruction per scheme. Register prepares the key
on-chain and stores the prepared form; verify reads it from that account.

| Instruction | Accounts | Data (Borsh, after Anchor's 8 B discriminator) |
|---|---|---|
| `register_mldsa_key` | key account (20,552 B), `#[account(zero)]` | public key (1,312 B) |
| `verify_mldsa` | key account, read-only | signature (2,420 B), message |
| `register_falcon_key` | authority (signer, payer), key PDA (1,032 B, `init`, seeds `falcon_key` + authority), System Program | public key (897 B) |
| `verify_falcon` | key PDA, read-only | signature (666 B), message |

ML-DSA verifies with the FIPS 204 context `aegis:resume:v1`. Falcon has no context; the signed message carries the
domain prefix.

## Run

From this directory. Needs Node ≥ 20.19.

```sh
./run-mollusk.sh --docker     # needs Docker; x86_64
./run-mollusk.sh              # needs Anchor CLI 1.2.1 and Agave CLI 4.3.0 on PATH (not tested)
```

Writes a fresh noble keypair and signature per scheme into `programs/pq_verify/tests/fixtures/` (gitignored), runs
`anchor build` (SBPF v3 is Anchor 1.2.1's default) and the Mollusk test `programs/pq_verify/tests/noble.rs`. The
test registers each key, then verifies a valid signature, the same signature over a tampered message and a tampered
signature. `--docker` builds `falcon-sbf` from `../falcon-noble-compat/Dockerfile.sbf` and on top of it
`pq-verify-anchor` from `Dockerfile.anchor` (Anchor CLI from crates.io, ~6 min the first time).

Append `2>/dev/null` to hide cargo and Mollusk logs. Expect `Ok(())` for valid, `Err(InstructionError(0,
Custom(6003)))` (`VerifyFailed`) for both tampered cases and `test result: ok. 2 passed`.

## Result (2026-10-08, Anchor 1.2.1, Agave 4.3.0, Mollusk 0.16.0, noble 0.7.1, verifiers at the same commits as the earlier spikes)

Works. `anchor build` builds the program and its IDL. In Mollusk both schemes accept the valid signature and reject
both tampered cases with `VerifyFailed`. Docker only; 3 runs with fresh keys, plus 4 earlier runs for verify:

| Step | CU (of 1,400,000) | Upstream, no Anchor | Legacy tx | V1 tx |
|---|---:|---:|---:|---:|
| ML-DSA-44 register: create account + prepare key | 1,086,015–1,086,113 | 1,086,597–1,086,742 | 1,732 B ✗ | 1,697 B |
| ML-DSA-44 verify (32 B message) | 260,085–260,397 | 259,308–260,075 | 2,723 B ✗ | 2,687 B |
| Falcon-512 register: `init` PDA + prepare key | 61,661 | — | 1,198 B | 1,162 B |
| Falcon-512 verify (32 B message) | 171,727–181,648 | ~167.5k–177.6k | 969 B | 933 B |
| Tampered message / signature → `Custom(6003)` | ML-DSA ~261.9–262.2k, Falcon ~173.1–183.5k | | | |

Limits: legacy 1,232 B, V1 4,096 B. Legacy sizes include Compute Budget instructions for the CU limit and price; V1
sets both in its config (on devnet V1 adds 4 B for the loaded accounts data size limit, per the ML-DSA spike).
Falcon verify CU is bimodal (~172k or ~181k) and depends on the signature nonce, as upstream.

Anchor itself costs little: none measurable on ML-DSA register, ~+0.5k CU on ML-DSA verify, ~+4k CU on Falcon
verify, which includes reading and validating the prepared key from the account (upstream bakes it in at compile
time). ML-DSA transactions are 11 B (register) and 15 B (verify) larger than upstream's: 8 B discriminator instead
of a 1 B tag, 4 B length per `Vec`.

Falcon fits legacy transactions, so `@solana/web3.js` 1.x can send it; register has only 34 B to spare, so one more
account would push it to V1. ML-DSA needs V1 (`@solana/kit`).

What a real Anchor program must do differently from the Anchor template:

1. **Turn overflow checks off for the verifier crates.** The template sets `overflow-checks = true` for the whole
   release profile. With it, solana-ml-dsa does not compile for SBPF v3 (`rustc-LLVM ERROR: Branch target out of insn
   range`), and Falcon verify costs ~283k CU instead of ~172k. Per-package overrides in `Cargo.toml` turn them off
   for the two verifier crates only; the program's own code keeps them.
2. **Create the ML-DSA key account in the client, initialize it with `#[account(zero)]`.** `init` creates the account
   through CPI, which cannot allocate more than 10 KiB (Anchor docs; not tested here), and the key account is 20,552 B.
   The client puts a System Program `create_account` before `register_mldsa_key` in the same transaction (see
   `tests/noble.rs`). The Falcon key account (1,032 B) fits `init` with a PDA.
3. **Watch the build output for stack frame errors.** Moving the 1 KiB Falcon prepared key out of its `Result` with
   `map_err(..)?` left four copies of it on the handler's stack: a 4,160 B frame over the 4 KiB SBF limit. `cargo
   build-sbf` prints `Error: Function ... overflows the maximum allowed frame space` but the build, and `anchor
   build`, still succeed. Borrowing the key (`.as_ref()`) fixed it.
4. **Use Mollusk 0.16 and commit `Cargo.lock`.** Mollusk 0.15.1 does not compile against `solana-program-runtime`
   4.3, which Cargo picks without a lockfile. `anchor build` compiles dev-dependencies to generate the IDL, so the
   whole build fails, not just the tests.
5. **Keep `[programs.localnet]` in `Anchor.toml`.** Without it the first `anchor build` rewrites `declare_id!` with a
   freshly generated keypair, even with `--ignore-keys`.

Caveats:

- The prebuilt Anchor 1.2.1 Linux binary needs glibc ≥ 2.39 (Ubuntu 24.04+). Debian bookworm (the toolchain image)
  and Ubuntu 20.04 are older, so `Dockerfile.anchor` builds the CLI from crates.io.
- The program is 498 KB with both verifiers (ML-DSA example alone 336 KB, Falcon program 102 KB). Estimate scaled
  from the ML-DSA spike's devnet deploy (~1.71 SOL rent per copy of 336 KB): ~2.5 SOL rent, ~5 SOL at the deploy
  peak (buffer + program data). A program with one scheme is smaller.
- The key accounts are not bound to an owner: `register_mldsa_key` accepts any empty key account owned by the
  program, and `verify_*` does not check who registered the key. A real program stores and checks an authority, and
  builds the signed message itself instead of taking it from the caller.

## Not covered

- Devnet (Mollusk only) and the native toolchain (`--docker` only).
- `init` of the 20,552 B ML-DSA account failing (taken from Anchor docs).
- CU as a function of message length.
- LiteSVM / TypeScript tests, which the WP-02 plan uses.
