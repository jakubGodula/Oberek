# WP-08 — `solana_actions`: Solana Actions endpoints (approve, pause, pay), `actions.json`, self-hosted Blink page

| field | value |
|---|---|
| Package id | WP-08 |
| Branch | `feature/om-solana-wp-08-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.6 M |
| Estimated effort | 4 person-days (days 6–10, backend A) |
| Depends on | WP-01; WP-03 (`SolanaCoreService`, wallet links to resolve operators); WP-05 (`PaymentRequestService.buildTransaction`); WP-07 (`ApprovalService`, `RegistryProgramClient.buildSetAgentStatusIx`, `buildCommitAttestationIx`, agent registrations) |
| Dual review | no |

## 1. Objective (2–4 sentences)
Implement the Solana Actions surface of the product: `actions.json` at the domain root, three action families
(`approve/[approvalId]`, `pause/[agentId]`, `pay/[paymentRequestId]`) with spec-exact CORS/headers and `ActionGetResponse`/
`ActionPostResponse` bodies, server-side validation plus an intent memo and `reference` key for attribution (Q-SOL-07,
Q-SEC-06), a self-hosted Blink page `/blink/[kind]/[id]` rendered with `@dialectlabs/blinks@0.22.5`, and the subscriber
that marks an approval `executed` when its memo transaction is observed on-chain. X never renders Blinks natively
(Q-SOL-06); the demo uses this page, the public inspector `https://www.blinks.xyz/inspector`, and Phantom's experimental setting as a bonus.

## 2. Acceptance criteria covered (from 01-intake/PROBLEM.md)
- **AC-6**: `GET /actions.json`, and `OPTIONS`/`GET`/`POST` on `approve`, `pause`, `pay` return the required CORS headers
  (`Access-Control-Allow-Origin: *`; methods `GET,POST,PUT,OPTIONS`; allow headers `Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids`;
  expose `X-Action-Version, X-Blockchain-Ids`; response headers `X-Action-Version: 2.4`, `X-Blockchain-Ids: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` on devnet) and spec-shaped bodies; the inspector loads them.
- Supports **AC-9** (Blink approval path) and **AC-10** (demo).
- Contributes to **AC-11**.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root), `.ai/docs/module-development.md`
2. `apps/mercato/src/modules/example/{api/todos/route.ts,subscribers/invalidate-todo-summary.ts,frontend/*}` and `apps/mercato/next.config.*` (rewrites)
3. `apps/mercato/src/modules/solana_core/{services/solana-core.service.ts,data/entities.ts}` (wallet links), `docs/CONTRACTS.md`
4. `packages/gateway-solana/src/modules/gateway_solana/lib/payment-request.service.ts` (`buildTransaction`)
5. `apps/mercato/src/modules/solana_attestations/services/{approval.service.ts,registry-program.client.ts,agent-registry.service.ts}`
6. `docs/research/solana-stack-2026.md` §1 (Actions spec, headers, `type` values `transaction|post|external-link|message`, `links.next`, registry) and `@solana/actions@1.6.6` typings (`node_modules/@solana/actions/dist/index.d.ts`: `ActionGetResponse`, `ActionPostRequest`, `ActionPostResponse`, `createActionHeaders`, `createPostResponse`, `ACTIONS_CORS_HEADERS`)
7. `@dialectlabs/blinks` README (`Blink`, `useBlink`, `useAction` with a wallet adapter)

## 4. Files owned (create/modify only these)
```
apps/mercato/src/modules/solana_actions/index.ts, acl.ts, setup.ts, di.ts, events.ts, i18n/en.json
apps/mercato/src/modules/solana_actions/lib/cors.ts                      # headers + OPTIONS helper, X-Action-Version 2.4, X-Blockchain-Ids
apps/mercato/src/modules/solana_actions/lib/action-builder.ts            # memo + reference + feePayer/blockhash + serialise
apps/mercato/src/modules/solana_actions/lib/authorization.ts             # can(account) checks via wallet links + registrations
apps/mercato/src/modules/solana_actions/api/actions.json/route.ts        # served at /api/solana_actions/actions.json; root /actions.json via rewrite (request in REPORT)
apps/mercato/src/modules/solana_actions/api/approve/[approvalId]/route.ts
apps/mercato/src/modules/solana_actions/api/pause/[agentId]/route.ts
apps/mercato/src/modules/solana_actions/api/pay/[paymentRequestId]/route.ts
apps/mercato/src/modules/solana_actions/api/openapi.ts
apps/mercato/src/modules/solana_actions/subscribers/mark-executed-on-memo.ts
apps/mercato/src/modules/solana_actions/frontend/blink/[kind]/[id]/page.tsx     # /blink/<kind>/<id> self-hosted Blink page (client component)
apps/mercato/src/modules/solana_actions/frontend/blink/BlinkView.client.tsx
apps/mercato/src/modules/solana_actions/lib/share-links.ts               # action URL, inspector URL (https://www.blinks.xyz/inspector?url=<encoded>), dial.to URL (solana-action:<url>)
apps/mercato/src/modules/solana_actions/__tests__/*.test.ts
apps/mercato/src/modules/solana_actions/README.md
public/icons/aegis-approve.png, aegis-pause.png, aegis-pay.png            # if `public/` is app-owned; otherwise request via REPORT
```

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- Other modules (`solana_core`, `solana_gates`, `solana_events`, `solana_attestations`, `packages/gateway-solana`, `packages/core/*`), `programs/*`.
- `apps/mercato/src/modules.ts`, root `package.json`, `apps/mercato/next.config.*` (request the rewrite `{ source: '/actions.json', destination: '/api/solana_actions/actions.json' }`), `.github/workflows/*`, `apps/mercato/.env.example`, `eslint.ds.config.mjs`, `docs/CONTRACTS.md`.
- If `frontend/` pages cannot serve a public (unauthenticated) route in this Open Mercato version, request an `apps/mercato/src/app/blink/[kind]/[id]/page.tsx` file via REPORT.md instead of creating it.

