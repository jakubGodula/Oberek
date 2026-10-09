---
file: testing-q_and_a.md
area: testing
task: om-solana
round: 1
owner:
status: open
---
> Test strategy per layer. Empty answer = default accepted.

## Q-TEST-01 — Anchor program tests
- Why it matters: the program is deployed once to devnet and then many people depend on it; bugs there are expensive to roll out.
- Options: A) Anchor TypeScript tests on `solana-test-validator` (classic `anchor test`), plus one devnet smoke script. B) Rust-native fast tests (LiteSVM / Mollusk) + `anchor test`. C) Devnet only, manual.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B if the Rust owner already knows LiteSVM.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TEST-02 — Solana TS code: mocking strategy
- Why it matters: services that build transactions and read accounts must be unit-testable without a network.
- Options: A) Interface `SolanaRpcClient` in the core module; a fake in tests; one integration test per module against a local validator in CI (nightly or on demand). B) Hit devnet in tests (flaky). C) No tests for Solana code.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TEST-03 — Payment reconciliation tests
- Why it matters: double-credit, under-payment, wrong mint, wrong recipient and replay are the real bugs.
- Options: A) Table-driven unit tests over a fake transaction set covering: exact amount, under/over, wrong mint, wrong recipient, already-used reference, expired request, Token-2022 mint. B) Happy path only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; this is the package with dual review.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TEST-04 — Blink / Actions conformance
- Why it matters: dial.to and wallets reject non-conformant responses silently (CORS, headers, `actions.json`).
- Options: A) Automated: a Vitest/Jest suite that calls `GET actions.json`, `OPTIONS`, `GET` and `POST` with a fake account and checks headers and the response schema with the `@solana/actions` types; manual dial.to check in `MANUAL-TESTS.md`. B) Manual dial.to only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TEST-05 — Agent (LLM) tests
- Why it matters: LLM outputs are non-deterministic; the approval gate and spend limits are not.
- Options: A) Deterministic tests with a fake LLM provider: tool-call routing, approval required before any on-chain or paid action, spend limit enforced, audit log written. One recorded "golden" conversation for the demo. B) Live LLM in tests.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TEST-06 — E2E of the demo path
- Why it matters: the 5-minute storyline must be rehearsed by a script, not by hope.
- Options: A) One Playwright test for the dashboard path with a mocked wallet + a `scripts/demo-e2e.ts` that drives the on-chain parts (register, pay, approve) with test keypairs on devnet; run every evening of week 2. B) Manual rehearsal only.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
