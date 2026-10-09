# WP-04 — `solana_gates`: gate rules, DAS ownership checks, Core collection + soulbound Client Pass minting

| field | value |
|---|---|
| Package id | WP-04 |
| Branch | `feature/om-solana-wp-04-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.6 M |
| Estimated effort | 4 person-days (days 2–6) |
| Depends on | WP-01 (skeleton, pins); WP-03 interface only (`SolanaCoreService` + `FakeSolanaCoreService`, pushed day 2) |
| Dual review | no |

## 1. Objective
Token-gated access as a module: admins define gate rules (Metaplex Core collection membership, token balance ≥ N),
the service evaluates them per wallet through `SolanaCoreService` (Helius DAS, on-chain fallback), caches results,
refreshes them on a worker and on demand, and emits a change event that the portal and ACL consume. The module also
lets the agency create its Core collection and mint soulbound "Client Pass" assets to customers from the dashboard
and the CLI, and exposes a read-only AI tool.

## 2. Acceptance criteria covered
- AC-2: a `core_collection` rule returns `granted` for a wallet holding a Core asset of the collection (via the fake DAS) and `denied` otherwise; the result is cached in `solana_gate_results` and refreshed by the worker and by `POST /evaluate`.
- Contributes to AC-10 (demo step "gated Audit Portal") and AC-9 (`solana.get_gate_status` tool).

## 3. Read first
1. `AGENTS.md`, `.ai/docs/module-development.md`, `packages/core/AGENTS.md` (API routes, workers, injection widgets, `ai-tools`).
2. `apps/mercato/src/modules/example/` — `api/todos/route.ts` (`makeCrudRoute`), `workers/`, `widgets/injection/*` + `widgets/injection-table.ts`, `ai-tools.ts`, `cli.ts`.
3. `apps/mercato/src/modules/solana_core/services/solana-core.service.ts` and `fake-solana-core.service.ts` (WP-03) — consume only through DI (`solanaCoreService`).
4. `packages/core/src/modules/customers/` — `data/entities.ts` (customer ids) and `widgets/injection-table.ts` to find the customer-detail injection spot id (`admin.page:<path>:before` or a `crud-form:<entityId>:fields` spot — record which one you used).
5. `docs/CONTRACTS.md` (routes `/api/solana_gates/*`, event `solana_gates.result.changed`, tool `solana.get_gate_status`, table names).
6. `/Users/macbook/work/sandbox/solana-2026/output/research/02-solana-stack-2026.md` §5 (DAS `searchAssets` with `grouping: ['collection', C]`, `interface: 'MplCoreAsset'`, 2 RPS), §6 (Metaplex Core, Umi 1.6, `mpl-core@1.10.0`, soulbound `PermanentFreezeDelegate`, `Attributes` plugin, `fetchAssetsByOwner`).
7. `/Users/macbook/work/sandbox/solana-2026/output/01-intake/qa/solana-q_and_a.md` Q-SOL-03/04, `design-q_and_a.md` Q-DESIGN-06, `fe-q_and_a.md` Q-FE-03.
8. Metaplex Core JS docs: https://www.metaplex.com/docs/smart-contracts/core/sdk/javascript, soulbound guide https://www.metaplex.com/docs/smart-contracts/core/guides/create-soulbound-nft-asset.

## 4. Files owned
All under `apps/mercato/src/modules/solana_gates/`:
- `index.ts`, `acl.ts`, `setup.ts`, `di.ts`, `events.ts`, `i18n/en.json` (fill skeletons).
- `data/entities.ts` (`SolanaGateRule`, `SolanaGateResult`, `SolanaCollection`), `data/validators.ts` (rule schema), `migrations/*`.
- `services/gates.service.ts` (`GatesService`), `services/core-collection.service.ts` (Umi/mpl-core: create collection, mint pass), `services/umi.ts` (Umi instance from the hot wallet keypair: `createUmi(rpcUrl).use(mplCore()).use(keypairIdentity(...))`).
- `api/openapi.ts`, `api/rules/route.ts` (CRUD), `api/evaluate/route.ts`, `api/collections/route.ts`, `api/passes/mint/route.ts`.
- `workers/refresh-gates.ts` (`{ queue: 'solana_gates', id: 'solana_gates:refresh', concurrency: 1 }`), `subscribers/on-wallet-linked.ts` (evaluates on `solana_core.wallet.linked`).
- `widgets/injection/customer-gate-status/{widget.ts,widget.client.tsx}`, `widgets/injection-table.ts`, `widgets/components.ts`.
- `ai-tools.ts` (`solana.get_gate_status`), `cli.ts` (`mint-pass`, `create-collection`, `evaluate`).
- `__tests__/*`, `README.md`.

## 5. Files NOT to touch
- `solana_core` (consume via DI only), `solana_events`, `solana_actions`, `solana_attestations`, `packages/gateway-solana`, `packages/core` (incl. `portal`, `customer_accounts`, `customers`), `apps/mercato/src/modules.ts`, root/app `package.json`, `.github/workflows/*`, `apps/mercato/.env.example`, `eslint.ds.config.mjs`, `docs/CONTRACTS.md`. Portal pages and backend pages are WP-09's.
- Request changes in `REPORT.md` under "Shared-file changes requested" (for example a portal hook that WP-09 should call, or a dependency).

## 6. Interfaces and contracts
Consumed: `SolanaCoreService` (DI `solanaCoreService`): `getAssetsByOwner`, `searchAssets` (if WP-03 added it; otherwise filter `getAssetsByOwner` results by `grouping`), `getTokenBalance`, `hotWallet()`, `connection()`, `cluster()`. Event `solana_core.wallet.linked`.
Provided:
```ts
type GateRule = {
  id: string; tenantId: string; organizationId: string; name: string; enabled: boolean
  type: 'core_collection' | 'token_balance' | 'any_nft_of_collection'
  collection?: string; mint?: string; min?: string            // min as decimal string in base units
  grantsFeature?: string; grantsPortalSection?: string          // e.g. 'portal.audits'
}
type GateResult = { ruleId: string; walletAddress: string; customerId?: string; granted: boolean; evidence: { assetIds?: string[]; balance?: string; source: 'das'|'onchain'|'fake' }; checkedAt: Date }
interface GatesService {
  evaluate(input: { walletAddress?: string; customerId?: string; ruleIds?: string[]; force?: boolean }, scope): Promise<GateResult[]>
  status(customerId, scope): Promise<{ sections: string[]; features: string[]; results: GateResult[] }>
  createCollection(input: { name: string; uri?: string }, scope): Promise<{ collectionAddress: string; signature: string }>
  mintPass(input: { customerId: string; collectionAddress: string; tier: string; validUntil?: string }, scope): Promise<{ assetAddress: string; signature: string }>
}
```
Tables: `solana_gate_rules` (`id, tenant_id, organization_id, name, enabled, type, collection, mint, min, grants_feature, grants_portal_section, created_at, updated_at, deleted_at`), `solana_gate_results` (`id, tenant_id, organization_id, rule_id, wallet_address, customer_id null, granted bool, evidence jsonb, checked_at, created_at, updated_at`; unique `(rule_id, wallet_address)`), `solana_collections` (`id, tenant_id, organization_id, name, collection_address, created_by_wallet, signature, created_at, updated_at, deleted_at`).
Routes: `GET|POST|PUT|DELETE /api/solana_gates/rules` (`makeCrudRoute`, feature `solana_gates.manage` for writes), `POST /api/solana_gates/evaluate` body `{ walletAddress?: string; customerId?: string; force?: boolean }` → `GateResult[]`, `GET /api/solana_gates/status?customerId=` → `status()`, `POST /api/solana_gates/collections` → create, `POST /api/solana_gates/passes/mint` → mint (feature `solana_gates.manage`; policy: only the hot wallet signs).
Event: `solana_gates.result.changed` `{ ruleId, walletAddress, customerId?, granted, previous: boolean|null, tenantId, organizationId }` with `clientBroadcast: true`.
AI tool: `solana.get_gate_status` input `{ customerId: string }` → `status()`, `requiredFeatures: ['solana_gates.view']`, `isMutation: false`.
CLI: `yarn mercato solana_gates create-collection --name "<name>"`, `yarn mercato solana_gates mint-pass --customer <id> --collection <addr> --tier <tier>`, `yarn mercato solana_gates evaluate --wallet <addr>`.

## 7. Step-by-step implementation guide (one commit per step)
1. Entities + validators (Zod rule schema with per-type required fields); `yarn generate && yarn db:generate && yarn db:migrate`. Commit.
2. `GatesService.evaluate` for `core_collection` and `any_nft_of_collection` via DAS (`searchAssets`/`getAssetsByOwner` filtered by `grouping.group_value === collection`), for `token_balance` via `getTokenBalance`; on-chain fallback for Core using `fetchAssetsByOwner` from `@metaplex-foundation/mpl-core` when DAS throws; upsert `solana_gate_results`; emit `solana_gates.result.changed` only when `granted` changed. Unit tests with `FakeSolanaCoreService`. Commit.
3. `status(customerId)`: union over all linked wallets of the customer (read through `SolanaCoreService.getLinkedWallets(userId, tenantId, organizationId)`, which WP-03 provides and `FakeSolanaCoreService` stubs; never query `solana_wallet_links` directly), aggregating `grantsPortalSection` and `grantsFeature`. Commit.
4. Routes `rules`, `evaluate`, `status` with `metadata` + `openApi`. Commit.
5. `subscribers/on-wallet-linked.ts` (persistent, evaluates all enabled rules for the wallet) and `workers/refresh-gates.ts` (every 10 minutes: re-evaluate results older than 10 minutes, batch ≤ 50, respecting the DAS limiter). Commit.
6. `services/umi.ts` + `core-collection.service.ts`: `createCollection` (`createCollection` from mpl-core with name/uri), `mintPass` (`create({ asset, collection, name: 'Client Pass — <tier>', uri, plugins: [{ type: 'PermanentFreezeDelegate', frozen: true, authority: { type: 'None' } }, { type: 'Attributes', attributeList: [{ key: 'tier', value }, { key: 'valid_until', value }] }] })` to the customer's first linked wallet, via the hot wallet; store `solana_collections`; routes `collections`, `passes/mint`. Integration test behind `SOLANA_IT=1`. Commit.
7. `cli.ts` with the three commands. Commit.
8. Injection widget on the customer detail page: badge list (rule name → granted/denied, checked at, "Re-check" button calling `evaluate { force: true }`). Commit.
9. `ai-tools.ts` (`solana.get_gate_status`), `acl.ts` (`solana_gates.view/manage`), `setup.ts`, `i18n/en.json`, `README.md`; `yarn mercato auth sync-role-acls && yarn mercato configs cache structural --all-tenants`. Commit.
10. Tests (TESTS.md), full validation set, `REPORT.md`, `STATUS.md`; push; remove worktree.

## 8. Exact commands
```bash
yarn generate && yarn db:generate && yarn db:migrate
yarn mercato auth sync-role-acls && yarn mercato configs cache structural --all-tenants
yarn typecheck && yarn lint && yarn test --testPathPattern solana_gates
yarn mercato solana_gates create-collection --name "Example Security Labs Client Pass"
yarn mercato solana_gates mint-pass --customer <id> --collection <addr> --tier gold
yarn mercato solana_gates evaluate --wallet <addr>
SOLANA_IT=1 yarn test --testPathPattern solana_gates/__integration__
```

## 9. Tests to add
See `TESTS.md`.

## 10. Definition of done
- [ ] AC-2 proven by `gates.service.test.ts` (granted/denied/cached/refreshed).
- [ ] Three rule types evaluate; on-chain fallback covered by a test with DAS throwing.
- [ ] Worker and subscriber registered and visible in `yarn generate` output; event emitted only on change.
- [ ] Collection creation and soulbound mint work on devnet (asset address and signature in REPORT.md); the asset shows `ownership.frozen === true` via DAS.
- [ ] CLI commands work; injection widget renders on the customer page; AI tool listed in `ai-tools.generated.ts`.
- [ ] Routes export `metadata` + `openApi`; validation set green; secret scan clean; no AI mentions in commits.
- [ ] `REPORT.md`, `STATUS.md`; worktree removed.

## 11. Stop conditions
- WP-03 interface or fake not available by day 3 morning → stop and report (do not write your own `Connection` wrapper).
- `mpl-core@1.10.0` / Umi 1.6 incompatible with web3.js 1.99.x in this repo → stop after 2 hours and report the exact error.
- Tokens above 1.2 M, three failed gate runs, or a contract change needed → stop and report.

## 12. Report
Rule types implemented, which DAS call is used, the injection spot id used, devnet collection and pass addresses + signatures, how linked wallets are read, shared-file changes requested, deviations; ≤300 words.
