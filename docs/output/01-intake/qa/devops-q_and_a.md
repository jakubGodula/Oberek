---
file: devops-q_and_a.md
area: devops
task: om-solana
round: 1
owner:
status: open
---
> Hosting, RPC, CI, secrets, toolchain. Empty answer = default accepted.

## Q-DEVOPS-01 — Public hosting for the demo
- Why it matters: Blinks (dial.to, X) and Helius webhooks need a public HTTPS URL with stable CORS; ngrok URLs change and break the Blink registry. Open Mercato needs Postgres (+ Redis if its queue uses it).
- Options: A) One small VPS (Hetzner/DO, 4 GB) with Docker Compose: app + Postgres + Redis, Caddy for TLS, a real subdomain. B) Vercel for the Next.js app + Neon/Supabase Postgres + Upstash Redis. C) ngrok/cloudflared tunnel from the TL's laptop for the whole two weeks.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium: Open Mercato is a long-running app with workers and migrations; serverless (B) adds cold-start and connection-pool surprises you do not want on demo day. C only for day 1–3.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-02 — Toolchain versions (pin on day 1)
- Why it matters: the TL's machine has Anchor 0.30.1 and Solana CLI 1.18.22 (observed 2026-10-07); current Anchor/Agave are newer and the Anchor TS client, IDL format and `anchor test` behaviour changed between 0.30 and 0.31+. Six machines with six versions will burn a day.
- Options: A) Pin to Anchor 1.2.1 (otter-sec/anchor, 2026-10-06) + Agave 4.3.0 + Rust 1.89, **Node 24** (required by Open Mercato 0.8.0; the TL has 22.6) and Yarn 4.17 via corepack; record in `rust-toolchain.toml`, `.nvmrc`, `Anchor.toml`, README. B) Keep 0.30.1 / 1.18 because they work on the TL's machine. C) Dockerise the Anchor build (one image for everyone).
- Default (used if unanswered): A
- AI recommendation: A + C for the Anchor build only, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-03 — RPC and indexing provider
- Why it matters: public devnet RPC is rate-limited and has no webhooks; Helius free tier gives RPC + webhooks + DAS (NFT ownership) in one key. Alternatives: QuickNode, Triton, Shyft.
- Options: A) Helius free tier, one shared key in the server `.env`, webhooks + DAS. B) QuickNode free tier + own polling indexer. C) Public RPC + own polling (no webhooks).
- Default (used if unanswered): A
- AI recommendation: A, confidence high. Keep a polling fallback (`getSignaturesForAddress` every 10 s) in the events module anyway, for demos without inbound connectivity.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-04 — Secrets handling
- Why it matters: a server hot wallet key, Helius key, agent-signing (ML-DSA) key, LLM API keys. Hackathon repos leak keys every year.
- Options: A) `.env` on the server only, `.env.example` in git, gitleaks pre-commit hook in the repo, keys rotated after the hackathon. B) A + Doppler/1Password CLI for sharing. C) Commit a devnet key "because it's only devnet".
- Default (used if unanswered): A
- AI recommendation: A, confidence high. Never C: the repo is the product for a security-agency audience.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-05 — CI
- Why it matters: six branches merged over two weeks; a red CI is the merge gate (Gate 0).
- Options: A) GitHub Actions: lint + typecheck + unit tests on every PR; Anchor build + tests in a separate job with cached toolchain; integration tests against a Postgres service. B) Only lint + typecheck in CI; tests locally. C) No CI.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; the Anchor job may be `continue-on-error` for the first days while the toolchain settles.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-06 — Local dev environment
- Why it matters: everyone must run Open Mercato + Postgres + a Solana cluster locally.
- Options: A) Docker Compose for Postgres/Redis; devnet for Solana (shared program id); `solana-test-validator` only for Anchor tests. B) Everything local incl. a local validator with the program pre-deployed (no devnet during development). C) No Docker; native installs.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; devnet keeps the Helius webhook path identical to the demo.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-07 — Devnet SOL and USDC supply
- Why it matters: faucets are rate-limited (roughly 5 SOL per request with hourly caps; varies); demos with 6 testers and a hot wallet can run dry. USDC-dev must be minted to test wallets.
- Options: A) One teammate collects ~20 SOL over day 1–2 into the hot wallet and keeps a `scripts/fund-wallet.ts`; USDC-dev via the Circle devnet faucet or by owning a self-minted "USDC-test" mint with the same decimals. B) Each developer airdrops ad hoc.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; also mint a self-owned demo token so the payment flow never depends on a third-party faucet.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DEVOPS-08 — Observability for the demo
- Why it matters: when a webhook does not arrive on stage you need to see why in 10 seconds.
- Options: A) Structured logs + an "Integration health" widget in the dashboard (RPC latency, last webhook, last indexed slot, hot-wallet balance). B) Logs only.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; it is also a selling point for an ops-minded persona.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
