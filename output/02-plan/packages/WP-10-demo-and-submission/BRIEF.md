# WP-10 — Demo seed, E2E script, README, deck, video, submission

| field | value |
|---|---|
| Package id | WP-10 |
| Branch | `feature/om-solana-wp-10-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | cheap for docs, deck and video script; mid for `scripts/demo-e2e.ts` and the seed |
| Placement | local |
| Estimated tokens | 0.5 M |
| Estimated effort | 5 person-days spread over days 8–14 (pitch owner = backend B per PLAN.md §4) |
| Depends on | WP-01…WP-09 on the integration branch (seed and E2E script can start on day 8 against WP-03…WP-07; README/deck/video from day 10 after the first rehearsal) |
| Dual review | no |

## 1. Objective (2–4 sentences)
Make the product demonstrable and submittable: a deterministic demo data seed, one script that drives the whole
storyline on devnet and prints every signature, a README that gets a stranger to a running local instance in ten
minutes, a 2–3 minute video script with a shot list, a ten-slide pitch deck outline, a `SECURITY.md`, and the
hackathon submission checklist. Everything says plainly what runs on devnet and what is not yet real
(product-q_and_a.md Q-PROD-07 default A: devnet only, say so).

## 2. Acceptance criteria covered (AC-n from 01-intake/PROBLEM.md, restated concretely)
- FR-11: seed creates tenant "Example Security Labs", three catalog items, two customers with devnet wallets, one
  Client Pass collection, one registered agent.
- AC-10: `scripts/demo-e2e.ts` runs register → mint pass → link wallet → gate → create order → pay → reconcile →
  propose quote → approve (dashboard API) → attestation → verify on devnet and prints every transaction signature;
  exit code 0 on success.
- AC-11 (reporting): README documents the exact validation commands and the CI badge.
- Submission artefacts (TASK.md §4 item 4): README, deck outline, video script, submission checklist, `SECURITY.md`.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root), `.ai/docs/module-development.md` — seed conventions (`setup.ts` `seedDefaults` / `seedExamples`), CLI pattern.
2. `packages/core/src/modules/seeds/` and `apps/mercato/src/modules/example/setup.ts` — how example data is seeded per tenant.
3. `packages/core/src/modules/catalog/` and `packages/core/src/modules/customers/` — entity fields needed by the seed
   (product, price, customer person/company).
4. `docs/CONTRACTS.md` (WP-01) — every route the E2E script calls.
5. `apps/mercato/src/modules/solana_core/cli.ts`, `solana_gates/cli.ts`, `solana_attestations/cli.ts` (WP-03/04/07) — CLI commands the script may shell out to.
6. `README.md` of the fork (WP-01 version) — extend, do not replace the Open Mercato quick start.
7. `02-plan/MANUAL-TESTS.md` in the run folder — the video shot list must map 1:1 to its numbered checks.
8. `01-intake/qa/product-q_and_a.md` — persona, storyline, pricing slide; the Q-PROD-01 answer decides the submission form.

## 4. Files owned (create/modify only these)
- `apps/mercato/src/modules/solana_core/setup.ts` → only the `seedExamples` function body (the file skeleton is WP-01's;
  WP-03 owns `seedDefaults`; coordinate by editing only the `seedExamples` export) — alternative if conflicts arise:
  `scripts/seed-demo.ts` (preferred when WP-03 already touched `setup.ts`).
- `scripts/seed-demo.ts`, `scripts/demo-e2e.ts`, `scripts/lib/demo-keypairs.ts` (loads keypairs from `.demo/` which is gitignored)
- `README.md` (sections: Overview, Architecture diagram, 10-minute local setup, Environment table, Demo walkthrough, What is real / devnet-only, Validation commands, License)
- `SECURITY.md`
- `docs/pitch/DECK-OUTLINE.md`, `docs/pitch/VIDEO-SCRIPT.md`, `docs/pitch/SUBMISSION-CHECKLIST.md`, `docs/pitch/screenshots/` (PNG files from WP-09 rehearsal)
- `docs/DEMO-RUNBOOK.md` (how to reset devnet state and re-run the demo in 5 minutes)
- Tests: `scripts/__tests__/demo-e2e.plan.test.ts`

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- Any module code (`services/`, `api/`, `data/`, `backend/`, `widgets/`, `frontend/`) in the Solana modules or
  `gateway-solana` — owned by WP-03…WP-09. A missing CLI/route → "Contract gap" in REPORT.md.
- `apps/mercato/src/modules.ts`, root `package.json`, `yarn.lock`, `.github/workflows/*`, `.env.example`,
  `docker-compose*.yml` — WP-01/TL. New env var needed by the script → "Requested shared-file change" in REPORT.md
  (the script must read existing variables only).
- `programs/aegis_registry/**` (WP-02).

## 6. Interfaces and contracts (exact TS signatures / routes / events this package provides and consumes)
`scripts/demo-e2e.ts` calls, in order (routes from `api-contract-q_and_a.md` Q-API-01, auth via an API key `omk_...`
created for the demo tenant and read from `DEMO_API_KEY` in the local `.env`, which WP-01 lists; if absent, request it):
1. `yarn mercato solana_attestations register-agent --slug aegis-ops` (CLI, WP-07) → agent PDA printed.
2. `yarn mercato solana_gates mint-pass --customer <id>` (CLI, WP-04) → asset address printed.
3. `POST /api/solana_core/wallet-link/challenge` + `.../verify` using the demo customer keypair (`signMessage` path).
4. `POST /api/solana_gates/evaluate { customerId }` → expect `granted: true` for the `audits` rule.
5. Create an order for "Re-test (8h)" through the sales API (`POST /api/sales/orders` — confirm the exact path in `packages/core/src/modules/sales/api/`, cite it).
6. `POST /api/gateway_solana/payment-requests { orderId }` → `url`; `GET url` then `POST url { account }`; sign with the
   customer keypair using `@solana/web3.js@1.99.x`; send via the Helius devnet RPC; poll `GET .../payment-requests/[id]/status` until `confirmed`.
7. `POST /api/ai_assistant/...` or the agent tool route (confirm in `packages/ai-assistant` docs) to run `solana.propose_quote`
   with a fixed prompt; alternatively call the tool handler through the MCP server — pick whichever is callable by API key and cite it.
8. `POST /api/solana_attestations/approvals/[id]/decide { decision: 'approve' }` → wait for `executionSignature`.
9. `POST /api/solana_attestations/attestations { attachmentId }` (upload a fixture PDF first via the attachments API) → approval → decide → `GET .../attestations/[id]/verify` → `valid: true`.
10. Print a table: step, signature, `https://explorer.solana.com/tx/<sig>?cluster=devnet`.
Seed data (fixed ids so the video and manual tests can reference them):
- Tenant/org: "Example Security Labs"
- Catalog: "Smart-contract audit (5d)" 4,500 USDC; "Re-test (8h)" 800 USDC; "Security retainer (monthly)" 2,000 USDC (currency `USDC`, 6 decimals, per solana-payments-q_and_a.md Q-PAY-08)
- Customers: "Nova DeFi Labs" (wallet from `.demo/customer-1.json`), "Orbit Bridge" (wallet from `.demo/customer-2.json`)
- Gate rule: `{ type: 'core_collection', collection: <Client Pass collection>, grantsPortalSection: 'audits' }`
- Agent: slug `aegis-ops`, policy `{ maxUsdcPerDay: '5000', allowedTools: ['solana.propose_quote','solana.propose_attestation'] }`

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. Create the worktree; `yarn install && yarn generate && yarn typecheck`.
2. `scripts/lib/demo-keypairs.ts`: load/create keypairs in `.demo/` (gitignored by WP-01; verify, else report); fund via `scripts/fund-wallet.ts` (WP-01).
3. `scripts/seed-demo.ts` (or `seedExamples`): idempotent seed of the data in §6 using the ORM via `createRequestContainer()`; print ids.
4. `scripts/demo-e2e.ts` steps 1–5 with structured logging; stop on first failure with the failing step and response body.
5. Steps 6–10; `--from <step>` flag to resume; `--dry-run` that only prints the plan (used by the unit test).
6. `docs/DEMO-RUNBOOK.md`: reset procedure (new reference keys, new approval), devnet funding, what to do if Helius is down (polling fallback, Settings page shows last indexed slot).
7. `README.md`: architecture Mermaid diagram (modules → Open Mercato seams → Solana programs/services), 10-minute setup
   (`corepack enable`, `yarn infra:up`, `.env`, `yarn dev:greenfield`, `yarn mercato ... register-webhook`, seed, open `/backend`),
   env table (every key in `.env.example` with purpose and "secret?" column), demo walkthrough, honesty section, validation commands.
8. `SECURITY.md`: threat model summary (hot wallet scope, webhook trust, agent policy, PQC scope, devnet only), reporting contact, out of scope.
9. `docs/pitch/DECK-OUTLINE.md`: 10 slides — Problem; Persona (Web3 security firm); Solution; Demo (storyline Q-PROD-04 A);
   Architecture on Open Mercato (seams reused); Solana design choices (web3.js 1.99 pin and the 2026-10-19 v3 flip,
   Metaplex Core soulbound pass, Solana Pay transaction requests, Blinks reality: self-hosted page + inspector, no native X unfurl);
   Security model; PQC honesty (ML-DSA signatures + hash commitments, no ZK); Business model (open-core + agency licence, Q-PROD-06); Team & next.
10. `docs/pitch/VIDEO-SCRIPT.md`: 2–3 minutes, shot list with timestamps, each shot referencing a `MANUAL-TESTS.md` check id; B-roll of the Blink inspector and explorer.
11. `docs/pitch/SUBMISSION-CHECKLIST.md`: generic items (repo public, README, video link, deck PDF, team, demo URL, licence) + a section "fill from Q-PROD-01 answer".
12. Screenshots captured during the day-10 rehearsal into `docs/pitch/screenshots/`.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install && yarn generate
yarn tsx scripts/seed-demo.ts                       # or: yarn mercato solana_core seed-examples (if seedExamples path chosen)
yarn tsx scripts/demo-e2e.ts --dry-run
yarn tsx scripts/demo-e2e.ts                        # devnet, needs .env + .demo/ keypairs
yarn tsx scripts/demo-e2e.ts --from 6               # resume at payment
yarn typecheck && yarn lint && yarn test
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md` (T-10-01 … T-10-04).

## 10. Definition of done (checklist)
- [ ] `yarn tsx scripts/demo-e2e.ts` passes on devnet twice in a row on day 13; output pasted into REPORT.md.
- [ ] Seed is idempotent (running twice does not duplicate data).
- [ ] README setup verified by a teammate who did not write it, on a clean machine, within 10 minutes.
- [ ] Deck outline, video script, submission checklist, `SECURITY.md`, `DEMO-RUNBOOK.md` reviewed by the TL.
- [ ] Honesty section lists: devnet only, single hot wallet, no ZK, Blink rendering surface, x402/vault stretch status.
- [ ] `yarn typecheck && yarn lint && yarn test` green.
- [ ] REPORT.md written; STATUS.md updated; worktree removed; branch pushed.
- [ ] No AI mentions in commits.

## 11. Stop conditions (when to stop and report instead of continuing)
- A route or CLI from §6 does not exist on the integration branch → "Contract gap", stop that step, continue with docs.
- Devnet outage > 2 hours → run the script with `--dry-run`, report, retry later.
- 2× the token estimate, or 3 failed Gate 0 runs.
- Q-PROD-01 unanswered by day 12 → produce the generic checklist and flag it.

## 12. Report (what REPORT.md must contain)
E2E run log with signatures; seed ids; contract gaps; requested shared-file changes; list of docs delivered; teammate
setup-test result (name/role, minutes taken); tokens used; test results.
