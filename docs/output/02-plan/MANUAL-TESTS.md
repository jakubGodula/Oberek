# MANUAL-TESTS.md — numbered manual checks for Step 4 (days 10 and 13), with expected results

Environment: public URL (`PUBLIC_BASE_URL`), devnet, Phantom in Testnet Mode with the demo customer wallet, a second
browser profile with the agency owner (operator) wallet, the admin login, the Helius dashboard open. Record results in
`04-verification/MANUAL-TEST-RESULTS.md` (pass / fail / notes / signature links).

| # | step | expected result |
|---|------|-----------------|
| MT-01 | Open `/backend/solana_core` (Settings) as admin | Cluster = devnet, hot-wallet address + SOL balance shown, program id shown, Helius webhook status "registered", last indexed slot < 2 min old |
| MT-02 | In Settings press "Create treasury ATA" for USDC | Signature shown; explorer link opens; activity feed shows the tx within 30 s |
| MT-03 | As customer, open the portal, "Link wallet", approve SIWS in Phantom | Wallet appears as linked with `verified_at`; `solana_core.wallet.linked` entry in Activity |
| MT-04 | As admin, Gates page: rule "Client Pass collection → portal section audits" exists; press "Evaluate" for the customer | Result `denied` (no pass yet) |
| MT-05 | Customer detail → "Mint Client Pass" (or `yarn mercato solana_gates mint-pass --customer <id>`) | Core asset minted (signature); DAS shows it in the customer wallet within 60 s; re-evaluate → `granted` |
| MT-06 | Customer opens `/portal/audits` | Section visible; previously it showed "Hold a Client Pass to access" |
| MT-07 | Customer orders "Re-test (8h)" (800 USDC) → checkout | QR + "Pay with wallet" shown; URL is `solana:https://…/transaction-request/<reference>`; expires in 30 min |
| MT-08 | Pay with Phantom (USDC-dev) | Phantom shows exact amount 800 USDC to the treasury; after confirmation the page flips to "Paid" within 30 s; order status paid; signature + explorer link on the order |
| MT-09 | Repeat the payment page refresh / call status twice | Status stays `confirmed`, no duplicate payment row, no duplicate activity entry |
| MT-10 | Send 1 USDC-dev manually to the treasury with the same reference (or an underpayment test request) | Request becomes `partially_paid` with shortfall; order not paid |
| MT-11 | Admin opens AI chat, agent "Intake & Quote", prompt: "Client Example Labs wants a re-test of the fixed findings next week, 8 hours" | Agent proposes a quote with the catalog item; an Approval appears in Approvals page with status `proposed`; nothing is created in sales yet |
| MT-12 | Approvals page → Approve | Status `executed`; quote/order created; audit log entry with approval id |
| MT-13 | Approvals page → "Share as Blink" on a *second* proposal (attestation of the demo report) | Two URLs copied: raw action URL and `https://www.blinks.xyz/inspector?url=…` (or dial.to form); the self-hosted `/blink/approve/<id>` page renders title, description and two buttons |
| MT-14 | Open the inspector URL with the operator wallet, press "Approve" | Phantom signs; tx confirmed; approval becomes `executed` after the memo is observed; attestation PDA created (explorer shows the account); Activity feed shows `AttestationCommitted` |
| MT-15 | Portal `/portal/audits` as customer | Attestation listed: report name, content hash, ML-DSA public-key hash, on-chain link, "Verify" button → `valid: true` |
| MT-16 | Modify one byte of the report and press Verify (or CLI `yarn mercato solana_attestations verify --id … --file tampered.pdf`) | `valid: false` with reason `CONTENT_HASH_MISMATCH` |
| MT-17 | Blink `pause` action signed by the operator wallet | `AgentStatusChanged(is_active=false)` on-chain; Settings shows agent "paused"; a new approval cannot be executed (`AGENT_PAUSED`); unpause from the dashboard (hot wallet) works; unpause via operator wallet fails |
| MT-18 | Stop the public URL (or disable the webhook) and send a payment | Polling fallback marks it paid within 60 s; health widget shows "webhook stale" |
| MT-19 | Agent policy: set `maxUsdcPerDay` to 100 and ask the agent to create a 800 USDC payment request | `POLICY_DENIED` returned and logged; no request created |
| MT-20 | `yarn generate && yarn typecheck && yarn lint && yarn test` on the integration branch; gitleaks scan | All green; no findings |
| MT-21 (optional, Q-PROD-07 B) | Mainnet smoke: 1 USDC Solana Pay to the mainnet treasury | Confirmed; recorded in FINAL-REPORT |
| MT-22 (optional, WP-12) | `yarn tsx scripts/agent-buyer.ts` | 402 challenge → payment → verify response; signature printed |

Demo storyline (Q-PROD-04 A) = MT-03 → MT-05 → MT-06 → MT-07 → MT-08 → MT-11 → MT-12 → MT-13 → MT-14 → MT-15, under 5 minutes.
