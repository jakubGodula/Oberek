# PROBLEM.md — Open Mercato × Solana for security agencies (intake, 2026-10-07)

## 1. Restatement
Build, in two weeks with six people, a set of **Open Mercato modules and one gateway package** that give a small
security-focused software agency a Solana-native business back office: clients prove membership with a wallet
(NFT/token gating), pay in USDC via Solana Pay, see on-chain activity reconciled against orders, receive
quantum-safe-signed attestations of delivered work anchored on-chain, and interact with the agency's **AI agents** that
propose actions (quotes, attestations) which humans approve from the dashboard or from a **Blink**. Everything must sit
inside Open Mercato's conventions (modules, DI, events, API routes, widgets, ACL, tenancy) so it can be sold as a plugin
set or upstreamed. Devnet only. Deliverables: running app on a public URL, 5-minute demo path, video, deck, README.

Inputs: `00-task/TASK.md`; `research/01-open-mercato.md` (Open Mercato 0.8.0 facts), `research/02-solana-stack-2026.md`
(Solana facts as of 2026-10-07), `research/03-source-docs-review.md` (the Aegis Mercato documents and their conflicts).

## 2. Functional requirements
| id | requirement | source |
|----|-------------|--------|
| FR-1 | Users can link a Solana wallet to their Open Mercato account/customer account by signing a SIWS message; the link is verified server-side. | brief ("NFT ownership"), Q-SOL-09 |
| FR-2 | Admins define gate rules (Metaplex Core collection membership, token balance ≥ N) that grant portal sections or ACL features; the system evaluates them per wallet with caching and re-check. | brief, Q-SOL-03/04, Q-DESIGN-06 |
| FR-3 | The agency can mint a soulbound "Client Pass" (Metaplex Core) to a customer's wallet from the dashboard. | demo step 2 |
| FR-4 | Orders can be paid with Solana Pay (transaction request; USDC-dev primary, SOL optional) through a `GatewayAdapter` registered in `payment_gateways`; payment status reconciles from webhook and polling; the order shows the on-chain proof. | brief ("payment integration", "gateway"), `solana-payments-q_and_a.md` |
| FR-5 | On-chain transactions touching watched addresses (program, treasury, hot wallet, collection) are ingested via a Helius webhook adapter + polling fallback, normalised, deduplicated and emitted on the Open Mercato event bus; an Activity page and dashboard widget show them live. | brief ("event"), Q-SOL-08, Q-DESIGN-05/09 |
| FR-6 | Solana Actions endpoints (`actions.json`, approve, pause, pay) conform to the Actions spec, pass the Blink inspector, and render in a self-hosted Blink page. | brief ("gateway", Blinks), Q-SOL-06/07 |
| FR-7 | An Anchor program `aegis_registry` (or SAS, per Q-SOL-05) registers one agent per tenant with operators and a PQC public-key hash, commits attestations (content hash + PQC signature hash) and supports pause/unpause. | source docs, Q-RUST-02 |
| FR-8 | Attestations: hash a report (SHA3-256, salted), sign the hash with ML-DSA-65, commit on-chain, verify through an API and a CLI; the client sees it in the portal. | source docs (honest subset), Q-SEC-07 |
| FR-9 | Two AI agent skills (Intake & Quote, Report Attestation) as Open Mercato `ai-tools`/`ai-agents`; every mutation creates an `ApprovalRequest`; execution only after approval; policy limits enforced; audit log entries written; tools also reachable via the Open Mercato MCP server. | brief ("ai agents bot some functions to sell"), `ai-agents-q_and_a.md` |
| FR-10 | Dashboard: Solana settings, Gates, Activity, Approvals pages; Integration-health and Pending-approvals widgets; portal "Link wallet" + gated section. | Q-FE-02/03 |
| FR-11 | Demo data seed: one tenant "Example Security Labs", catalog (audit, re-test, retainer), two customers with wallets, one Client Pass collection. | demo path |

## 3. Non-functional requirements
- NFR-1 Open Mercato conventions: `yarn generate`, `typecheck`, `lint` (incl. `om-ds` rules), `test` all green; every route exports `openApi`; entities carry tenant/org/soft-delete columns.
- NFR-2 Security: no customer funds in the hot wallet; webhook = hint, RPC = truth; constant-time secret compares; agent policy guard on every mutation; gitleaks in CI; pinned dependencies; `cargo audit`/`npm audit`.
- NFR-3 Reliability on devnet: blockhash retry, simulation, priority fee, polling fallback, idempotent reconciliation.
- NFR-4 Testability: `SolanaCoreService` interface with a fake; LiteSVM program tests; table-driven reconciliation tests; Actions conformance tests; fake-LLM agent tests; one E2E demo script.
- NFR-5 Resumable, parallel work: disjoint module ownership; contracts frozen by day 2; integration branch per TPW rules.
- NFR-6 English in repo and UI; `i18n/en.json` only.

