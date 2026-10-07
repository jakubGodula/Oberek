# TEST-PLAN.md — acceptance criterion → automated test → command

Levels: unit (Jest 30, fakes), program (LiteSVM TS), integration (Jest + Postgres service, module-local), conformance
(HTTP against a running dev server), e2e (script on devnet). Package test lists live in `packages/WP-nn/TESTS.md`.

| AC | test(s) | level | package | command |
|----|---------|-------|---------|---------|
| AC-1 SIWS link | `solana_core/__tests__/wallet-link.test.ts`: valid signIn → linked; replayed nonce → 409; wrong domain → 400; expired → 410 | unit | WP-03 | `yarn test --filter solana_core` (or `yarn jest apps/mercato/src/modules/solana_core`) |
| AC-2 gates | `solana_gates/__tests__/gates.service.test.ts`: `core_collection` granted/denied with `FakeSolanaCoreService`; `token_balance` ≥ N; cache hit; refresh worker updates `checked_at` | unit | WP-04 | `yarn jest apps/mercato/src/modules/solana_gates` |
| AC-3 payment request | `gateway_solana/__tests__/transaction-request.test.ts`: GET body shape; POST builds `TransferChecked` to treasury ATA with exact amount, memo `aegis:v1:pay:<id>`, reference key; ATA creation when missing | unit | WP-05 | `yarn jest packages/gateway-solana` |
| AC-4 reconciliation | `gateway_solana/__tests__/reconcile.table.test.ts`: exact, over, under, wrong mint, wrong recipient, reused signature, expired, Token-2022 mint rejected, idempotent second call | unit (table-driven) | WP-05 | same |
| AC-5 webhook ingest | `solana_events/__tests__/helius-adapter.test.ts`: right header → 1 event; duplicate signature → 0 events; wrong header → 401; re-fetch failure → no emit | unit | WP-06 | `yarn jest apps/mercato/src/modules/solana_events` |
| AC-6 actions conformance | `solana_actions/__tests__/conformance.test.ts`: `actions.json` rules; OPTIONS/GET/POST headers (`Access-Control-*`, `X-Action-Version`, `X-Blockchain-Ids`); `ActionGetResponse`/`ActionPostResponse` schema for approve/pause/pay; non-operator account hides pause | conformance (supertest against route handlers) | WP-08 | `yarn jest apps/mercato/src/modules/solana_actions` |
| AC-7 program | `programs/aegis_registry/tests/litesvm/*.test.ts`: register (PDA, fields, max_len violation fails), commit (count++, event, fails when paused), status (operator can pause, cannot unpause; owner can) | program | WP-02 | `yarn test:program` (LiteSVM) + `anchor test` before deploy |
| AC-8 attestation verify | `solana_attestations/__tests__/pqc.test.ts` + `verify.route.test.ts`: sign/verify roundtrip; one-byte change → false; commitment salt | unit | WP-07 | `yarn jest apps/mercato/src/modules/solana_attestations` |
| AC-9 agent approval | `solana_attestations/__tests__/agent-tools.test.ts`: fake LLM; `propose_quote` → ApprovalRequest; approve → executed once; second approve → no-op; policy breach → `POLICY_DENIED`; audit entries | unit | WP-07 | same |
| AC-10 demo e2e | `scripts/demo-e2e.ts` on devnet | e2e | WP-10 | `yarn tsx scripts/demo-e2e.ts --cluster devnet` |
| AC-11 repo gates | `yarn generate && yarn typecheck && yarn lint && yarn test`; CI workflow | all | WP-01 | `yarn ci` (alias added by WP-01) |

Cross-package integration tests (on the integration branch, owned by the TL):
- `__integration__/solana-pay-flow.test.ts`: create order → payment request → fake tx observed via events subscriber → order paid (WP-05 + WP-06).
- `__integration__/approval-flow.test.ts`: propose → approve via API → executor worker → attestation committed with `FakeSolanaCoreService` (WP-07 + WP-02 IDL).
- `__integration__/blink-approve.test.ts`: GET approve action → POST → tx built → memo observed → approval executed (WP-08 + WP-07 + WP-06).
Playwright (optional, WP-09): `__integration__/dashboard-solana.spec.ts` — Settings page shows hot wallet balance; Approvals page approve button.
