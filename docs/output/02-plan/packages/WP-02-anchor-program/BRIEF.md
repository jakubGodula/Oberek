# WP-02 — Anchor program `aegis_registry` + LiteSVM tests + devnet deploy + IDL

| field | value |
|---|---|
| Package id | WP-02 |
| Branch | `feature/om-solana-wp-02-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | strong |
| Placement | local (needs Rust toolchain, Docker and a funded devnet keypair) |
| Estimated tokens | 0.8 M |
| Estimated effort | 4 person-days (days 2–6) |
| Depends on | WP-01 (Anchor workspace scaffold at `programs/aegis_registry`, toolchain pins, CI job `anchor.yml`) |
| Dual review | yes |

## 1. Objective
Implement the on-chain registry: one `AgentAccount` PDA per agent with owner, operators and a PQC public-key hash;
`commit_attestation` that stores a content hash + PQC-signature hash in an `AttestationAccount` PDA and emits an event;
`set_agent_status` as the kill-switch with owner/operator semantics. Test every instruction and every constraint failure
with LiteSVM, deploy to devnet under the program id committed by WP-01, publish the IDL on-chain and copy it into the
app so WP-07 can build the TypeScript client.

## 2. Acceptance criteria covered
- AC-7: `register_agent` creates the PDA with constraints enforced (`agent_id` ≤ 32 bytes, ≤ 5 operators, owner = signer); `commit_attestation` fails with `AgentPaused` when `is_active == false`; `set_agent_status(false)` succeeds for an operator; `set_agent_status(true)` fails for an operator and succeeds for the owner.
- Enables AC-8 and AC-10 (WP-07 commits attestations against this program on devnet).

## 3. Read first
1. `programs/aegis_registry/Anchor.toml`, `Cargo.toml`, `programs/aegis_registry/src/lib.rs`, `package.json`, `Dockerfile.anchor` (all from WP-01).
2. `docs/CONTRACTS.md` section "Program instruction set" (Q-API-05) — frozen; do not change names, args or seeds.
3. `/Users/macbook/work/sandbox/solana-2026/output/01-intake/qa/rust-q_and_a.md` (defaults of Q-RUST-01…09).
4. `/Users/macbook/work/sandbox/solana-2026/output/research/02-solana-stack-2026.md` §4 (Anchor 1.2.1, `anchor test` defaults to Surfpool, `--validator legacy`, LiteSVM, IDL via Program Metadata Program).
5. Anchor 1.x docs: https://www.anchor-lang.com/docs (accounts, `InitSpace`, `#[max_len]`, events, errors, `anchor idl`), release notes for 1.0.0.
6. LiteSVM TypeScript README: https://github.com/LiteSVM/litesvm (npm `litesvm` 1.5.x).

## 4. Files owned
- `programs/aegis_registry/programs/aegis_registry/src/lib.rs`, `src/state.rs`, `src/errors.rs`, `src/events.rs`, `src/instructions/{mod.rs,register_agent.rs,commit_attestation.rs,set_agent_status.rs}`, `programs/aegis_registry/programs/aegis_registry/Cargo.toml` (features, `overflow-checks` in the workspace profile).
- `programs/aegis_registry/tests/aegis_registry.litesvm.test.ts`, `programs/aegis_registry/tests/helpers.ts`, `programs/aegis_registry/package.json` (test script), `programs/aegis_registry/tsconfig.json`.
- `programs/aegis_registry/SECURITY.md`, `programs/aegis_registry/README.md` (build, test, deploy, upgrade, program id, deployer key handling).
- `programs/aegis_registry/scripts/deploy-devnet.sh`, `programs/aegis_registry/scripts/smoke-devnet.ts` (register → commit → pause → expect failure → unpause).
- `apps/mercato/src/modules/solana_attestations/idl/aegis_registry.json` — **only this file** inside the app module (the generated IDL, copied verbatim from `target/idl/aegis_registry.json`).

## 5. Files NOT to touch
- Everything else under `apps/mercato/src/modules/*`, `packages/*`, `apps/mercato/src/modules.ts`, root and app `package.json`, `.github/workflows/*`, `apps/mercato/.env.example`, `docs/CONTRACTS.md`, `Anchor.toml` program id (set by WP-01; if `anchor keys sync` wants to change it, stop and report).
- Request shared-file changes in `REPORT.md` under "Shared-file changes requested": the final program id for `.env.example` (`AEGIS_PROGRAM_ID`), the `anchor.yml` `continue-on-error` removal, and any devnet address list for `docs/SETUP.md`.