## 4. Out of scope (explicit)
- Zero-knowledge proofs / zkVM, on-chain verification of ML-DSA signatures (impossible natively), ML-KEM vault (stretch WP-11 only).
- Mainnet operations beyond one optional smoke test; custody of customer keys; fiat on/off-ramps; live price oracles.
- Multi-tenant hot wallets (columns present, one wallet for the demo); refunds from the server; KMS/HSM integration.
- Bun/SvelteKit stack from the PLAN documents.
- Upstream PR to Open Mercato during the hackathon (prepare, do not submit).

## 5. Acceptance criteria (each maps to a test in `02-plan/TEST-PLAN.md`)
| id | criterion |
|----|-----------|
| AC-1 | `POST /api/solana_core/wallet-link/verify` accepts a valid SIWS signature for the issued nonce and rejects replay, wrong domain, expired nonce. |
| AC-2 | A gate rule `core_collection` returns `granted` for a wallet holding a Core asset of the collection (DAS fake) and `denied` otherwise; the result is cached and refreshed. |
| AC-3 | `createSession` returns a Solana Pay transaction-request URL + QR payload; the transaction request `GET`/`POST` return spec-conformant bodies with the exact USDC amount, memo and reference. |
| AC-4 | Reconciliation marks a request `confirmed` exactly once for a valid transfer and never for under-payment, wrong mint, wrong recipient, reused signature or expired request. |
| AC-5 | A raw Helius payload with the right header produces one `solana_events.tx.observed` event (duplicates ignored); the wrong header is rejected with 401. |
| AC-6 | `GET /actions.json`, `OPTIONS`, `GET` and `POST` on `approve`, `pause`, `pay` return the required CORS headers and `ActionGetResponse`/`ActionPostResponse` shapes; the inspector loads them. |
| AC-7 | Program: `register_agent` creates the PDA with constraints; `commit_attestation` fails when paused; `set_agent_status(false)` succeeds for an operator, `set_agent_status(true)` fails for an operator. |
| AC-8 | Attestation API returns `valid: true` for a stored report hash and ML-DSA signature and `false` after one byte changes. |
| AC-9 | Agent tool `propose_quote` with a fake LLM creates an `ApprovalRequest`; `approve` executes exactly once; policy limit breach is refused with `POLICY_DENIED`; audit entries exist. |
| AC-10 | Demo E2E script runs the storyline on devnet end to end and prints every signature. |
| AC-11 | `yarn generate && yarn typecheck && yarn lint && yarn test` pass on the integration branch; CI green. |

## 6. Risks (top 8) and mitigations
| risk | likelihood | impact | mitigation |
|------|-----------|--------|------------|
| Open Mercato monorepo is heavy; `yarn generate`/build problems eat day 1–2 | medium | high | WP-01 owned by the TL on day 1 with a strong model; fallback to `create-mercato-app` standalone (Q-DESIGN-01 B). |
| web3.js v3 flips to `latest` on 2026-10-19 | high | medium | exact pins + `resolutions`; CI fails on unexpected majors. |
| Anchor 1.x toolchain surprises | medium | medium | Docker build image; same-day fallback to 0.31/0.32 line; or SAS (Q-SOL-05 B). |
| Blinks do not render where people expect | high | medium | self-hosted Blink page + inspector; never promise a tweet. |
| Devnet faucet/USDC-dev supply | medium | medium | fund one wallet early; self-minted test token. |
| Helius webhook unreachable on demo network | medium | high | polling fallback + health widget. |
| Six parallel migrations conflict | medium | medium | WP-01 creates all module skeletons and empty migrations first; merge plan order. |
| Agent demo non-determinism | medium | medium | golden conversation + fake LLM in tests; scripted prompts in `MANUAL-TESTS.md`. |

## 7. Proposed confidence / testing level
"Solid" (Q-AI-07 B): unit tests for crypto, reconciliation, gates, actions conformance; LiteSVM program tests; one
integration test per module; one scripted E2E on devnet nightly in week 2; dual review on WP-02, WP-05, WP-07.
