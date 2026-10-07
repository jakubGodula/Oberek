---
file: solana-q_and_a.md
area: solana (protocol, libraries, on-chain design)
task: om-solana
round: 1
owner:            # the teammate with the most Solana experience
status: open
---
> The most important file of this round. Every answer here changes code in at least two work packages.
> Facts cited from `research/02-solana-stack-2026.md` (checked 2026-10-07). Payments have their own file
> (`solana-payments-q_and_a.md`); the Anchor program has `rust-q_and_a.md`.
> Empty answer = default accepted. `Blocking: yes` must be answered before the plan is final.

## Q-SOL-01 — Cluster strategy for development, tests and the demo
- Why it matters: devnet keeps Helius webhooks and wallets identical to the demo but is rate-limited and occasionally resets; a local validator is fast and deterministic but has no webhooks and no wallet UX. Alpenglow is live on devnet already (consensus change, not API change).
- Options: A) **Devnet for everything human-facing** (shared program id, shared Helius key, shared USDC-dev), **Surfpool/LiteSVM for automated tests** (Anchor 1.x defaults to Surfpool for `anchor test`), one optional mainnet smoke of Solana Pay (Q-PROD-07). B) Localnet for all development, devnet only for the final demo week. C) Devnet only, no local validator at all.
- Default (used if unanswered): A
- AI recommendation: A, confidence high. B costs a week of "works locally, fails on devnet" surprises in week 2.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Public devnet RPC is 100 req/10 s/IP; always use the Helius devnet RPC URL from `.env`.

## Q-SOL-02 — Client library generation and exact version pins
- Why it matters: `@solana/web3.js` **v3.0.1 (Kit-based rewrite) is scheduled to become the npm `latest` tag on 2026-10-19**, in the middle of the hackathon. An unpinned `^1.x` is safe, but a fresh `npm i @solana/web3.js` on a teammate's machine after that date pulls v3. Meanwhile `@solana/pay@1.0.26` is built on `@solana/kit ^6.9`, wallet-adapter/Umi/`@solana/actions`/`@anchor-lang/core` are web3.js-v1-only, and Codama generates Kit-only clients.
- Options:
  A) **web3.js `1.99.x` pinned exactly** in `solana_core` (and everywhere else), `@solana/wallet-adapter-react@0.15.40`, Metaplex Umi 1.6 line, `@anchor-lang/core@1.2.1`; `@solana/pay` used only inside `gateway-solana` for URL building + `findReference`/`validateTransfer` with its own Kit RPC instance (no object sharing); `overrides`/`resolutions` entry in `package.json` to block v3.
  B) `@solana/kit` 8.x for all new code; web3.js v1 only where a dependency forces it, converted at the `solana_core` boundary (addresses as strings, transactions re-built).
  C) Kit everywhere, Codama-generated client for the Anchor program, `@solana/react` for wallets (peer Kit ^6/^7 — not Kit 8 yet).
- Default (used if unanswered): A
- AI recommendation: A, confidence high for two weeks. B is the "right" long-term direction and worth one note in the pitch ("migration path to Kit"), but it doubles the glue code. C is blocked by peer-dependency mismatches today.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes: Record the chosen versions in `02-plan/packages/WP-01-*/BRIEF.md` and in the repo README; CI must fail on an unexpected major.

