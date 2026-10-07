# DECISIONS-DRAFT.md — decisions already taken by the intake (each can be overturned by a Q&A answer)

| id | decision | reason | overturn via |
|----|----------|--------|--------------|
| D-01 | Platform = Open Mercato 0.8.0 monorepo fork (Next.js 16, MikroORM 7, Awilix 13, Node 24, Yarn 4). | Brief + ARCHITECTURE.md; the SvelteKit plan discards the platform. | Q-DESIGN-01 |
| D-02 | Six code units: `solana_core`, `solana_gates`, `solana_events`, `solana_actions`, `solana_attestations` (app modules) + `packages/gateway-solana`. | One owner per unit; matches Open Mercato seams (`payment_gateways`, `webhooks`, `ai-assistant`, `portal`). | Q-DESIGN-02 |
| D-03 | `@solana/web3.js` 1.99.x pinned exactly; Kit only inside `gateway-solana` via `@solana/pay`. | v3 flips to `latest` on 2026-10-19; peer deps of wallet-adapter/Umi/actions/anchor. | Q-SOL-02 |
| D-04 | NFT credential = Metaplex Core soulbound asset in a per-tenant collection; ownership via Helius DAS with on-chain fallback and caching. | Cheapest modern standard; DAS is the only reliable read for Core. | Q-SOL-03/04 |
| D-05 | Payments = Solana Pay transaction requests, USDC-dev primary, treasury wallet ≠ hot wallet, reconciliation idempotent on signature. | Spec-conformant, QR + wallet button + Blink from one handler. | Q-PAY-01…05 |
| D-06 | Events = one raw Helius devnet webhook through `@open-mercato/webhooks` adapter + polling fallback; webhook is a hint, RPC is truth. | Free-tier limits; Core/program events need raw payloads; existing dedup/replay machinery. | Q-SOL-08, Q-SEC-04 |
| D-07 | Blinks demoed on a self-hosted Blink page + public inspector; registry application sent day 1; no reliance on X unfurling. | X never rendered Blinks natively; registry looks frozen. | Q-SOL-06 |
| D-08 | On-chain anchor = small custom Anchor program (3 instructions, 2 PDAs, 3 events), Anchor 1.2.1. | Judged technical depth; kill-switch enforced on-chain. | Q-SOL-05, Q-RUST-01 |
| D-09 | PQC = ML-DSA-65 signatures + SHA3-256 salted commitments only; no ZK; ML-KEM vault is stretch. | Honest, small, demonstrable; ZK claim would be false. | Q-DESIGN-03, Q-SEC-07 |
| D-10 | Agents = Open Mercato `ai-tools`/`ai-agents` + MCP; two skills; every mutation via `ApprovalRequest`; single `PolicyGuard`. | Reuses the shipped assistant and approval mechanics. | Q-AGENT-01/03/05 |
| D-11 | Human approval primary in dashboard, Blink as the showcase path. | Reliability on stage. | Q-AGENT-04 |
| D-12 | Hosting = one VPS with Docker Compose + Caddy; Helius free tier; secrets in server `.env` only; gitleaks + CI. | Long-running app with workers; webhook needs a stable URL. | Q-DEVOPS-01/03/04 |
| D-13 | Testing level "Solid"; dual review on program, payments and agent runtime. | Money/keys/agents are the risk; the rest is UI. | Q-AI-06/07 |
| D-14 | Persona = Web3-security firm; demo = client journey; product name "Aegis Mercato". | Clients already hold wallets; linear 5-minute story. | Q-PROD-02/03/04 |
| D-15 | Minimum viable path if the team shrinks: WP-01 → WP-03 (core+gates) → WP-05 (payments) → WP-09 (dashboard) → WP-10 (demo). | Solo-mode requirement. | Q-AI-10 |
