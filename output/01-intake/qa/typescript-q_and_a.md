---
file: typescript-q_and_a.md
area: backend-typescript
task: om-solana
round: 1
owner:
status: open
---
> Backend TypeScript inside Open Mercato (Node 24, Next.js 16 route handlers, MikroORM 7, Awilix 13, Zod 4, Jest 30).
> The Anchor program is in `rust-q_and_a.md`. Empty answer = default accepted.

## Q-TS-01 — Solana client library
- Why it matters: `@solana/web3.js` 1.x is the legacy API most examples use; `@solana/kit` (the renamed v2) is the current direction; `@solana/actions`, `@solana/pay`, wallet adapter and the Anchor TS client each pull one or the other. Mixing both costs conversion glue.
- Options: A) `@solana/web3.js` 1.x everywhere (Anchor `@coral-xyz/anchor` client, `@solana/pay`, `@solana/actions` all expect it). B) `@solana/kit` for new code, web3.js 1.x only where a dependency forces it (behind an adapter in `solana_core`). C) Kit only (write Codama clients for the Anchor program).
- Default (used if unanswered): A
- AI recommendation: A, confidence high for a 2-week build, **pinned exactly to `1.99.x`**: web3.js v3 (Kit-based) becomes the npm `latest` tag on 2026-10-19, mid-hackathon. `@solana/pay@1.0.26` is Kit-based and must stay isolated inside `gateway-solana`. Details and the blocking decision: `solana-q_and_a.md` Q-SOL-02.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-02 — Where the hot-wallet keypair comes from
- Why it matters: `solana_core` must load a keypair at startup for fee-paying; per-tenant keys are Q-SEC-09.
- Options: A) `SOLANA_HOT_WALLET_SECRET` env var (base58 or JSON array), loaded once in `di.ts` as a singleton; address exposed read-only in Settings. B) Keypair file path env var. C) Key stored encrypted in the `integrations` credentials service per tenant.
- Default (used if unanswered): A
- AI recommendation: A, confidence high for the hackathon; C is the product path and the service exists (`integrationCredentialsService`).
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-03 — Transaction sending policy
- Why it matters: devnet is flaky; demos die on "blockhash expired".
- Options: A) `solana_core.sendAndConfirm()` wrapper: fresh blockhash, compute-budget + small priority fee, `simulateTransaction` first, retry on blockhash expiry up to 3×, `confirmed` commitment, structured log of signature + slot. B) Raw `sendRawTransaction` per call site.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-04 — Entities (first migration)
- Why it matters: migrations are generated per module (`yarn db:generate`) and conflicts between parallel packages are the main merge risk.
- Options: A) Each module owns its tables, prefixed by module name: `solana_wallet_links`, `solana_gate_rules`, `solana_gate_results`, `solana_observed_txs`, `solana_activity_entries`, `solana_attestations`, `solana_agent_registrations`, `solana_approval_requests`, `gateway_solana_payment_requests`; all with `tenant_id`, `organization_id`, soft delete. B) One shared `solana` schema owned by `solana_core`.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; package `WP-01` creates the empty module skeletons so later migrations do not collide.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-05 — Event names
- Why it matters: subscribers across modules rely on exact ids; Open Mercato uses `module.entity.action`.
- Options: A) `solana_core.wallet.linked`, `solana_events.tx.observed`, `solana_events.program_log.observed`, `solana_gates.result.changed`, `gateway_solana.payment.confirmed`, `gateway_solana.payment.failed`, `solana_attestations.attestation.committed`, `solana_attestations.approval.requested|approved|rejected|executed`, `solana_attestations.agent.paused` (all with `clientBroadcast: true` except `tx.observed`). B) Fewer, coarser events.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; fixed in `api-contract-q_and_a.md` once answered.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-06 — Background work
- Why it matters: polling fallback, gate refresh, approval execution and payment expiry need workers; Open Mercato has `workers/*.ts` with queues (Redis).
- Options: A) Three workers: `solana_events:poll` (every 10 s per watched address), `solana_gates:refresh` (every 10 min), `solana_attestations:execute-approved` (on event). Payment expiry handled in the gateway's `getStatus`. B) Cron-style scheduler module. C) No workers; everything request-driven.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-07 — Validation and error style
- Why it matters: consistency with Open Mercato (Zod 4 validators in `data/validators.ts`, OpenAPI docs mandatory per route).
- Options: A) Zod schemas per route; machine-readable error codes (`WALLET_NOT_LINKED`, `GATE_DENIED`, `PAYMENT_UNDERPAID`, `APPROVAL_REQUIRED`); every route exports `openApi`. B) Ad hoc.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-TS-08 — PQC library
- Why it matters: `@noble/post-quantum` provides ML-DSA-65 and ML-KEM-768 in pure JS; it is audited but slow for big inputs (we only sign 32-byte hashes).
- Options: A) `@noble/post-quantum` (pin exact version), keys stored like the hot wallet (env for hackathon). B) Node's built-in crypto if the installed Node 24 exposes ML-DSA/ML-KEM (check `crypto.getCiphers()`/`generateKeyPair('ml-dsa-65')` support at the pinned version). C) No PQC.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B is worth a 30-minute spike because a built-in beats a dependency in a security pitch.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