## 6. Interfaces and contracts (provided)
```rust
// PDAs
AgentAccount        seeds = [b"agent", agent_id.as_bytes()]                    bump stored
AttestationAccount  seeds = [b"attestation", agent_account.key().as_ref(), &attestation_id]   bump stored

#[account] #[derive(InitSpace)]
pub struct AgentAccount {
    pub owner: Pubkey,
    #[max_len(32)] pub agent_id: String,
    #[max_len(5)]  pub operators: Vec<Pubkey>,
    pub pqc_pubkey_hash: [u8; 32],
    pub is_active: bool,
    pub attestation_count: u64,
    pub last_updated: i64,
    pub bump: u8,
}
#[account] #[derive(InitSpace)]
pub struct AttestationAccount {
    pub agent: Pubkey,
    pub attestation_id: [u8; 32],
    pub content_hash: [u8; 32],
    pub pqc_sig_hash: [u8; 32],
    pub committed_at: i64,
    pub bump: u8,
}

// Instructions (names and argument order are frozen in docs/CONTRACTS.md)
register_agent(agent_id: String, operators: Vec<Pubkey>, pqc_pubkey_hash: [u8; 32])
    accounts: agent_account (init, payer = owner, space = 8 + AgentAccount::INIT_SPACE), owner (Signer, mut), system_program
    require!(agent_id.len() <= 32, AgentIdTooLong); require!(operators.len() <= 5, TooManyOperators)
commit_attestation(attestation_id: [u8; 32], content_hash: [u8; 32], pqc_sig_hash: [u8; 32])
    accounts: agent_account (mut, has_one = owner), attestation_account (init, payer = owner, seeds as above), owner (Signer, mut), system_program
    require!(agent_account.is_active, AgentPaused); attestation_count += 1 (checked_add)
set_agent_status(is_active: bool)
    accounts: agent_account (mut), signer (Signer)
    rule: signer == owner → any value; signer ∈ operators → only `false`; else Unauthorized

// Events (emit!)
AgentRegistered { agent: Pubkey, agent_id: String, owner: Pubkey }
AttestationCommitted { agent: Pubkey, attestation: Pubkey, attestation_id: [u8;32], content_hash: [u8;32], committed_at: i64 }
AgentStatusChanged { agent: Pubkey, is_active: bool, by: Pubkey }

// Errors
AgentIdTooLong, TooManyOperators, AgentPaused, Unauthorized, Overflow
```
Consumed by WP-07 through the IDL file and `AEGIS_PROGRAM_ID`; WP-06 decodes the three events from logs with the same IDL.

