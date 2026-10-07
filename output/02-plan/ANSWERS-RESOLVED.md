# ANSWERS-RESOLVED.md — every question with its final answer and source (DRAFT: all defaults, no human answers yet)

Generated 2026-10-07 before any file returned to `01-intake/inbox/`. Every row's source is **default**. When answers
arrive, the plan step rewrites this table: source becomes `human (<name>, <date>)` or `default (unanswered)`; blocking
questions without an answer stop the plan (round 2, max 2 rounds).

| question | default applied | blocking | source |
|----------|-----------------|----------|--------|
| Q-AGENT-01 Where the agents run | A | yes | default (no answer yet) |
| Q-AGENT-02 LLM provider for the product agents | C | no | default (no answer yet) |
| Q-AGENT-03 The two agent skills (see `product-q_and_a.md` Q-PROD-05) | A | no | default (no answer yet) |
| Q-AGENT-04 Approval channel priority | A | no | default (no answer yet) |
| Q-AGENT-05 Agent policy model | A | no | default (no answer yet) |
| Q-AGENT-06 MCP exposure for external agents | A | no | default (no answer yet) |
| Q-AGENT-07 Evidence and audit trail | A | no | default (no answer yet) |
| Q-AI-01 Who holds which AI licence? | B | yes | default (no answer yet) |
| Q-AI-02 Which harnesses are in use? | A | no | default (no answer yet) |
| Q-AI-03 Orchestrator model for intake, plan, integration and review-merge | A | no | default (no answer yet) |
| Q-AI-04 Worker model minimum per package type | A | no | default (no answer yet) |
| Q-AI-05 Token/money budget for AI during the two weeks | A | no | default (no answer yet) |
| Q-AI-06 Criticality and review mode | A | no | default (no answer yet) |
| Q-AI-07 Confidence and testing level | B | no | default (no answer yet) |
| Q-AI-08 Separate security-audit session planned? | A | yes | default (no answer yet) |
| Q-AI-09 Sharing mode for Q&A and plan files | A | no | default (no answer yet) |
| Q-AI-10 Solo-mode fallback | A | no | default (no answer yet) |
| Q-API-01 Public HTTP routes (Open Mercato convention `/api/<module>/<path>`) | A | no | default (no answer yet) |
| Q-API-02 `solana_core` service interface used by every other package | A | no | default (no answer yet) |
| Q-API-03 Normalised on-chain event payload | A | no | default (no answer yet) |
| Q-API-04 Agent tool names (AI assistant `defineAiTool`) | A | no | default (no answer yet) |
| Q-API-05 Anchor program instruction set (frozen for the TS client) | A | no | default (no answer yet) |
| Q-DESIGN-01 Platform: Open Mercato (Next.js) or the SvelteKit plan? | A | yes | default (no answer yet) |
| Q-DESIGN-02 Module decomposition | A | yes | default (no answer yet) |
| Q-DESIGN-03 Keep PQC / ZK? | A | no | default (no answer yet) |
| Q-DESIGN-04 Where does the on-chain "agent" identity live? | A | no | default (no answer yet) |
| Q-DESIGN-05 On-chain event ingestion path | A | no | default (no answer yet) |
| Q-DESIGN-06 Token-gating enforcement point | A | no | default (no answer yet) |
| Q-DESIGN-07 Human approval mechanism for agent actions | A | no | default (no answer yet) |
| Q-DESIGN-08 Repo strategy | A | no | default (no answer yet) |
| Q-DESIGN-09 Realtime updates in the dashboard | A | no | default (no answer yet) |
| Q-DESIGN-10 Use of Open Mercato skills and AGENTS.md conventions by the AI workers | A | no | default (no answer yet) |
| Q-DEVOPS-01 Public hosting for the demo | A | no | default (no answer yet) |
| Q-DEVOPS-02 Toolchain versions (pin on day 1) | A | no | default (no answer yet) |
| Q-DEVOPS-03 RPC and indexing provider | A | no | default (no answer yet) |
| Q-DEVOPS-04 Secrets handling | A | no | default (no answer yet) |
| Q-DEVOPS-05 CI | A | no | default (no answer yet) |
| Q-DEVOPS-06 Local dev environment | A | no | default (no answer yet) |
| Q-DEVOPS-07 Devnet SOL and USDC supply | A | no | default (no answer yet) |
| Q-DEVOPS-08 Observability for the demo | A | no | default (no answer yet) |
| Q-FE-01 Wallet connection in the browser | A | no | default (no answer yet) |
| Q-FE-02 Admin screens to build (minimum) | A | no | default (no answer yet) |
| Q-FE-03 Customer portal: token-gated area | A | no | default (no answer yet) |
| Q-FE-04 Blink sharing UX | A | no | default (no answer yet) |
| Q-FE-05 Payment UX in the demo | A | no | default (no answer yet) |
| Q-FE-06 Design system compliance | A | no | default (no answer yet) |
| Q-FE-07 i18n | A | no | default (no answer yet) |
| Q-PROD-01 Which hackathon, deadline and judging criteria? | A | yes | default (no answer yet) |
| Q-PROD-02 The customer persona for the demo | B | yes | default (no answer yet) |
| Q-PROD-03 Product name and positioning | A | no | default (no answer yet) |
| Q-PROD-04 The demo storyline (what the judge sees in 5 minutes) | A | yes | default (no answer yet) |
| Q-PROD-05 Which two agent "skills" to sell first? | A | no | default (no answer yet) |
| Q-PROD-06 Pricing / business model slide | A | no | default (no answer yet) |
| Q-PROD-07 Mainnet claims in the pitch | A | no | default (no answer yet) |
| Q-PROD-08 Submission artefacts owner | B | no | default (no answer yet) |
| Q-RUST-01 Toolchain | A | yes | default (no answer yet) |
| Q-RUST-02 Program scope (instructions, accounts, events) | A | no | default (no answer yet) |
| Q-RUST-03 Authorisation model | A | no | default (no answer yet) |
| Q-RUST-04 Attestation storage: PDA per attestation vs events only | A | no | default (no answer yet) |
| Q-RUST-05 Event emission | A | no | default (no answer yet) |
| Q-RUST-06 Tests | A | no | default (no answer yet) |
| Q-RUST-07 Deploy, program id and upgrade authority | A | no | default (no answer yet) |
| Q-RUST-08 Security constraints checklist | A | no | default (no answer yet) |
| Q-RUST-09 Pause semantics | A | no | default (no answer yet) |
| Q-SEC-01 Server hot wallet: what may it do? | A | yes | default (no answer yet) |
| Q-SEC-02 Who may trigger the kill-switch / pause on-chain? | A | no | default (no answer yet) |
| Q-SEC-03 Wallet-based login (Sign-In-With-Solana) vs. existing Open Mercato auth | A | no | default (no answer yet) |
| Q-SEC-04 Webhook authentication and trust | A | no | default (no answer yet) |
| Q-SEC-05 Agent spend and action limits | A | no | default (no answer yet) |
| Q-SEC-06 Replay and tampering protection for Blink POSTs | A | no | default (no answer yet) |
| Q-SEC-07 Post-quantum claims | A | no | default (no answer yet) |
| Q-SEC-08 Secrets in the repo and CI | A | no | default (no answer yet) |
| Q-SEC-09 Multi-tenancy boundary for Solana data | B | no | default (no answer yet) |
| Q-SEC-10 Dependency and supply-chain hygiene | A | no | default (no answer yet) |
| Q-PAY-01 Payment protocol | A | yes | default (no answer yet) |
| Q-PAY-02 Settlement token(s) | A | no | default (no answer yet) |
| Q-PAY-03 What "paid" means | A | no | default (no answer yet) |
| Q-PAY-04 Recipient (treasury) wallet and token accounts | A | no | default (no answer yet) |
| Q-PAY-05 Detection path and idempotency | A | no | default (no answer yet) |
| Q-PAY-06 Refunds and cancellations | A | no | default (no answer yet) |
| Q-PAY-07 Mapping to the Open Mercato gateway contract | A | no | default (no answer yet) |
| Q-PAY-08 Currency setup inside Open Mercato | A | no | default (no answer yet) |
| Q-PAY-09 Proof of payment for the client | A | no | default (no answer yet) |
| Q-PAY-10 x402 (machine-to-machine payment) stretch | A | no | default (no answer yet) |
| Q-SOL-01 Cluster strategy for development, tests and the demo | A | no | default (no answer yet) |
| Q-SOL-02 Client library generation and exact version pins | A | yes | default (no answer yet) |
| Q-SOL-03 Credential standard for token-gated access | A | yes | default (no answer yet) |
| Q-SOL-04 Ownership verification method and freshness | A | no | default (no answer yet) |
| Q-SOL-05 On-chain anchor for attestations and the agent registry | A | yes | default (no answer yet) |
| Q-SOL-06 How Blinks will actually be shown in the demo | A | yes | default (no answer yet) |
| Q-SOL-07 Action identity, replay and attribution for Blink transactions | A | no | default (no answer yet) |
| Q-SOL-08 What the events module watches and how | A | no | default (no answer yet) |
| Q-SOL-09 Wallet linking: Sign-In-With-Solana details | A | no | default (no answer yet) |
| Q-SOL-10 The agent's own on-chain identity and agentic payments (x402) | A | no | default (no answer yet) |
| Q-TEST-01 Anchor program tests | A | no | default (no answer yet) |
| Q-TEST-02 Solana TS code: mocking strategy | A | no | default (no answer yet) |
| Q-TEST-03 Payment reconciliation tests | A | no | default (no answer yet) |
| Q-TEST-04 Blink / Actions conformance | A | no | default (no answer yet) |
| Q-TEST-05 Agent (LLM) tests | A | no | default (no answer yet) |
| Q-TEST-06 E2E of the demo path | A | no | default (no answer yet) |
| Q-TS-01 Solana client library | A | no | default (no answer yet) |
| Q-TS-02 Where the hot-wallet keypair comes from | A | no | default (no answer yet) |
| Q-TS-03 Transaction sending policy | A | no | default (no answer yet) |
| Q-TS-04 Entities (first migration) | A | no | default (no answer yet) |
| Q-TS-05 Event names | A | no | default (no answer yet) |
| Q-TS-06 Background work | A | no | default (no answer yet) |
| Q-TS-07 Validation and error style | A | no | default (no answer yet) |
| Q-TS-08 PQC library | A | no | default (no answer yet) |

Total 108 questions; 15 blocking still unanswered → **the plan is not final** until they are.