## 6. Interfaces and contracts
Consumed:
- `SolanaCoreService` (Q-API-02): `connection()`, `cluster()`; wallet links repository (`solana_wallet_links`: `wallet_address`, `user_id`, `customer_id`, `verified_at`) read-only via its service `walletLinkService.findByAddress(address)` (WP-03).
- `PaymentRequestService.buildTransaction(reference, payer)` and `getById` (WP-05).
- `ApprovalService.get(id)`, `decide(id, 'approve', { wallet, via: 'blink' })`, `markExecuted(id, signature)`; `RegistryProgramClient.buildSetAgentStatusIx(agentId, false, signer)`, `buildCommitAttestationIx(...)`; `AgentRegistryService.get(agentSlug)` → `{ agentPda, operators, isActive, ownerPubkey }` (WP-07).
- Event `solana_events.tx.observed` (WP-06) with `memo`.

Provided routes (Q-API-01), all `requireAuth: false`, each exporting `GET`, `POST`, `OPTIONS`, `metadata`, `openApi`:
- `GET /api/solana_actions/actions.json` → `{ rules: [{ pathPattern: '/api/solana_actions/**', apiPath: '/api/solana_actions/**' }, { pathPattern: '/blink/**', apiPath: '/api/solana_actions/**' }] }` (root `/actions.json` via rewrite).
- `GET /api/solana_actions/approve/[approvalId]?account=<pubkey>` → `ActionGetResponse` `{ type: 'action', icon, title: 'Approve: <kind> #<short id>', description: '<payload summary>', label: 'Approve', links: { actions: [{ type: 'transaction', label: 'Approve', href: '/api/solana_actions/approve/<id>' }, { type: 'transaction', label: 'Reject', href: '/api/solana_actions/approve/<id>?decision=reject' }] }, disabled: <true when already decided or account not an operator>, error?: { message } }`.
  `POST { account }` → validate: approval `proposed`, `account` ∈ operators ∪ owner of the agent's registration (via wallet links); build tx: Memo `aegis:v1:approve:<approvalId>` (+ `:reject` variant), reference key `Keypair.generate().publicKey` stored on the approval's `reference` column (created by WP-07; if the column is missing on your integration base, request it via REPORT.md and keep the reference in the memo meanwhile), for `kind === 'attestation'` and `account === owner` also append `buildCommitAttestationIx`; `feePayer = account`; `recentBlockhash` fresh; return `createPostResponse({ fields: { type: 'transaction', transaction, message } })`. Do **not** change approval status in POST (Q-SOL-07): the subscriber does it when the memo is observed.
