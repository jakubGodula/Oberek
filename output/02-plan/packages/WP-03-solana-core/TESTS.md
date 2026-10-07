# TESTS.md — WP-03 solana_core

All files under `apps/mercato/src/modules/solana_core/__tests__/`; run `yarn test --testPathPattern solana_core`.

| # | file | proves |
|---|------|--------|
| 1 | `config.test.ts` | valid env parses; missing `SOLANA_RPC_URL` or malformed `SOLANA_HOT_WALLET_SECRET` throws a typed error; `toString()` never contains the secret |
| 2 | `hot-wallet.test.ts` | base58 and JSON-array secrets both load to the same public key; `sign` adds a valid signature |
| 3 | `tx-sender.test.ts` (mocked `Connection`) | simulation failure aborts before send; CU limit = ceil(units×1.1); priority fee falls back to 1_000 when the Helius estimate fails; blockhash expiry triggers a rebuild up to 3 times then throws `TX_EXPIRED`; success returns `{ signature, slot }` |
| 4 | `das-client.test.ts` (mocked fetch) | `getAssetsByOwner` pages and maps to `DasAsset`; `searchAssets` passes `grouping`/`interface`; limiter spaces calls ≥ 500 ms apart |
| 5 | `siws.test.ts` | happy path with a locally generated keypair (AC-1); replayed nonce → `NONCE_REUSED`; expired → `NONCE_EXPIRED`; wrong domain → `DOMAIN_MISMATCH`; tampered message → `SIWS_INVALID`; `signMessage` fallback accepted |
| 6 | `fake-solana-core.service.test.ts` | the fake satisfies the interface: balances, assets, canned transactions, recorded `sendAndConfirm` calls |
| 7 | `api.wallet-link.test.ts` (route handlers invoked directly with a fake container) | challenge returns nonce + message; verify stores `solana_wallet_links` row, emits `solana_core.wallet.linked`, second verify with the same nonce fails |
| 8 | `api.status.test.ts` | status route shape; feature `solana_core.view` required (401/403 without) |
| 9 | `__integration__/devnet.it.test.ts` (skipped unless `SOLANA_IT=1`) | real devnet: `status` reports a slot; `sendAndConfirm` of a 1-lamport self-transfer confirms; `getTransaction` returns it |
