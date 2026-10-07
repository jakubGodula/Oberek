---
file: rust-q_and_a.md
area: backend-rust (Anchor program)
task: om-solana
round: 1
owner:            # the Rust owner
status: open
---
> Only relevant if `solana-q_and_a.md` Q-SOL-05 keeps the custom Anchor program (default). Facts from
> `research/02-solana-stack-2026.md` §4 and `research/03-source-docs-review.md` §3. Empty answer = default accepted.

## Q-RUST-01 — Toolchain
- Why it matters: Anchor moved to OtterSec stewardship; latest is **v1.2.1 (2026-10-06)** with `anchor test` defaulting to Surfpool, IDL published via the Program Metadata Program, TS client renamed to `@anchor-lang/core`. The TL's machine still has Anchor 0.30.1 / Solana CLI 1.18.22; `@coral-xyz/anchor` is frozen at 0.32.1. Mixing 0.30 and 1.x IDLs breaks the TS client.
- Options: A) **Anchor 1.2.1 + Agave 4.3 + Rust 1.89**, `@anchor-lang/core@1.2.1`, pinned in `rust-toolchain.toml`, `Anchor.toml`, README; Docker image for the build so all six machines match. B) Anchor 0.31.x / 0.32 legacy line with `@coral-xyz/anchor`. C) Stay on 0.30.1 because it is installed.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium (1.x is a month-old major; if `anchor build` fails on day 1 for toolchain reasons, fall back to B the same day and record it).
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-RUST-02 — Program scope (instructions, accounts, events)
- Why it matters: frozen for the TS client package (`api-contract-q_and_a.md` Q-API-05).
- Options: A)
  ```
  register_agent(agent_id: String /* max 32 */, operators: Vec<Pubkey> /* max 5 */, pqc_pubkey_hash: [u8;32])
    AgentAccount PDA ["agent", agent_id]: owner, agent_id, operators, pqc_pubkey_hash, is_active, attestation_count, last_updated, bump
  commit_attestation(attestation_id: [u8;32], content_hash: [u8;32], pqc_sig_hash: [u8;32])
    AttestationAccount PDA ["attestation", agent_pda, attestation_id]: agent, attestation_id, content_hash, pqc_sig_hash, committed_at, bump
    require!(agent.is_active)
  set_agent_status(is_active: bool)   // owner or operator may pause; only owner may re-activate
  events: AgentRegistered, AttestationCommitted, AgentStatusChanged
  ```
  B) Source-doc set (`commit_private_state(new_state_root, zk_proof)`), single state root overwritten each time, no attestation PDAs.
  C) A + `update_operators`.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; C if time allows (30 minutes).
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Use `#[derive(InitSpace)]` + `#[max_len(32)]` / `#[max_len(5)]`; no manual `space` arithmetic.

## Q-RUST-03 — Authorisation model
- Why it matters: see `security-q_and_a.md` Q-SEC-02.
- Options: A) `owner` (the tenant's hot wallet) may do everything; `operators` (linked wallets of tenant admins) may `set_agent_status(false)` (pause) only; `commit_attestation` is owner-only. B) Owner-only everything. C) Anyone may pause.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Implement as a custom constraint function, not `has_one`, since the signer may be in a `Vec`.

## Q-RUST-04 — Attestation storage: PDA per attestation vs events only
- Why it matters: a PDA costs rent (~0.0016 SOL for ~120 bytes) and is directly readable by anyone (`getAccountInfo`, explorer); events are free but need an indexer to prove history.
- Options: A) PDA per attestation **and** an event. B) Events only; `AgentAccount.last_root` updated. C) PDA only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; the verify API reads the PDA, the activity feed uses the event.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-RUST-05 — Event emission
- Why it matters: `emit!` writes to program logs (can be truncated under log limits; simple); `emit_cpi!` self-CPIs the event data (robust for indexers; extra accounts and the `event-cpi` feature).
- Options: A) `emit!` + PDA state as the source of truth (the webhook triggers a PDA re-read). B) `emit_cpi!`.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-RUST-06 — Tests
- Why it matters: `anchor test` on 1.x defaults to Surfpool; LiteSVM is the fast TypeScript-native path; `solana-bankrun` is deprecated.
- Options: A) LiteSVM TS tests for all instructions + constraint failures (fast, in CI on every PR) and one `anchor test` run (Surfpool or `--validator legacy`) before each devnet deploy. B) `anchor test` only. C) Rust unit tests with Mollusk.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-RUST-07 — Deploy, program id and upgrade authority
- Why it matters: everyone's `.env` carries `AEGIS_PROGRAM_ID`; re-deploying under a new id breaks all PDAs and seeds.
- Options: A) Generate the program keypair on day 1, `anchor keys sync`, commit the **public** id, keep the keypair with the Rust owner (not in git); upgrade authority = the Rust owner's devnet key; IDL uploaded on-chain so the TS client can fetch it; redeploys are upgrades, never new ids. B) Each developer deploys their own id to devnet. C) Deploy from CI with a shared key in secrets.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Devnet program deploys need ~2–3 SOL for the program account; fund the deployer first.

## Q-RUST-08 — Security constraints checklist
- Why it matters: this program will be read by security-minded judges.
- Options: A) Enforce: PDA seeds + bump stored, `max_len` on all variable fields, no `init_if_needed`, explicit `require!` with typed errors, `overflow-checks = true`, no `close` instructions in v1, `cargo clippy -D warnings`, `cargo audit` in CI, and a short `SECURITY.md` for the program. B) Default Anchor settings only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-RUST-09 — Pause semantics
- Why it matters: the kill-switch is the demo's "safety" moment.
- Options: A) When `is_active == false`: `commit_attestation` fails with `AgentPaused`; only the owner may set `true` again; the backend worker also stops executing approvals for that agent. B) Pause is informational only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