## Q-SOL-03 — Credential standard for token-gated access
- Why it matters: "holds the agency's Client NFT" must be mintable by the agency (hot wallet), cheap, non-transferable where it is a credential, and verifiable server-side. In 2026 the options differ by cost and by how ownership is read.
- Options:
  A) **Metaplex Core** collection per tenant ("Client Pass"); assets minted by the hot wallet with the `PermanentFreezeDelegate` plugin (soulbound) and an `Attributes` plugin (`tier`, `valid_until`); ownership via Helius DAS `searchAssets({ ownerAddress, grouping: ['collection', C], interface: 'MplCoreAsset' })`.
  B) Legacy Token Metadata NFTs (pNFT) — ~7× the mint cost, more accounts, but every wallet and marketplace understands them.
  C) Compressed NFTs (Bubblegum) — cheapest at scale, needs a Merkle tree, DAS-only reads.
  D) Fungible SPL/Token-2022 balance gating only (`holds ≥ N of mint`), no NFTs.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; plus support rule type D in `solana_gates` because it is 20 lines on top of A (`getTokenBalance`) and gives a "hold 100 AGENCY tokens for the premium tier" demo. Core is also what judges expect in 2026.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes: Soulbound must be set at creation (`frozen: true, authority: { type: 'None' }`). Helius **enhanced** webhooks do not parse Core transfers — use a raw webhook on the collection address if transfer events are needed.

## Q-SOL-04 — Ownership verification method and freshness
- Why it matters: `getTokenAccountsByOwner` returns nothing for Core assets; DAS is indexed (seconds of lag, 2 RPS on the free tier); on-chain `fetchAssetsByOwner` from `mpl-core` has no lag but costs `getProgramAccounts`-style calls.
- Options: A) DAS as primary (cached per wallet in `solana_gate_results` with `checked_at`), re-check on wallet link, on a 10-minute worker, and on demand ("Re-check" button); on-chain `fetchAssetsByOwner` as fallback when DAS errors. B) On-chain reads only. C) DAS only, no cache (live on every request).
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Gate rule schema proposal: `{ type: 'core_collection' | 'token_balance' | 'any_nft_of_collection', collection?: string, mint?: string, min?: string, grantsFeature?: string, grantsPortalSection?: string }`.

## Q-SOL-05 — On-chain anchor for attestations and the agent registry
- Why it matters: this decides whether the team writes Rust at all. The source docs assume a custom Anchor program. In 2026 the **Solana Attestation Service (SAS)** is on mainnet with `@solana/attestation` and models exactly "authority attests a schema-typed record about a subject"; the Memo program is the zero-code option.
- Options:
  A) **Custom Anchor program `aegis_registry`** (3 instructions: `register_agent`, `commit_attestation`, `set_agent_status`; PDAs for agent and attestation; events). Full control, on-chain kill-switch, judges see Rust. ~3–4 person-days incl. tests + deploy.
  B) **SAS for attestations** (schema `AuditReportAttestation { content_hash, pqc_sig_hash, report_id }` under the tenant's credential), agent status kept off-chain in the DB; no Rust at all; pause via Blink becomes a signed message, not a transaction.
  C) **Memo program only**: attestation = memo `aegis:v1:<hash>` in a self-transfer; cheapest, weakest story.
  D) A + write SAS attestations as well (both).
- Default (used if unanswered): A
- AI recommendation: A, confidence medium. Choose B if nobody on the team can own Rust for a week — it is a legitimate, modern design and frees ~4 person-days. D is a stretch for day 12–13 if A lands early ("also standards-compliant").
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes: With B, `solana_attestations` keeps the same entities and API; only the "committer" service changes. Verify `@solana/attestation` devnet deployment and its web3.js/Kit dependency before choosing B (UNVERIFIED in research).

## Q-SOL-06 — How Blinks will actually be shown in the demo
- Why it matters: **X never rendered Blinks natively.** They render only through the Phantom (experimental setting "Enable Solana Actions on X.com", off by default, registry-trusted URLs only) or Backpack extensions; the Dialect registry list looks frozen since 2025-05 and the Dialect Chrome extension is reportedly gone. A demo plan of "post a tweet, it unfurls" will fail on stage.
- Options:
  A) **Own hosted Blink page** inside Open Mercato (`/blink/[kind]/[id]` using `@dialectlabs/blinks` React component or a minimal custom renderer) + the public **blinks.xyz inspector** for the "any wallet can use this URL" moment + a Phantom-with-experimental-setting attempt on X as a bonus take in the video.
  B) Rely on X unfurling (not viable).
  C) Skip Blinks; approvals only in the dashboard and the portal.
