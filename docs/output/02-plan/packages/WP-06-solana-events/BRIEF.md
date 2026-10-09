# WP-06 — `solana_events`: on-chain event ingestion (Helius webhook + polling) and activity feed

| field | value |
|---|---|
| Package id | WP-06 |
| Branch | `feature/om-solana-wp-06-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.7 M |
| Estimated effort | 4 person-days (days 2–5/6) |
| Depends on | WP-01 (skeleton `apps/mercato/src/modules/solana_events`, pins, `.env.example`); WP-03 interface only (`SolanaCoreService` + fake); WP-02 IDL (`solana_attestations/idl/aegis_registry.json`) for program-log decoding — until it lands, decode with a committed fixture IDL under `__tests__/fixtures/` |
| Dual review | no |

## 1. Objective (2–4 sentences)
Build the `solana_events` module: one Helius **raw devnet webhook** received through Open Mercato's `@open-mercato/webhooks`
inbound machinery (`WebhookEndpointAdapter`, providerKey `helius`), a polling worker over the same watched addresses as a
fallback, a normaliser that turns either source into the `solana_events.tx.observed` payload (Q-API-03), dedup on signature,
Anchor event decoding from logs, and an activity feed (entities + `GET /api/solana_events/activity`) that the dashboard
shows live via `clientBroadcast`. The webhook is a hint; the transaction is always re-fetched from RPC before anything is emitted.

## 2. Acceptance criteria covered (from 01-intake/PROBLEM.md)
- **AC-5**: a raw Helius payload with the correct `Authorization` header produces exactly one `solana_events.tx.observed`
  event per signature (duplicates ignored, including Helius' 3 retries); a wrong header is rejected with 401 and nothing is stored.
- Supports **AC-4** (WP-05 reconciles from `tx.observed`) and **AC-10** (demo activity feed).
- Contributes to **AC-11**.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root), `.ai/docs/module-development.md`
2. `packages/webhooks/src/modules/webhooks/lib/adapter-registry.ts` (`WebhookEndpointAdapter`, `registerWebhookEndpointAdapter`) and `packages/webhooks/src/modules/webhooks/api/inbound/[endpointId]/route.ts` (rate limit, body limit, replay window, dedup, event emission)
3. `packages/webhooks/AGENTS.md` (if present) and `apps/docs/docs/framework/modules/*webhook*` pages
4. `apps/mercato/src/modules/example/{events.ts,subscribers/invalidate-todo-summary.ts,workers/*.ts,api/todos/route.ts,cli.ts}` — conventions for events, subscribers, workers, routes, CLI
5. `apps/mercato/src/modules/solana_core/services/solana-core.service.ts` (WP-03 interface + fake) and `docs/CONTRACTS.md`
6. `docs/research/solana-stack-2026.md` §5 (Helius webhooks: `rawDevnet`, `authHeader` echoed as `Authorization`, 3 retries, 2 RPS DAS; `getTransaction` needs `maxSupportedTransactionVersion: 1`)
7. `@anchor-lang/core@1.2.1` docs for `BorshCoder` / `EventParser` (`node_modules/@anchor-lang/core/dist/cjs/coder/borsh/event.d.ts`)

## 4. Files owned (create/modify only these)
```
apps/mercato/src/modules/solana_events/index.ts                 # metadata { name: 'solana_events', title: 'Solana Events', version: '0.1.0' }
apps/mercato/src/modules/solana_events/acl.ts                   # solana_events.view, solana_events.manage
apps/mercato/src/modules/solana_events/setup.ts
apps/mercato/src/modules/solana_events/di.ts                    # registerWebhookEndpointAdapter(heliusAdapter), services
apps/mercato/src/modules/solana_events/events.ts
apps/mercato/src/modules/solana_events/cli.ts                   # register-webhook, backfill
apps/mercato/src/modules/solana_events/i18n/en.json
apps/mercato/src/modules/solana_events/data/entities.ts         # SolanaObservedTx, SolanaActivityEntry
apps/mercato/src/modules/solana_events/data/validators.ts
apps/mercato/src/modules/solana_events/migrations/*
apps/mercato/src/modules/solana_events/lib/helius-webhook.adapter.ts
apps/mercato/src/modules/solana_events/lib/tx-normaliser.ts
apps/mercato/src/modules/solana_events/lib/anchor-log-decoder.ts
apps/mercato/src/modules/solana_events/lib/watched-addresses.ts
apps/mercato/src/modules/solana_events/lib/ingest.service.ts    # single entry point for both sources
apps/mercato/src/modules/solana_events/lib/helius-api.ts        # create/list webhooks via Helius REST
apps/mercato/src/modules/solana_events/workers/poll.ts
apps/mercato/src/modules/solana_events/api/openapi.ts
apps/mercato/src/modules/solana_events/api/activity/route.ts
apps/mercato/src/modules/solana_events/ai-tools.ts
apps/mercato/src/modules/solana_events/__tests__/*.test.ts
apps/mercato/src/modules/solana_events/__tests__/fixtures/*     # raw Helius payloads, IDL fixture
apps/mercato/src/modules/solana_events/README.md
```

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- Other modules (`solana_core`, `solana_gates`, `solana_actions`, `solana_attestations`, `packages/gateway-solana`, `packages/webhooks`, `packages/core`).
- `apps/mercato/src/modules.ts`, root `package.json`, `.github/workflows/*`, `apps/mercato/.env.example`, `eslint.ds.config.mjs`, `docs/CONTRACTS.md`.
- Requests (new env key such as `HELIUS_WEBHOOK_ID`, `modules.ts` entry, a dependency) → "Requests for the integrator" in `REPORT.md`.

## 6. Interfaces and contracts
Consumed: `SolanaCoreService` (Q-API-02: `connection()`, `getTransaction(signature)` with `maxSupportedTransactionVersion: 1`), settings read API from WP-03 (`GET /api/solana_core/status` → `{ cluster, programId, hotWallet, treasury, collection }`; until then read `AEGIS_PROGRAM_ID`, `TREASURY_WALLET`, `SOLANA_HOT_WALLET_PUBKEY`, `CLIENT_PASS_COLLECTION` from env through `lib/watched-addresses.ts`).

Provided events (Q-TS-05, Q-API-03):
```ts
// events.ts
createModuleEvents({ moduleId: 'solana_events', events: [
  { id: 'solana_events.tx.observed',          label: 'Transaction observed', entity: 'tx', category: 'integration' },               // no clientBroadcast
  { id: 'solana_events.program_log.observed', label: 'Program event observed', entity: 'program_log', category: 'integration', clientBroadcast: true },
  { id: 'solana_events.activity.created',     label: 'Activity entry created', entity: 'activity', category: 'crud', clientBroadcast: true },
] as const })

type TxObservedPayload = {
  signature: string; slot: number; blockTime: number | null; source: 'helius' | 'poll';
  accounts: string[]; programIds: string[];
  tokenTransfers: { mint: string; from: string; to: string; amount: string; decimals: number }[];
  nativeTransfers: { from: string; to: string; lamports: string }[];
  logs: string[]; memo?: string; raw?: unknown;
}
type ProgramLogObservedPayload = { signature: string; slot: number; programId: string; name: 'AgentRegistered'|'AttestationCommitted'|'AgentStatusChanged'|string; data: Record<string, unknown> }
```
Provided service:
```ts
interface IngestService { ingestSignature(signature: string, source: 'helius'|'poll'): Promise<{ emitted: boolean; reason?: 'DUPLICATE'|'NOT_FOUND'|'NOT_WATCHED' }> }
```
Route: `GET /api/solana_events/activity?since=<iso>&type=<payment|attestation|agent|transfer|other>&limit=50` → `{ items: ActivityEntry[], nextSince }` (`requireFeatures: ['solana_events.view']`).
Entities: `solana_observed_txs` (`id`, `tenant_id`, `organization_id`, `signature` unique, `slot`, `block_time`, `source`, `payload` jsonb, `created_at`), `solana_activity_entries` (`id`, `tenant_id`, `organization_id`, `signature`, `type`, `title`, `summary`, `explorer_url`, `related_entity` (`{ module, entity, id }` jsonb nullable), `occurred_at`, `created_at`, `updated_at`, `deleted_at`).
AI tool: `solana.list_activity` (`{ since?, type?, limit? }`, read-only, `requiredFeatures: ['solana_events.view']`).
CLI: `yarn mercato solana_events register-webhook --tenant <id>` (creates a `rawDevnet` Helius webhook with `accountAddresses` = watched addresses, `webhookURL` = `<PUBLIC_BASE_URL>/api/webhooks/inbound/<endpointId>`, `authHeader` = `HELIUS_WEBHOOK_AUTH`); `yarn mercato solana_events backfill --address <pubkey> --limit 100`.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. **Module wiring.** `index.ts`, `acl.ts`, `setup.ts` (`admin: ['solana_events.*']`, `employee: ['solana_events.view']`), `events.ts` as in §6, `i18n/en.json`. `yarn generate && yarn typecheck`.
2. **Entities + migration.** Both entities with tenant/org/soft-delete columns, unique index on `signature` in `solana_observed_txs`. `yarn db:generate`, review, `yarn db:migrate`.
3. **Watched addresses.** `lib/watched-addresses.ts`: `getWatchedAddresses(ctx): Promise<{ programId, treasury, hotWallet, collection }[]>` from settings (WP-03 API) with env fallback; cache 60 s.
4. **Normaliser.** `lib/tx-normaliser.ts`: `normalise(parsed: ParsedTransactionWithMeta, source)` → `TxObservedPayload`: accounts from `transaction.message.accountKeys`, programIds from instructions (incl. inner), token transfers from `meta.preTokenBalances/postTokenBalances` deltas (mint, owner, amount, decimals), native transfers from `preBalances/postBalances` deltas, logs from `meta.logMessages`, memo from a Memo-program instruction (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) if any. Pure function; unit-tested on fixtures.
5. **Ingest service.** `ingestSignature(signature, source)`: if `solana_observed_txs` has the signature → `DUPLICATE`; `core.getTransaction(signature)` (re-fetch; never trust the webhook body) → `NOT_FOUND` if null; if none of the accounts is watched → `NOT_WATCHED`; else insert the observed row (unique-violation = `DUPLICATE`), emit `solana_events.tx.observed`, run the Anchor decoder (step 6) and the activity classifier (step 8).
6. **Anchor log decoder.** `lib/anchor-log-decoder.ts`: load the IDL (`apps/mercato/src/modules/solana_attestations/idl/aegis_registry.json`, fallback to `__tests__/fixtures/aegis_registry.idl.json`), `new EventParser(programId, new BorshCoder(idl))`, `parseLogs(logs)` → emit `solana_events.program_log.observed` per event. Skip silently if the program id is not in `programIds`.
7. **Helius adapter.** `lib/helius-webhook.adapter.ts` implementing `WebhookEndpointAdapter`: `providerKey: 'helius'`, `allowUnscopedInbound: false` (endpoint is created per tenant), `verifyWebhook(req)` = constant-time compare (`crypto.timingSafeEqual` on equal-length buffers) of `Authorization` header with the endpoint's stored secret (`HELIUS_WEBHOOK_AUTH`), `processInbound(body)` = for each item in the raw array take `item.transaction.signatures[0]` and call `ingestSignature(sig, 'helius')`; return 200 always after verification (so Helius does not retry forever), 401 on bad header. Register in `di.ts` with `registerWebhookEndpointAdapter`.
8. **Activity classifier + route.** In `ingest.service.ts`: map a payload to `SolanaActivityEntry` (`type`: `payment` if memo starts `aegis:v1:pay:` or treasury received tokens; `attestation` if program event `AttestationCommitted`; `agent` if `AgentRegistered|AgentStatusChanged` or memo `aegis:v1:approve:`; `transfer` for other token/native transfers; else `other`), `title`/`summary` human-readable, `explorer_url = https://explorer.solana.com/tx/<sig>?cluster=devnet`; emit `solana_events.activity.created`. Route `api/activity/route.ts` with `openApi`.
9. **Polling worker.** `workers/poll.ts` `{ queue: 'solana_events', id: 'solana_events:poll', concurrency: 1 }`: every 10 s per watched address `connection.getSignaturesForAddress(addr, { until: lastSeen, limit: 50 })`, newest-first → ingest oldest-first; persist `lastSeen` per address in a small `configs` entry or an in-memory map seeded from the newest `solana_observed_txs` row. Rate-limit to ≤ 5 RPC calls/s.
10. **CLI.** `cli.ts`: `register-webhook` (Helius REST `POST https://api.helius.xyz/v0/webhooks?api-key=…` with `webhookType: 'rawDevnet'`, `accountAddresses`, `webhookURL`, `authHeader`; prints the webhook id for the integrator to put in `.env`), `backfill` (ingest the last N signatures of an address).
11. **AI tool** `solana.list_activity`; `README.md`; tests (§9); `REPORT.md`.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install
yarn generate
yarn db:generate && yarn db:migrate
yarn mercato auth sync-role-acls
yarn mercato configs cache structural --all-tenants
yarn typecheck && yarn lint && yarn test
yarn test apps/mercato/src/modules/solana_events          # module tests only
yarn mercato solana_events register-webhook --tenant <id>  # needs HELIUS_API_KEY, PUBLIC_BASE_URL
yarn mercato solana_events backfill --address <TREASURY_WALLET> --limit 20
```
Local webhook check without Helius: `curl -X POST http://localhost:3000/api/webhooks/inbound/<endpointId> -H "Authorization: $HELIUS_WEBHOOK_AUTH" -H 'Content-Type: application/json' --data @__tests__/fixtures/helius-raw-transfer.json`.

## 9. Tests to add (file names + what each proves)
See `TESTS.md`: normaliser fixtures (SPL transfer, SOL transfer, program call with Anchor event, memo), ingest dedup + 401, decoder, classifier, poll worker ordering, route filters, CLI payload shape.

## 10. Definition of done (checklist)
- [ ] AC-5 tests pass; `yarn generate && yarn typecheck && yarn lint && yarn test` green.
- [ ] Webhook body never trusted: every emitted event comes from `getTransaction`.
- [ ] Duplicate delivery (same payload 3×) yields one row, one event.
- [ ] Polling and webhook share `ingestSignature`; no second normaliser.
- [ ] `solana_events.activity.created` and `program_log.observed` have `clientBroadcast: true`.
- [ ] Every route exports `openApi`; error codes `WEBHOOK_UNAUTHORIZED`, `TX_NOT_FOUND`.
- [ ] Secret scan clean; no AI mentions in commits; `REPORT.md` + `STATUS.md = review`.

## 11. Stop conditions (when to stop and report instead of continuing)
- Token use > 1.4 M, or 3 failed gate runs on one step.
- `@open-mercato/webhooks` adapter contract does not fit (e.g. no per-tenant endpoint secret) → stop and propose using the `payment_gateways` hub route or a module-local `requireAuth: false` route; wait for TL.
- Contract change needed (payload shape) → REPORT.md proposal.
- Devnet outage > 2 h → work with fixtures; note it.

## 12. Report (what REPORT.md must contain)
200–300 words: files, test counts, the Helius webhook id and endpoint id (not the secret), the `modules.ts` entry request, any env keys needed, a sample activity entry, known gaps (e.g. inner-instruction token transfers), token use.
