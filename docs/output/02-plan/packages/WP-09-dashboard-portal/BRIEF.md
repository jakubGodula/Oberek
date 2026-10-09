# WP-09 — Dashboard pages, widgets, portal wallet-link + gated section, checkout payment UI

| field | value |
|---|---|
| Package id | WP-09 |
| Branch | `feature/om-solana-wp-09-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.8 M |
| Estimated effort | 5 person-days (days 6–11) |
| Depends on | WP-01 (skeletons, `modules.ts` entries), WP-03 (`SolanaWalletProvider`, SIWS routes, `GET /api/solana_core/status`), WP-04 (gate routes), WP-05 (payment-request routes), WP-06 (activity route + events), WP-07 (approvals + attestations routes). All five must be on the integration branch before this package starts (day 6). |
| Dual review | no |

## 1. Objective (2–4 sentences)
Build every human-facing surface of the Solana integration on top of the APIs delivered by WP-03…WP-07: four admin
pages (Settings, Gates, Activity, Approvals), three dashboard widgets (Integration health, Activity feed, Pending
approvals), the customer-portal "Link wallet" page and the gated `/portal/audits` section, and the checkout payment UI
(Solana Pay QR + "Pay with wallet" button + status polling). Only `@open-mercato/ui` components and lucide icons; no
custom theming (fe-q_and_a.md Q-FE-06). Realtime via SSE `clientBroadcast` events with a 5-second polling fallback
(design-q_and_a.md Q-DESIGN-09).

## 2. Acceptance criteria covered (AC-n from 01-intake/PROBLEM.md, restated concretely)
- FR-10 (full): Settings, Gates, Activity, Approvals pages exist under `/backend/solana_core`, `/backend/solana_gates`,
  `/backend/solana_events`, `/backend/solana_attestations/approvals`; Integration-health and Pending-approvals widgets
  register in the dashboard; portal has "Link wallet" and a gated `/portal/audits` section.
- AC-1 (UI side): the portal "Link wallet" page completes the SIWS challenge/verify round-trip against
  `POST /api/solana_core/wallet-link/challenge` and `.../verify` and shows the linked address.
- AC-2 (UI side): the Gates page lists rules, has "Evaluate" for a wallet/customer and shows cached results with
  `checked_at` and a "Re-check" button.
- AC-3 (UI side): the checkout UI renders a QR of the transaction-request URL returned by `POST /api/gateway_solana/payment-requests`
  and the "Pay with wallet" button sends the same transaction through the wallet adapter; the status moves to
  `confirmed` without a page reload.
- AC-6 (UI side): the Approvals page "Share as Blink" button copies both the raw action URL
  (`<PUBLIC_BASE_URL>/api/solana_actions/approve/<approvalId>`) and the inspector URL
  (`https://www.blinks.xyz/inspector?url=<encoded raw action URL>`).
- AC-10 (UI side): every step of the demo storyline (product-q_and_a.md Q-PROD-04 option A) has a screen.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root) and `.ai/docs/module-development.md` — module conventions, `om-ds` lint rules.
2. `apps/mercato/src/modules/example/backend/page.tsx`, `.../backend/page.meta.ts` — backend page pattern
   (`"use client"`, `Page/PageHeader/PageBody` from `@open-mercato/ui/backend/Page`).
3. `apps/mercato/src/modules/example/widgets/dashboard/notes/{widget.ts,widget.client.tsx,config.ts}` — dashboard
   widget pattern (`DashboardWidgetModule`, `lazyDashboardWidget(() => import('./widget.client'))`).
4. `apps/mercato/src/modules/example/widgets/injection-table.ts` — injection spot ids.
5. `packages/core/src/modules/portal/` and `packages/core/src/modules/customer_accounts/` — portal routing and
   extension points (find the page registration pattern; cite it in REPORT.md).
