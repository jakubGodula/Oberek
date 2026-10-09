# TESTS.md — WP-04 solana_gates

Files under `apps/mercato/src/modules/solana_gates/__tests__/`; run `yarn test --testPathPattern solana_gates`.

| # | file | proves |
|---|------|--------|
| 1 | `validators.test.ts` | rule schema: `core_collection` requires `collection`; `token_balance` requires `mint` + `min`; unknown type rejected |
| 2 | `gates.service.test.ts` | AC-2: with `FakeSolanaCoreService` holding a Core asset of collection C → `granted: true`, evidence lists the asset id; a wallet without it → `false`; second call within 10 min returns the cached row (fake not called); `force: true` re-queries; `token_balance` with balance ≥ min → granted, below → denied; `solana_gates.result.changed` emitted only when the value flips |
| 3 | `gates.fallback.test.ts` | DAS throws → on-chain `fetchAssetsByOwner` path used; evidence `source: 'onchain'` |
| 4 | `status.test.ts` | union over two linked wallets; `sections` and `features` aggregated from granted rules only |
| 5 | `api.rules.test.ts` | CRUD route requires `solana_gates.manage` for writes; list is tenant-scoped |
| 6 | `api.evaluate.test.ts` | body validation; returns `GateResult[]`; `force` honoured |
| 7 | `worker.refresh.test.ts` | only results older than 10 min are re-evaluated; batch ≤ 50 |
| 8 | `subscriber.wallet-linked.test.ts` | `solana_core.wallet.linked` triggers evaluation for all enabled rules |
| 9 | `ai-tools.test.ts` | `solana.get_gate_status` returns `status()` and declares `isMutation: false`, `requiredFeatures: ['solana_gates.view']` |
| 10 | `__integration__/core-mint.it.test.ts` (skipped unless `SOLANA_IT=1`) | devnet: create collection, mint a soulbound pass to a test wallet, DAS shows `ownership.frozen === true` and the collection grouping; `evaluate` returns granted |