## 7. Step-by-step implementation guide (one commit per step)
1. Toolchain check: `rustc --version` (1.89), `solana --version` (4.3.0), `anchor --version` (1.2.1). `anchor build` on the WP-01 scaffold must pass before any edit. If it does not, apply the stop condition for toolchain.
2. `state.rs`: both accounts with `InitSpace` and `max_len` exactly as §6. `errors.rs`: the five errors with `#[msg]` texts in English. `events.rs`: the three events. Commit `feat(program): state, errors, events`.
3. `instructions/register_agent.rs`: context + handler; store `bump = ctx.bumps.agent_account`, `last_updated = Clock::get()?.unix_timestamp`, `is_active = true`, `attestation_count = 0`; emit `AgentRegistered`. Commit.
4. `instructions/commit_attestation.rs`: context (`has_one = owner`, attestation PDA init with the agent key and `attestation_id` in seeds), handler with the `AgentPaused` check first, `checked_add` → `Overflow`, emit `AttestationCommitted`. Commit.
5. `instructions/set_agent_status.rs`: context without `has_one`; a helper `fn authorize(agent: &AgentAccount, signer: &Pubkey, target: bool) -> Result<()>` implementing the owner/operator rule; update `last_updated`; emit `AgentStatusChanged`. Commit.
6. `lib.rs`: `declare_id!` (unchanged), `#[program]` wiring the three handlers; `Cargo.toml`: `[profile.release] overflow-checks = true` in the workspace, no `init-if-needed` feature, `idl-build` feature as Anchor 1.x requires. `anchor build`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`. Commit.
7. LiteSVM tests (`tests/aegis_registry.litesvm.test.ts`, `litesvm` + `@anchor-lang/core@1.2.1` for instruction encoding from the IDL): cases listed in `TESTS.md` 1–11. `yarn test` inside `programs/aegis_registry`. Commit.
8. `anchor test` once (default Surfpool; if Surfpool is not installed use `anchor test --validator legacy`) to prove the IDL and the generated client agree with LiteSVM results. Record which validator ran. Commit any test harness fixes.
9. `SECURITY.md`: constraints applied, trust model (owner = tenant hot wallet, operators = linked admin wallets), known limits (no `close`, no operator update instruction in v1, pause is not time-locked), audit commands (`cargo audit`, `clippy`). Commit.
10. Deploy: `scripts/deploy-devnet.sh` runs `solana balance` (require ≥ 3 SOL; else print the fund instruction from `scripts/fund-wallet.ts`), `anchor build`, `anchor deploy --provider.cluster devnet`, then `anchor idl init --provider.cluster devnet --filepath target/idl/aegis_registry.json <PROGRAM_ID>` (or `anchor idl upgrade` on redeploys). Run it. Verify with `solana program show <PROGRAM_ID> --url devnet` and `anchor idl fetch <PROGRAM_ID> --provider.cluster devnet`. Commit the script; paste addresses (not keys) into README.
11. `scripts/smoke-devnet.ts`: register a throw-away agent, commit one attestation, pause from an operator keypair, assert the next commit fails, unpause from the owner; print all signatures. Run on devnet. Commit.
12. Copy `target/idl/aegis_registry.json` to `apps/mercato/src/modules/solana_attestations/idl/aegis_registry.json`. Commit `feat(program): publish IDL for the app`.
13. `REPORT.md` + `STATUS.md`; push; remove the worktree.

## 8. Exact commands
```bash
cd programs/aegis_registry
anchor keys sync                      # must be a no-op (id committed by WP-01)
anchor build
cargo clippy --all-targets -- -D warnings && cargo fmt --check && cargo audit
yarn install && yarn test             # LiteSVM suite (script: "test": "tsx --test tests/*.test.ts" or jest)
anchor test                           # Surfpool default; fallback: anchor test --validator legacy
solana config set --url https://api.devnet.solana.com && solana balance
./scripts/deploy-devnet.sh
anchor idl fetch $AEGIS_PROGRAM_ID --provider.cluster devnet
yarn tsx scripts/smoke-devnet.ts
docker build -f Dockerfile.anchor -t aegis-anchor . && docker run --rm -v "$PWD":/work -w /work aegis-anchor anchor build
```

## 9. Tests to add
See `TESTS.md` (11 LiteSVM cases, 1 `anchor test` run, 1 devnet smoke).

## 10. Definition of done
- [ ] `anchor build`, clippy `-D warnings`, `cargo fmt --check`, `cargo audit` clean; Docker build passes.
- [ ] LiteSVM suite green: all 11 cases in `TESTS.md`; `anchor test` run recorded.
- [ ] Program deployed on devnet under the committed id; IDL fetched from chain; `smoke-devnet.ts` output (signatures) in README.
- [ ] IDL copied to the app path; no other app file changed.
- [ ] `SECURITY.md` and README written; deployer keypair never committed (gitleaks clean).
- [ ] `REPORT.md` lists the program id for `.env.example` and the CI `continue-on-error` removal as shared-file requests.
- [ ] No AI mentions in commits, comments or docs.
- [ ] Worktree removed; branch pushed; STATUS.md = review.

## 11. Stop conditions
- Toolchain: if `anchor build` with 1.2.1 fails for reasons unrelated to the program for more than 2 hours, switch the same day to Anchor 0.32.x + `@coral-xyz/anchor@0.32.1` (update `Anchor.toml` `anchor_version`, `avm use 0.32.1`), record the switch in `REPORT.md` and `STATUS.md`, and continue; the TL updates the plan. Do not attempt 0.30.x.
- A frozen contract (names, args, seeds) cannot be implemented as written → stop and report; the TL edits `docs/CONTRACTS.md`.
- Tokens above 1.6 M or three failed gate runs → stop and report.
- Devnet deploy fails for lack of SOL after `fund-wallet.ts` → stop, ask the TL for a funded key via `STATUS.md` blockers.

## 12. Report
Program id, deployer address, upgrade-authority address, IDL hash, Anchor/Agave/Rust versions actually used, which validator `anchor test` used, LiteSVM case count, devnet smoke signatures, shared-file changes requested, deviations; ≤300 words.