6. `packages/checkout/` — where pay-link pages render, to hang the payment UI.
7. `packages/ui/` — the component index (`Button`, `DataTable`, `Card`, `Badge`, `Dialog`, `Toast`).
8. `apps/docs/docs/framework/modules/reference-example-module.mdx` and `eslint.ds.config.mjs`.
9. `docs/CONTRACTS.md` (written by WP-01) — the frozen routes, events and interfaces.
10. `apps/mercato/src/modules/solana_core/frontend/SolanaWalletProvider.tsx` (WP-03).

## 4. Files owned (create/modify only these)
- `apps/mercato/src/modules/solana_core/backend/page.tsx`, `page.meta.ts` (Settings)
- `apps/mercato/src/modules/solana_core/widgets/dashboard/integration-health/{widget.ts,widget.client.tsx,config.ts}`
- `apps/mercato/src/modules/solana_gates/backend/page.tsx`, `page.meta.ts` (Gates)
- `apps/mercato/src/modules/solana_events/backend/page.tsx`, `page.meta.ts` (Activity)
- `apps/mercato/src/modules/solana_events/widgets/dashboard/activity-feed/{widget.ts,widget.client.tsx,config.ts}`
- `apps/mercato/src/modules/solana_attestations/backend/approvals/page.tsx`, `page.meta.ts` (Approvals)
- `apps/mercato/src/modules/solana_attestations/backend/page.tsx`, `page.meta.ts` (Attestations list, links to verify)
- `apps/mercato/src/modules/solana_attestations/widgets/dashboard/pending-approvals/{widget.ts,widget.client.tsx,config.ts}`
- `apps/mercato/src/modules/solana_core/frontend/portal/LinkWalletPage.tsx` and the portal registration file the
  portal module expects (path found in step 3.5; record it)
- `apps/mercato/src/modules/solana_gates/frontend/portal/AuditsPage.tsx` (gated section)
- `packages/gateway-solana/src/modules/gateway_solana/frontend/{SolanaPayCheckout.tsx,PaymentStatus.tsx,useRealtime.ts}`
- `apps/mercato/src/modules/{solana_core,solana_gates,solana_events,solana_attestations}/i18n/en.json` (additive keys only)
- `packages/gateway-solana/src/modules/gateway_solana/i18n/en.json` (additive)
- Tests: `apps/mercato/src/modules/*/backend/__tests__/*.test.tsx`, `packages/gateway-solana/src/modules/gateway_solana/frontend/__tests__/*.test.tsx`,
  `apps/mercato/__integration__/solana-dashboard.spec.ts` (Playwright)

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- Any `services/`, `api/`, `data/`, `events.ts`, `di.ts`, `subscribers/`, `workers/`, `ai-tools.ts`, `ai-agents.ts` in
  the five Solana modules or `gateway-solana` (owned by WP-03…WP-08). Missing API field → "Contract gap" entry in REPORT.md.
- `apps/mercato/src/modules.ts`, root `package.json`, `yarn.lock`, `.github/workflows/*`, `.env.example`,
  `eslint.ds.config.mjs`, `docker-compose*.yml` (WP-01 / TL). Needed line → "Requested shared-file change" in REPORT.md.
- Any `migrations/` folder. This package adds no entities.
- Other modules in `packages/core` (portal, customer_accounts, checkout): extend through their documented extension
  points only; if an extension point is missing, write the smallest wrapper in an owned file and report it.

