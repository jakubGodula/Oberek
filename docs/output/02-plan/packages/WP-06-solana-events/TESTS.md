# TESTS.md — WP-06 solana_events
All under `apps/mercato/src/modules/solana_events/__tests__/`. Run: `yarn test apps/mercato/src/modules/solana_events`.

| # | file | proves | command |
|---|------|--------|---------|
| 1 | `tx-normaliser.test.ts` | fixtures `helius-raw-spl-transfer.json`, `helius-raw-sol-transfer.json`, `helius-raw-program-call.json`, `helius-raw-memo.json` → exact `TxObservedPayload` (token deltas, native deltas, programIds incl. inner, memo extracted). | `yarn test apps/mercato/src/modules/solana_events/__tests__/tx-normaliser` |
| 2 | `ingest.service.test.ts` | same signature 3× → one row, one `tx.observed`; `getTransaction` null → `NOT_FOUND`, nothing stored; unwatched accounts → `NOT_WATCHED`. Uses `FakeSolanaCoreService`. | `... ingest.service` |
| 3 | `helius-webhook.adapter.test.ts` | wrong/missing `Authorization` → 401 and no ingest; correct header → `ingestSignature` called once per item; comparison uses `timingSafeEqual`. | `... helius-webhook.adapter` |
| 4 | `anchor-log-decoder.test.ts` | logs from fixture with `AttestationCommitted` decode to the right fields; foreign program logs ignored. | `... anchor-log-decoder` |
| 5 | `activity-classifier.test.ts` | memo `aegis:v1:pay:` → `payment`; `AttestationCommitted` → `attestation`; `AgentStatusChanged` → `agent`; plain transfer → `transfer`. | `... activity-classifier` |
| 6 | `poll.worker.test.ts` | newest-first signatures ingested oldest-first; `lastSeen` advances; ≤ 5 RPC calls/s. | `... poll.worker` |
| 7 | `activity.route.test.ts` | `since`/`type`/`limit` filters; `requireFeatures` enforced; `openApi` exported. | `... activity.route` |
| 8 | `cli.register-webhook.test.ts` | builds the Helius request body (`rawDevnet`, addresses, URL, `authHeader`) without sending (fetch mocked). | `... cli.register-webhook` |
| 9 | (manual, day 6) | `register-webhook` on the VPS; a devnet transfer to the treasury appears in `/backend/solana/activity` within 10 s; stop the webhook → polling still shows it within 20 s. | MANUAL-TESTS.md M-06 |