- Default (used if unanswered): A
- AI recommendation: A, confidence high. The Actions endpoints are the same in every case; only the rendering surface changes, so the engineering risk is low and the pitch still says "approve from anywhere a Blink renders".
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes: Apply for registry listing by email (hello@dialect.to) on day 1 anyway; it is free and may land before demo day.

## Q-SOL-07 — Action identity, replay and attribution for Blink transactions
- Why it matters: Blink clients replace `recentBlockhash` and reject extra signers; the server cannot pre-sign. Attribution and replay control must come from the transaction's content.
- Options: A) Every server-built transaction includes (1) a Memo with `aegis:v1:<kind>:<approvalId>`, (2) an Action Identity memo + `reference` key per the Actions spec, and (3) for program calls, the approval id as part of the PDA seed so a second execution fails on-chain; the server marks the approval `executed` only after the signature is observed on-chain and the memo matches. B) Server-side state only (mark executed on POST), no on-chain binding. C) No replay control.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes: The same memo scheme lets the activity feed attribute payments and approvals without a lookup table.

## Q-SOL-08 — What the events module watches and how
- Why it matters: Helius free tier = 5 webhooks; enhanced webhooks parse SPL transfers but not Core or custom program events; raw webhooks deliver everything and need our own parsing. Open Mercato's `@open-mercato/webhooks` package gives dedup, replay window and rate limiting for free.
- Options: A) **One raw devnet webhook** (`rawDevnet`) on: the `aegis_registry` program id, the tenant treasury wallet, the hot wallet, and the Client Pass collection address; one Helius `WebhookEndpointAdapter` normalises raw transactions into `solana_events.tx.observed`; a polling worker (`getSignaturesForAddress`, 10 s) over the same addresses fills gaps and runs when the public URL is down. B) Enhanced webhook only (misses program and Core events). C) Polling only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high. Parse Anchor events from logs with the IDL's event decoder; treat the webhook as a hint and re-fetch the transaction (`getTransaction` with `maxSupportedTransactionVersion: 1`) before emitting.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Dedup key = signature; store `slot`, `blockTime`, `source` ('helius' | 'poll').

## Q-SOL-09 — Wallet linking: Sign-In-With-Solana details
- Why it matters: gating and operator checks hang off a verified wallet ↔ user link. Phantom, Solflare and Backpack support `solana:signIn` (SIWS) through wallet-adapter; older wallets only `signMessage`.
- Options: A) SIWS (`signIn` feature) with server-issued nonce, domain, statement "Link this wallet to <tenant> in Aegis Mercato", 5-minute expiry, `signMessage` fallback with the same payload; verification via `@solana/wallet-standard-util` `verifySignIn`; store `wallet_address`, `verified_at`, `wallet_name`. B) `signMessage` only. C) Address typed by the user (no proof).
- Default (used if unanswered): A
- AI recommendation: A, confidence high. Never C.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes: One user may link several wallets; gates evaluate the union.

## Q-SOL-10 — The agent's own on-chain identity and agentic payments (x402)
- Why it matters: the pitch is "agents that sell/execute functions". In 2026 Solana pushes x402 (v2, `@x402/svm@2.28.0`, facilitators on devnet) and the Foundation's `pay.sh`; judges will ask whether our agents can pay or be paid machine-to-machine.
- Options: A) Agent identity = the on-chain `AgentAccount` PDA owned by the hot wallet (no separate agent keypair); agent *executes* only after human approval; **x402 as a stretch demo** (`WP-12`): a paid MCP tool / API route (`GET /api/solana_attestations/attestations/[id]/verify`) behind an x402 challenge so an external agent pays 0.01 USDC-dev to verify an attestation. B) Separate keypair per agent with its own policy-limited balance (true "agent wallet"), hot wallet only pays rent. C) No agentic payments; agents are internal only.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B is the better product story but adds key management for a second hot key. x402 facilitator choice (Coinbase CDP vs PayAI) is UNVERIFIED on devnet — spike for 2 hours before committing.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
