---
file: security-q_and_a.md
area: security
task: om-solana
round: 1
owner:
status: open
---
> Security decisions and constraints the plan must respect. This workflow does not audit the code; see
> `ai-and-budget-q_and_a.md` Q-AI-08 for the separate audit session. Empty answer = default accepted.

## Q-SEC-01 — Server hot wallet: what may it do?
- Why it matters: the backend needs a keypair to pay fees for attestations, mint client NFTs, and act as the agent's on-chain identity. A hot wallet that can also *move customer funds* is a different risk class.
- Options: A) Hot wallet pays rent/fees and signs program instructions only; it never holds customer USDC (payments go directly to the agency's treasury wallet, which is a hardware or Phantom wallet outside the server). B) Hot wallet is also the treasury (simplest). C) No server keypair: every on-chain write is user-signed via Blink/wallet adapter.
- Default (used if unanswered): A
- AI recommendation: A, confidence high. C is cleaner but kills the "agent writes attestation" story.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-02 — Who may trigger the kill-switch / pause on-chain?
- Why it matters: the source docs put `set_agent_status` behind `has_one = owner`, yet the Blink is meant for anyone on X. If anyone can pause, it is a DoS; if only the owner can, the Blink only works for one wallet.
- Options: A) Owner + an on-chain `operators: Vec<Pubkey>` (max 5) set at registration; the Blink shows the pause button but the tx fails for others (and the GET response hides it when `account` is not an operator, via the `/api/actions?account=` query). B) Anyone holding the agency's "Guardian" NFT (checked in the program via token account). C) Owner only.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B is a nice NFT-gating demo but needs an extra account in the instruction and a Metaplex Core ownership check in Rust, which is more Rust than the plan budgets.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-03 — Wallet-based login (Sign-In-With-Solana) vs. existing Open Mercato auth
- Why it matters: token gating needs to know the user's wallet. Replacing Open Mercato's auth is risky; linking a wallet to an existing user is not.
- Options: A) Keep Open Mercato auth; add "Link wallet" (SIWS message signed in the browser, nonce stored server-side, 5-minute expiry) and store `wallet_address` + `verified_at` on the user/customer. B) Full SIWS login as an additional auth provider. C) Trust a wallet address typed by the user (no signature).
- Default (used if unanswered): A
- AI recommendation: A, confidence high. Never C.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-04 — Webhook authentication and trust
- Why it matters: the Helius webhook carries a static `Authorization` header you choose; it is not a signature. A forged POST could mark an order paid.
- Options: A) Constant-time header compare **and** re-fetch every transaction by signature from RPC before acting (webhook = hint, RPC = truth); idempotency key = signature. B) Header compare only. C) Trust the body.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; it also makes the polling fallback share the same code path.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-05 — Agent spend and action limits
- Why it matters: an AI agent with a hot wallet and tools is the headline risk for the persona.
- Options: A) Policy object per agent: max SOL/USDC per action and per day, allow-listed tools, allow-listed program ids and recipients; any on-chain or money-moving action requires a human approval record (dashboard or Blink) before execution; everything logged. B) Approval only, no numeric limits. C) Limits only, no approval.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-06 — Replay and tampering protection for Blink POSTs
- Why it matters: the POST returns an unsigned transaction built by the server; the client may alter the URL params (`decision=approve` → other agent id). The on-chain program is the real guard, but the server should not build transactions for inconsistent states.
- Options: A) Server validates params against DB state, embeds a short-lived server-side intent id (memo or PDA seed) and uses a fresh blockhash; program enforces authorisation. B) No server-side validation; rely on the program.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-07 — Post-quantum claims
- Why it matters: `ARCHITECTURE.md` promises ML-KEM/ML-DSA and ZK. Over-claiming to a security audience backfires. ML-DSA signatures cannot be verified on-chain by Solana natively (no precompile), so the on-chain part can only be a hash commitment plus an Ed25519 signature.
- Options: A) Honest scope: audit-report attestations are hashed (SHA3-256, salted) and signed off-chain with ML-DSA-65; the hash + the ML-DSA public-key hash are stored in the attestation PDA; verification is off-chain via an API and a CLI, and the pitch says exactly that ("quantum-safe signature, on-chain commitment"). B) Also encrypt report blobs with ML-KEM-768 + AES-GCM in a vault entity. C) Drop PQC entirely. D) Keep the zkVM story.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; B only if the Rust and payments packages finish early. D is rejected (see `research/03-source-docs-review.md`).
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-08 — Secrets in the repo and CI
- Why it matters: standard, but it is the one gate this workflow enforces.
- Options: A) gitleaks pre-commit + CI job; `.env.example` only; keys rotated at the end. B) CI only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-09 — Multi-tenancy boundary for Solana data
- Why it matters: Open Mercato is multi-tenant; wallets, program ids and hot wallets must be scoped per tenant/organization or the product cannot be sold as SaaS.
- Options: A) All Solana entities carry `tenant_id`/`organization_id` like other Open Mercato entities; one hot wallet per tenant (encrypted at rest with an app key); RPC config per tenant with a global default. B) Global single-tenant config for the hackathon; tenant columns added but unused.
- Default (used if unanswered): B
- AI recommendation: B, confidence medium: columns present (cheap now), per-tenant wallets later.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-SEC-10 — Dependency and supply-chain hygiene
- Why it matters: `@solana/web3.js` had a supply-chain incident in late 2024; a security-agency product must show pinned versions and audits.
- Options: A) Pinned exact versions, lockfile committed, `npm audit`/`cargo audit` in CI, Dependabot off during the hackathon. B) Caret ranges.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
