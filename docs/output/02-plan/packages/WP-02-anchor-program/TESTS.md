# TESTS.md — WP-02 Anchor program

All LiteSVM cases live in `programs/aegis_registry/tests/aegis_registry.litesvm.test.ts`; run with `cd programs/aegis_registry && yarn test`.

| # | case | proves |
|---|------|--------|
| 1 | `register_agent` happy path | PDA created with owner = signer, `is_active = true`, `attestation_count = 0`, operators stored, bump stored; `AgentRegistered` event in logs |
| 2 | `register_agent` with `agent_id` of 33 bytes | fails with `AgentIdTooLong` |
| 3 | `register_agent` with 6 operators | fails with `TooManyOperators` |
| 4 | `register_agent` twice with the same `agent_id` | second call fails (account already initialised) |
| 5 | `commit_attestation` by owner | `AttestationAccount` created with the given hashes, `attestation_count == 1`, `AttestationCommitted` event |
| 6 | `commit_attestation` by an operator | fails (`has_one = owner` constraint) |
| 7 | `commit_attestation` with a reused `attestation_id` | fails (PDA already exists) |
| 8 | `set_agent_status(false)` by an operator | succeeds; `is_active == false`; `AgentStatusChanged { is_active: false, by: operator }` |
| 9 | `commit_attestation` while paused | fails with `AgentPaused` (AC-7) |
| 10 | `set_agent_status(true)` by an operator | fails with `Unauthorized`; by the owner succeeds (AC-7) |
| 11 | `set_agent_status` by a random keypair | fails with `Unauthorized` |
| 12 | `anchor test` (Surfpool or `--validator legacy`) with the same scenarios through the generated client | IDL and client agree with LiteSVM | `anchor test` |
| 13 | `scripts/smoke-devnet.ts` | register → commit → pause (operator) → commit fails → unpause (owner) on devnet; signatures printed | `yarn tsx scripts/smoke-devnet.ts` |
| 14 | `cargo clippy --all-targets -- -D warnings`, `cargo audit`, Docker build | security checklist Q-RUST-08 | the commands / CI `anchor.yml` |
