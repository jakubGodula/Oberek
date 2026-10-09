# TESTS.md — WP-05 gateway-solana
All under `packages/gateway-solana/src/modules/gateway_solana/__tests__/`. Run: `yarn workspace @open-mercato/gateway-solana test` (Jest 30) and `yarn test` at root.

| # | file | proves | command |
|---|------|--------|---------|
| 1 | `transaction-builder.test.ts` | USDC request → tx has memo first, `TransferChecked` last with exact amount/decimals, reference key read-only, treasury ATA create ix added only when missing; SOL request → `SystemProgram.transfer`; expired/non-pending request → throws `PAYMENT_REQUEST_EXPIRED`. | `yarn workspace @open-mercato/gateway-solana test transaction-builder` |
| 2 | `reconcile.table.test.ts` | table (Q-TEST-03): exact amount → `confirmed` once; second call → `changed: false`; over-payment → `confirmed` with `paid_amount`; under-payment → `partially_paid`; wrong mint → stays `pending` + `payment.failed`; wrong recipient → stays `pending`; reused signature → `SIGNATURE_REUSED`; expired → `expired`; Token-2022 fee mint → failed with `WRONG_MINT`. `findReference`/`validateTransfer` mocked. | `... test reconcile` |
| 3 | `transaction-request.route.test.ts` | `OPTIONS` 204 + exact CORS headers; `GET` returns `{label, icon}`; `POST {account}` returns base64 tx that deserialises with the expected instructions; invalid account → 400 `INVALID_ACCOUNT`. | `... test transaction-request` |
| 4 | `adapter.test.ts` | `createSession` returns url/reference/expiresAt; `getStatus` delegates to reconcile; `refund` → unsupported; `mapStatus` table; `verifyWebhook` constant-time header compare (wrong header → false). | `... test adapter` |
| 5 | `subscriber.test.ts` | `solana_events.tx.observed` containing the reference → `reconcile` called with the signature; unrelated tx → not called. | `... test subscriber` |
| 6 | `ai-tools.test.ts` | `solana.create_payment_request` is `isMutation` and requires `gateway_solana.manage`; `solana.get_payment_status` returns the status shape. | `... test ai-tools` |
| 7 | (manual, day 7) devnet | Phantom Testnet Mode pays a 1 USDC-dev request; status flips to `confirmed` within 30 s via polling and via the Helius path once WP-06 is integrated. | see MANUAL-TESTS.md M-05 |