## 6. Interfaces and contracts (exact TS signatures / routes / events this package provides and consumes)
Consumed routes (all from `api-contract-q_and_a.md` Q-API-01; all return JSON; auth = Open Mercato session):
- `GET /api/solana_core/status` → `{ cluster, rpcLatencyMs, hotWallet: { address, lamports }, programId, lastWebhookAt, lastIndexedSlot, treasury }`
- `POST /api/solana_core/wallet-link/challenge` `{ walletAddress }` → `{ nonce, message, expiresAt }`
- `POST /api/solana_core/wallet-link/verify` `{ walletAddress, signature, message }` → `{ linked: true, walletAddress, verifiedAt }`
- `GET /api/solana_gates/rules`, `POST /api/solana_gates/rules` (rule schema: `{ type: 'core_collection'|'token_balance'|'any_nft_of_collection', collection?, mint?, min?, grantsFeature?, grantsPortalSection? }`)
- `POST /api/solana_gates/evaluate` `{ walletAddress | customerId }` → `{ results: [{ ruleId, granted, checkedAt, evidence }] }`
- `GET /api/solana_events/activity?since=&type=` → `{ items: [{ id, signature, slot, blockTime, kind, summary, explorerUrl, relatedOrderId?, relatedApprovalId? }] }`
- `GET /api/solana_attestations/approvals` → `{ items: [{ id, kind, status, payload, proposedBy, proposedAt, decidedVia?, executionSignature? }] }`
- `POST /api/solana_attestations/approvals/[id]/decide` `{ decision: 'approve'|'reject' }`
- `GET /api/solana_attestations/attestations`, `GET /api/solana_attestations/attestations/[id]/verify` → `{ valid, contentHash, pqcSigHash, signature, slot }`
- `POST /api/gateway_solana/payment-requests` `{ orderId }` → `{ id, url, qrPayload, reference, amount, mint, decimals, expiresAt }`
- `GET /api/gateway_solana/payment-requests/[id]/status` → `{ status: 'pending'|'confirmed'|'finalized'|'expired'|'partially_paid', signature?, slot?, explorerUrl? }`
Consumed events (SSE via `clientBroadcast: true`, ids from `typescript-q_and_a.md` Q-TS-05):
`solana_core.wallet.linked`, `solana_gates.result.changed`, `gateway_solana.payment.confirmed`, `gateway_solana.payment.failed`,
`solana_attestations.attestation.committed`, `solana_attestations.approval.requested|approved|rejected|executed`,
`solana_attestations.agent.paused`, `solana_events.program_log.observed`.
Consumed components: `SolanaWalletProvider` (WP-03, `apps/mercato/src/modules/solana_core/frontend/SolanaWalletProvider.tsx`),
`@solana/wallet-adapter-react@0.15.40` hooks `useWallet`, `useConnection`.
Provided: `useRealtime(eventIds: string[], fallbackPollMs = 5000, onEvent)` hook (owned file) reused by all pages.
Blink URLs: raw `${PUBLIC_BASE_URL}/api/solana_actions/approve/${approvalId}`; inspector
`https://www.blinks.xyz/inspector?url=${encodeURIComponent(raw)}`; pause: `.../pause/${agentId}`; pay: `.../pay/${paymentRequestId}`.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. Create the worktree from the integration branch; run `yarn install && yarn generate && yarn typecheck` to confirm a clean start.
2. `useRealtime.ts`: subscribe to the Open Mercato client event stream (find the SSE client helper used by existing
   widgets, cite it); on error or no message for 15 s fall back to calling the page's refetch every 5 s. Unit test with a fake EventSource.
3. Settings page (`solana_core/backend/page.tsx` + `page.meta.ts` with `requireFeatures: ['solana_core.view']`,
   `pageGroup: 'Solana'`, `pageOrder: 10`, `icon: 'wallet'`): read-only cards for cluster, RPC latency, hot-wallet
   address + balance, program id, treasury, last webhook, last indexed slot; "Copy" buttons. No editing of secrets.
4. Integration-health dashboard widget: same data, compact; `config.ts` `features: ['dashboards.view','solana_core.view']`.
5. Gates page: `DataTable` of rules (type, collection/mint, min, grants), "Add rule" dialog posting to `POST /api/solana_gates/rules`,
   "Evaluate" dialog (wallet address or customer picker) calling `POST /api/solana_gates/evaluate`, results table with `checkedAt` and "Re-check".
6. Activity page: paginated feed from `GET /api/solana_events/activity`, filters by `type`, explorer links, related
   order/approval links; live via `useRealtime(['solana_events.program_log.observed','gateway_solana.payment.confirmed', ...])`.
