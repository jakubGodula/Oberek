# TESTS.md — WP-08 solana_actions
All under `apps/mercato/src/modules/solana_actions/__tests__/`. Run: `yarn test apps/mercato/src/modules/solana_actions`.

| # | file | proves | command |
|---|------|--------|---------|
| 1 | `cors.test.ts` | `actionHeaders('devnet')` equals the exact map (origin `*`, methods, allow headers incl. `X-Accept-Action-Version, X-Accept-Blockchain-Ids`, expose `X-Action-Version, X-Blockchain-Ids`, `X-Action-Version: 2.4`, `X-Blockchain-Ids: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`); `OPTIONS` → 204 with them. | `yarn test .../__tests__/cors` |
| 2 | `actions-json.route.test.ts` | body has the two rules; headers present. | `... actions-json` |
| 3 | `approve.route.test.ts` | GET for operator → two enabled actions; GET for stranger → `disabled: true` + `error.message`; GET for decided approval → `disabled`; POST operator → base64 tx with memo `aegis:v1:approve:<id>` first and a reference key; POST stranger → 403 `NOT_AN_OPERATOR`; POST invalid account → 400 `INVALID_ACCOUNT`; POST never changes approval status (fake `ApprovalService` asserts no `decide`). | `... approve.route` |
| 4 | `pause.route.test.ts` | GET/POST operator → tx contains memo + `set_agent_status(false)` ix (fake `buildSetAgentStatusIx`); non-operator → disabled/403; already paused → disabled. | `... pause.route` |
| 5 | `pay.route.test.ts` | GET shows amount + symbol; POST returns the WP-05 transaction (fake `buildTransaction`); expired request → `ACTION_DISABLED`. | `... pay.route` |
| 6 | `action-builder.test.ts` | memo ix first, reference appended read-only, `feePayer` = account, `requireAllSignatures: false`, base64 round trip deserialises. | `... action-builder` |
| 7 | `mark-executed-on-memo.subscriber.test.ts` | memo `aegis:v1:approve:<uuid>` → `decide(id,'approve',{via:'blink'})`; `:reject` → reject; with commit ix → `markExecuted`; unrelated memo → no calls; signer taken from the tx. | `... mark-executed` |
| 8 | `share-links.test.ts` | inspector URL and `solana-action:` URL encoding. | `... share-links` |
| 9 | (manual, day 9) | inspector loads approve/pause/pay; Phantom (Testnet Mode) signs an approve from `/blink/approve/<id>`; approval shows `executed` + `decided_via: blink` within 15 s. | MANUAL-TESTS.md M-08 |
