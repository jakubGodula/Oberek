---
file: solana-payments-q_and_a.md
area: solana-payments (gateway)
task: om-solana
round: 1
owner:
status: open
---
> The payment gateway: Solana Pay inside Open Mercato's `payment_gateways` adapter contract (`GatewayAdapter`:
> `createSession/capture/refund/cancel/getStatus/verifyWebhook/mapStatus`, modelled on `packages/gateway-stripe`).
> Facts from `research/02-solana-stack-2026.md` §2. Empty answer = default accepted.

## Q-PAY-01 — Payment protocol
- Why it matters: Solana Pay has two request kinds. *Transfer request* = a URL the wallet turns into a transfer itself (QR-friendly, no server tx building, but the wallet may alter amount if omitted and we cannot add a memo with the order id reliably). *Transaction request* = the wallet calls our server (GET/POST) and we build the exact transaction (amount, mint, memo, reference, ATA creation). The same POST handler can serve as the Blink `pay` action.
- Options: A) **Transaction request as primary** (`solana:https://<host>/api/gateway_solana/transaction-request/<reference>`), encoded as QR and used by the "Pay with wallet" button and the Blink; transfer-request URL as a documented fallback. B) Transfer request only. C) x402 only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-02 — Settlement token(s)
- Why it matters: USDC on devnet exists (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, classic Token program, 6 decimals) but test wallets need to obtain it (Circle faucet); SOL is always available via airdrop; Token-2022 fee-bearing mints break `validateTransfer`.
- Options: A) USDC-dev as the default price currency, SOL accepted as an alternative at a quoted rate frozen at request creation; mainnet mapping via config (`USDC` → `EPjFW…`). B) SOL only. C) A self-minted `AGUSD` test token (we control the faucet) in addition to A.
- Default (used if unanswered): A
- AI recommendation: A + C, confidence high: C removes the "faucet is down" demo risk and costs 30 minutes.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes: Never a Token-2022 mint with transfer fees.

## Q-PAY-03 — What "paid" means
- Why it matters: reconciliation bugs are the real risk (see `testing-q_and_a.md` Q-TEST-03).
- Options: A) Paid = a transaction found by `findReference` at `confirmed` that passes `validateTransfer` (recipient ATA, mint, `post − pre ≥ amount`, reference present) and whose signature is not already used; `finalized` upgrade recorded later by the events worker; amount tolerance: exact or over (over-payment is recorded, not refunded); request expiry 30 minutes; under-payment → `partially_paid` with the shortfall shown. B) Any transfer to the treasury with the right memo. C) Exact amount only, no partial state.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-04 — Recipient (treasury) wallet and token accounts
- Why it matters: payments must not land in the server hot wallet (Q-SEC-01). The recipient's USDC **associated token account must exist** or `validateTransfer` fails.
- Options: A) Per-tenant treasury address configured in Solana settings (default: a Phantom wallet owned by the agency; Squads multisig suggested for mainnet); the hot wallet creates the treasury's ATA for each accepted mint once, at settings save time. B) Hot wallet as treasury. C) ATA created lazily inside the payment transaction (payer pays rent).
- Default (used if unanswered): A
- AI recommendation: A, confidence high; C is a reasonable extra in the transaction builder.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-05 — Detection path and idempotency
- Why it matters: two detectors (Helius webhook on the treasury address; `findReference` polling by `getStatus`) can see the same payment.
- Options: A) Single reconciliation function `reconcile(reference)` called by both paths; idempotent on `(payment_request_id, signature)`; status transitions `pending → confirmed → finalized | expired | partially_paid`; emits `gateway_solana.payment.confirmed` once; Open Mercato `GatewayTransaction` updated through the adapter's `mapStatus`. B) Webhook path only. C) Polling only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-06 — Refunds and cancellations
- Why it matters: the adapter contract has `refund` and `cancel`; crypto refunds mean the hot wallet sends funds (policy!).
- Options: A) `cancel` = mark request expired (no on-chain action); `refund` = not supported in the hackathon (adapter returns `unsupported`, UI shows "refund manually from the treasury wallet"). B) Hot-wallet-funded refunds behind an approval request. C) Full refunds from treasury (needs treasury key on the server — rejected).
- Default (used if unanswered): A
- AI recommendation: A, confidence high; B is a good stretch because it reuses the approval flow.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-07 — Mapping to the Open Mercato gateway contract
- Why it matters: `packages/gateway-stripe` is the model; judges and future users will compare.
- Options: A) `createSession(order)` → creates `gateway_solana_payment_requests` row + returns `{ url, qrPayload, reference, expiresAt }`; `getStatus` → `reconcile(reference)`; `verifyWebhook` → constant-time `Authorization` compare (Helius) + signature re-fetch; `capture` → no-op (crypto captures on confirm); `mapStatus` → the transitions in Q-PAY-05; descriptor registered via `registerPaymentGatewayDescriptor`; credentials (`treasury address`, `accepted mints`) via `integration.ts`. B) Bypass the contract with custom routes only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high — it is the single strongest "we extended Open Mercato properly" proof.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-08 — Currency setup inside Open Mercato
- Why it matters: catalog prices and orders need a currency; `currencies` module exists.
- Options: A) Add `USDC` (6 decimals) and `SOL` (9) as currencies; demo catalog priced in USDC; no fiat conversion. B) Prices in USD, converted 1:1 to USDC at request creation; SOL via a fixed demo rate. C) Live rates (Pyth/Jupiter price API) — out of scope.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B if the `currencies` module cannot handle 6/9 decimals cleanly (check on day 1).
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-09 — Proof of payment for the client
- Why it matters: the persona wants auditability.
- Options: A) Order and portal show the signature, slot, explorer link (`https://explorer.solana.com/tx/<sig>?cluster=devnet`), mint and amount; the activity feed links the payment to the order. B) Signature only.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PAY-10 — x402 (machine-to-machine payment) stretch
- Why it matters: strongest 2026 narrative for "agents buying agency functions"; facilitator availability on devnet is UNVERIFIED (Coinbase CDP: 1,000 free tx/month, `exact`+`upto`; PayAI facilitator; self-hosted Corbits/Faremeter).
- Options: A) Stretch package `WP-12`: one paid route (attestation verify) protected by `@x402/svm` middleware with the PayAI facilitator on devnet, demoed from a script/agent with `@x402/fetch`; 2-hour spike first, abandon if the facilitator does not work on devnet. B) Not in scope. C) Full x402 for all paid API routes.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
