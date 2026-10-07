# PLAN.md — execution plan, om-solana / open-mercato-solana-hackathon (DRAFT on defaults, 2026-10-07)

> **Status: DRAFT.** No Q&A answers have arrived yet; every decision below is the default from `01-intake/qa/*`.
> After `inbox/` is filled, re-run the plan step (or hand-edit) and record the final answers in `ANSWERS-RESOLVED.md`.
> The TL signs off in `SIGNOFF.md`; nothing starts before that except WP-01.

## 1. Package table
Calendar: 14 days, day 1 = kickoff. "Tier" = minimum model tier for the AI worker (strong / mid / cheap). "Placement"
= local (developer machine) | remote (rented box) | either. Assignee = role; names go in `ASSIGNMENTS.md`.

| id | title | depends on | parallel group | days | tier | placement | assignee (role) | status |
|----|-------|-----------|----------------|------|------|-----------|-----------------|--------|
| WP-01 | Foundation: fork, toolchain, module skeletons, contracts, CI, hosting | — | G0 | 1–2 | strong | local | TL | planned |
| WP-02 | Anchor program `aegis_registry` + LiteSVM tests + devnet deploy + IDL | WP-01 | G1 | 2–6 | strong | local | Rust owner | planned |
| WP-03 | `solana_core`: RPC, hot wallet, tx sender, SIWS wallet link, settings | WP-01 | G1 | 2–5 | strong | either | backend owner A | planned |
| WP-04 | `solana_gates`: rules, DAS ownership checks, Core collection + soulbound mint | WP-01, WP-03 (interface only) | G1 | 2–6 | mid | either | backend owner B | planned |
| WP-05 | `gateway-solana`: Solana Pay adapter, payment requests, reconciliation | WP-01, WP-03 (interface only) | G1 | 2–7 | strong | local | payments owner | planned |
| WP-06 | `solana_events`: Helius adapter, polling worker, normaliser, activity entities | WP-01, WP-03 (interface only) | G1 | 2–6 | mid | either | backend owner C | planned |
| WP-07 | `solana_attestations`: PQC signing, attestation + approval entities, program client, agent tools, PolicyGuard, executor worker | WP-01, WP-02 (IDL), WP-03 | G2 | 5–10 | strong | local | TL + agents owner | planned |
| WP-08 | `solana_actions`: actions.json, approve/pause/pay actions, Blink page, conformance tests | WP-01, WP-03, WP-05 (pay handler), WP-07 (approval API) | G2 | 6–10 | mid | either | backend owner A | planned |
| WP-09 | Dashboard pages, widgets, portal wallet-link + gated section, realtime feed | WP-01, WP-03…WP-07 (APIs) | G2 | 6–11 | mid | either | frontend owner | planned |
| WP-10 | Demo seed, E2E script, README, deck, video, submission | WP-01…WP-09 | G3 | 8–14 | cheap | local | pitch owner | planned |
| WP-11 | Stretch: ML-KEM vault for report blobs | WP-07 | G3 | 11–13 | mid | either | whoever is free | optional |
| WP-12 | Stretch: x402-paid attestation verify route + external agent demo via MCP | WP-07, WP-08 | G3 | 11–13 | mid | either | whoever is free | optional |

Minimum viable path (solo fallback): WP-01 → WP-03 → WP-04 → WP-05 → WP-09 (settings + activity + checkout only) → WP-10.

## 2. Timeline (two weeks)
| day | what happens |
|-----|--------------|
| 1 | Kickoff. TL runs WP-01 on a strong model. Team answers Q&A (blocking first). Rust owner installs Anchor 1.2.1 and proves `anchor build` on the empty program. Someone collects devnet SOL + USDC-dev and applies for the Dialect registry. |
| 2 | WP-01 merged to the integration branch (`feature/om-solana-integration-<stamp>`). Contracts frozen (`api-contract` answers). TL runs the plan step again with answers → `READY`. G1 packages start on their own branches. |
| 3–6 | G1 in parallel: WP-02, WP-03, WP-04, WP-05, WP-06. WP-03's `SolanaCoreService` interface + fake is pushed on day 2 evening so WP-04/05/06 compile against it. Daily 15-minute sync: branch status, contract changes (none allowed without TL). |
| 5 | WP-03 integrated (first real merge). WP-07 starts. |
| 6–7 | WP-02 (program deployed, IDL + id in `.env.example`), WP-04, WP-06 integrated; WP-05 integrated day 7 after dual review. WP-08 and WP-09 start. |
| 8–10 | WP-07 integrated (dual review). WP-08, WP-09 finish. WP-10 starts (seed, E2E script, README). First full demo rehearsal on the public URL on day 10. |
| 11 | Security review session (Q-AI-08) on the program, actions endpoints and PolicyGuard; fixes. Stretch packages only if G2 is merged. |
| 12 | Second rehearsal, video recording, deck. Freeze of features. |
| 13 | Bug fixes only; final E2E on devnet; optional mainnet smoke of Solana Pay; manual tests (`MANUAL-TESTS.md`) executed and recorded. |
| 14 | Submission; `FINAL-REPORT.md`. |

## 3. Decomposition rules applied
- Disjoint file ownership: each package owns one module folder (or one package) plus its own tests; shared files
  (`apps/mercato/src/modules.ts`, root `package.json`, CI, `.env.example`) are owned by WP-01 and changed later only by the
  TL during integration (packages describe the needed line in their `REPORT.md`).
- Contracts between packages are the ones in `api-contract-q_and_a.md` Q-API-01…05 (frozen on day 2) and repeated in
  every brief under "Interfaces".
- Each package fits one executor session of a mid or strong model with the brief alone; briefs tell the worker which
  Open Mercato docs to read first and nothing else.
- One branch per package: `feature/om-solana-<wp>-<model>-<harness>-<stamp>`; worktree `<repo>-for-ai/<model>-<stamp>`;
  no force-push, no merge to main, no `--no-verify`.

## 4. Where the people are
Six people, six roles (names in `ASSIGNMENTS.md`):
- **TL** — WP-01 (days 1–2), WP-07 co-owner (5–10), integration and review merge throughout.
- **Rust owner** — WP-02 (2–6); from day 7 the x402 spike (WP-12) or support for WP-10.
- **Backend A** — WP-03 (2–5), then WP-08 (6–10).
- **Backend B** — WP-04 (2–6), then pitch owner for WP-10 (8–14).
- **Payments owner** — WP-05 (2–7), then WP-11 or the security-review session (day 11).
- **Frontend owner** — WP-06 (2–5, a small backend module that defines the activity data the UI shows), then WP-09 (6–11).
Agents owner for WP-07 = TL unless `ai-and-budget` names someone else.

## 5. Gates
- Gate 0 per package: `yarn generate && yarn typecheck && yarn lint && yarn test` + package tests + secret scan.
- Gate 1: single review (cheap/mid model, read-only) for all; dual review for WP-02, WP-05, WP-07.
- Gate 2: intent check by a fresh-context agent against the brief's acceptance criteria.
- Step 4: `MANUAL-TESTS.md` executed by humans on days 10 and 13.

## 6. Files in this folder
`packages/WP-nn-<slug>/{BRIEF.md,TESTS.md,STATUS.md}`, `ASSIGNMENTS.md`, `MODEL-MATRIX.md`, `TOKENOMICS.md`,
`MERGE-PLAN.md`, `TEST-PLAN.md`, `MANUAL-TESTS.md`, `ANSWERS-RESOLVED.md`, `SIGNOFF.md`.