- `GET|POST /api/solana_actions/pause/[agentId]` → GET: title `Emergency pause: <agent>`, button hidden (`disabled: true`, `error.message: 'Not an operator'`) when `account` is not an operator/owner; POST: tx with Memo `aegis:v1:pause:<agentId>` + `buildSetAgentStatusIx(agentId, false, account)`.
- `GET|POST /api/solana_actions/pay/[paymentRequestId]` → GET: title/description with amount + symbol, `links.actions` single button `Pay <amount> <symbol>`; POST: `paymentRequestService.buildTransaction(reference, account)` wrapped in `createPostResponse`.
Provided page: `/blink/[kind]/[id]` (`kind` ∈ `approve|pause|pay`) rendering the Blink from `<PUBLIC_BASE_URL>/api/solana_actions/<kind>/<id>` with the wallet adapter from WP-03's `SolanaWalletProvider`; buttons "Copy action URL", "Open in inspector".
Provided subscriber: on `solana_events.tx.observed` with `memo` matching `^aegis:v1:approve:([0-9a-f-]{36})(:reject)?$` → `approvalService.decide(id, decision, { wallet: <first signer>, via: 'blink' })` then `markExecuted(id, signature)` if a `commit_attestation` instruction was in the same tx; memo `aegis:v1:pause:<agentId>` → nothing (WP-07 reacts to the program event).
Error codes: `ACTION_NOT_FOUND`, `ACTION_DISABLED`, `NOT_AN_OPERATOR`, `INVALID_ACCOUNT`, `ALREADY_DECIDED`.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. **Wiring.** `index.ts`, `acl.ts` (`solana_actions.view` for the share UI only), `setup.ts`, `events.ts` (`solana_actions.action.served` `{ kind, id, account? }` for metrics; no broadcast), `i18n/en.json`; `yarn generate`.
2. **CORS helper.** `lib/cors.ts`: `actionHeaders(cluster)` merging `createActionHeaders({ chainId: cluster === 'devnet' ? 'devnet' : 'mainnet', actionVersion: '2.4' })` from `@solana/actions` with the explicit header list in §2; `optionsResponse()` → 204 with the same headers. Unit test the exact header map.
3. **actions.json route** + README note about the root rewrite (REPORT request).
4. **Authorization helper.** `lib/authorization.ts`: `resolveActor(account)` → `{ walletAddress, userId?, customerId?, isOperatorOf(agentSlug), isOwnerOf(agentSlug) }` using wallet links + registrations.
5. **Action builder.** `lib/action-builder.ts`: `buildActionTx({ payer, memo, instructions, reference })` → `Transaction` with memo ix first, then the instructions, reference appended as a read-only key to the memo ix, `feePayer`, fresh `recentBlockhash` (`confirmed`); `serialize({ requireAllSignatures: false, verifySignatures: false })` → base64.
6. **approve route** (GET + POST + OPTIONS) per §6; include `?decision=reject` variant; GET hides buttons for non-operators by setting `disabled` and `error`.
7. **pause route** per §6.
8. **pay route** per §6 (delegates to WP-05).
9. **Subscriber** `mark-executed-on-memo.ts` (`metadata = { event: 'solana_events.tx.observed', persistent: true, id: 'solana_actions:mark-executed-on-memo' }`).
10. **Blink page** `/blink/[kind]/[id]` with `@dialectlabs/blinks` (`Blink` component + `useBlink` with the action URL) inside `SolanaWalletProvider`; `lib/share-links.ts` + copy buttons; keep it to `@open-mercato/ui` components where possible (public page may use plain Tailwind if the design-system lint block does not apply to `frontend/`).
11. **Conformance tests** (§9), `README.md` (how to test with the inspector, the registry application checklist: send URL + description to hello@dialect.to, note status), `REPORT.md`.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install
yarn generate
yarn typecheck && yarn lint && yarn test
yarn test apps/mercato/src/modules/solana_actions
yarn dev:greenfield
# conformance by hand (dev server on :3000, tunnel with `cloudflared tunnel --url http://localhost:3000` for the inspector):
curl -i -X OPTIONS http://localhost:3000/api/solana_actions/approve/<id>
curl -i "http://localhost:3000/api/solana_actions/approve/<id>?account=<operatorPubkey>"
curl -i -X POST http://localhost:3000/api/solana_actions/approve/<id> -H 'Content-Type: application/json' -d '{"account":"<operatorPubkey>"}'
# then paste https://<tunnel>/api/solana_actions/approve/<id> into https://www.blinks.xyz/inspector
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md`: header map, actions.json shape, GET/POST/OPTIONS per route with fakes (operator vs non-operator, decided approval, expired payment), action builder (memo first, reference key, base64 round trip), subscriber regex + decide/markExecuted calls, share-link encoding.

## 10. Definition of done (checklist)
- [ ] AC-6 tests pass; inspector shows all three action kinds without errors (screenshot path in REPORT); gates green.
- [ ] POST never mutates approval state; only the subscriber does, from an observed on-chain memo.
- [ ] Non-operators see `disabled` buttons on GET and get `NOT_AN_OPERATOR` on POST.
- [ ] All routes `requireAuth: false` with CORS `*`; `openApi` exported.
- [ ] Blink page works with Phantom in Testnet Mode on devnet (manual note in REPORT).
- [ ] Secret scan clean; no AI mentions in commits; `REPORT.md`, `STATUS.md = review`.

## 11. Stop conditions (when to stop and report instead of continuing)
- Token use > 1.2 M, or 3 failed gate runs on one step.
- `@dialectlabs/blinks@0.22.5` incompatible with React 19 / Next 16 → stop the page step, ship a minimal custom renderer (GET → buttons → POST → wallet `sendTransaction`) and note it; do not spend more than 3 hours on the library.
- Open Mercato cannot serve an unauthenticated module route or public page → REPORT.md request (see §5) and continue with tests.
- Contract change needed (e.g. a `reference` column on approvals) → REPORT.md proposal to WP-07's owner via the TL.

## 12. Report (what REPORT.md must contain)
200–300 words: files, test counts, the `next.config` rewrite line and any `public/` asset request, inspector screenshot path, Phantom test result, registry application status (sent on/when), known gaps, token use.