7. Activity-feed dashboard widget: last 10 entries, same hook.
8. Approvals page (`solana_attestations/backend/approvals/`): table with status badges; row actions Approve / Reject
   (confirm dialog → `POST .../decide`), "Share as Blink" (copies raw + inspector URLs, shows a toast), "Pause agent"
   button producing the pause Blink URLs; live via `solana_attestations.approval.*` events. `page.meta.ts` `requireFeatures: ['solana_attestations.manage']`.
9. Attestations page: list + "Verify" action showing the verify response; explorer link.
10. Pending-approvals dashboard widget: count + first 5 with Approve shortcut.
11. Portal "Link wallet" page: `SolanaWalletProvider` → connect (Phantom/Solflare/Backpack) → `challenge` →
    `signIn` (SIWS) or `signMessage` fallback → `verify` → show linked address and gate results.
12. Portal `/portal/audits` gated section: calls `POST /api/solana_gates/evaluate` with the current customer; if
    `granted` for a rule with `grantsPortalSection: 'audits'`, list attestations with verify links; otherwise show
    "Hold a Client Pass to access" with the collection address.
13. Checkout UI (`SolanaPayCheckout.tsx`): on mount `POST /api/gateway_solana/payment-requests { orderId }`; render
    QR with `createQR(encodeURL({ link: new URL(url) }))` from `@solana/pay` (isolate: only URL/QR helpers, no RPC
    objects); "Pay with wallet" fetches `GET <url>` then `POST <url> { account }`, deserialises the base64 transaction,
    `sendTransaction` via wallet adapter; `PaymentStatus.tsx` polls `.../status` every 3 s and listens to
    `gateway_solana.payment.confirmed`; shows signature + explorer link (`https://explorer.solana.com/tx/<sig>?cluster=devnet`).
14. `i18n/en.json` keys for every string; run `yarn lint` and fix `om-ds` findings.
15. Playwright spec `apps/mercato/__integration__/solana-dashboard.spec.ts` with a mocked wallet (window.solana stub) covering steps 3–10.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install
yarn generate
yarn typecheck
yarn lint
yarn test --filter=@open-mercato/mercato --filter=@open-mercato/gateway-solana   # or: yarn test
yarn dev            # http://localhost:3000/backend
yarn playwright test apps/mercato/__integration__/solana-dashboard.spec.ts
yarn mercato configs cache structural --all-tenants   # after adding pages/widgets
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md` (T-09-01 … T-09-09).

## 10. Definition of done (checklist)
- [ ] All pages/widgets render with real data from the integration branch on `yarn dev`; no console errors.
- [ ] `yarn generate && yarn typecheck && yarn lint && yarn test` green; Playwright spec green.
- [ ] Only `@open-mercato/ui` components and lucide icons; `om-ds` lint clean.
- [ ] SSE live updates verified for Activity and Approvals; polling fallback verified by killing the SSE endpoint.
- [ ] Portal wallet link + gated section verified with Phantom (devnet mode).
- [ ] Checkout QR scanned by a mobile wallet and "Pay with wallet" from the browser both reach `confirmed`.
- [ ] i18n keys for all strings; English only.
- [ ] REPORT.md written; STATUS.md updated; worktree removed; branch pushed.
- [ ] No AI mentions in commits.

## 11. Stop conditions (when to stop and report instead of continuing)
- An API route or field from §6 does not exist on the integration branch → do not invent it; log "Contract gap" and stop that page.
- Portal module has no usable extension point for a new page after 2 hours → implement the minimal route-group wrapper (fe-q_and_a.md Q-FE-03 option B) and report.
- 2× the token estimate, or 3 failed Gate 0 runs.
- Any need to change `modules.ts`, root `package.json` or `.env.example`.

## 12. Report (what REPORT.md must contain)
Pages/widgets delivered with routes; the portal registration mechanism used (file paths); contract gaps found;
requested shared-file changes; screenshots list (paths) for WP-10; tokens used; test results (commands + pass/fail counts).
