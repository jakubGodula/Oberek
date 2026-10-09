---
file: product-q_and_a.md
area: product
task: om-solana
round: 1
owner:            # TL or whoever owns the pitch
status: open
---
> Product and pitch decisions. These shape what gets demoed and therefore which packages are MVP.
> Empty answer = default accepted. `Blocking: yes` must be answered before the plan is final.

## Q-PROD-01 — Which hackathon, deadline and judging criteria?
- Why it matters: the plan's day-14 target, the "sellable" bar and the submission artefacts (video length, repo, deck, pitch form) all depend on it. The brief only says "hackathon, 6 team, 2 weeks".
- Options: A) A Solana Foundation / Colosseum-style online hackathon (repo + 3-min video + pitch form; judged on product, technical depth, UX, business viability). B) A local/company hackathon with a live 10-minute demo in front of a jury. C) Both: online submission plus live demo.
- Default (used if unanswered): A
- AI recommendation: A, confidence low — fill in the real name, dates, tracks and criteria in `Notes:`; the plan's `MANUAL-TESTS.md` demo script is written for a 5-minute live walk-through that also works as a video. Landscape found on 2026-10-07 (research 02 §7): Colosseum Crypto World's Fair runs 2026-09-14 → 10-12 (Solana track, judged on founder-market fit, insight, execution, market size, communication, viability, traction; code must be written inside the window); Colosseum Eternal has rolling 4-week sprints; hackathons.solana.com lists an undated "Agentic Payments" hackathon; Breakpoint London is Nov 15–17. None of these matches "2 weeks from Oct 7" exactly, so the real target must be named here.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-02 — The customer persona for the demo
- Why it matters: every screen, agent skill and sample data set is built for one persona. "Small security-focused software agency" can mean several things.
- Options: A) **Pentest / audit boutique** (5–20 people) selling audits, retainers and hours; wants verifiable delivery proofs and crypto invoicing. B) **Web3 security firm** (smart-contract audits) whose clients already hold wallets; wants token-gated client portal and on-chain attestations of audit reports. C) **DevSecOps consultancy** selling monitoring subscriptions; wants recurring payments and agent-driven alerts. D) Generic "small agency"; no security angle.
- Default (used if unanswered): B
- AI recommendation: B, confidence medium, because its clients already have wallets (no onboarding friction in the demo), audit-report attestations are a natural on-chain object, and token-gated portals are a crisp NFT-gating story. A is the bigger market; mention it in the pitch as "next".
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-03 — Product name and positioning
- Why it matters: repo name, module prefix, Blink titles, deck.
- Options: A) Keep "Aegis Mercato" (from the source docs). B) "Open Mercato Solana Edition" (generic, upstream-friendly). C) New name chosen by the team by day 2.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; it is already in the docs and sounds like a security product. Module code prefix stays `solana_*` regardless.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-04 — The demo storyline (what the judge sees in 5 minutes)
- Why it matters: it fixes the MVP package list. Anything not in the story is stretch.
- Options:
  A) **Client journey**: client connects wallet → sees the gated "Audit Portal" (holds the agency's Client NFT) → orders a "Re-test (8h)" → pays USDC via Solana Pay / Blink → order lands in Open Mercato → agency agent proposes a scope → agency owner approves via Blink → attestation PDA written on-chain → client sees the signed report hash in the portal.
  B) **Agency ops journey**: owner opens dashboard → agent bot proposes renewals for retainer clients → owner approves batch → invoices + Solana Pay links generated → payments reconcile → on-chain activity feed.
  C) **Agent-first**: an external AI agent (via MCP) buys agency hours with USDC and gets a token-gated report; humans only watch.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium: it touches all five Solana capabilities in the brief (gating, payment, gateway, events, Blinks) and the agent with human approval, in one linear path. B is the fallback if payments slip.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-05 — Which two agent "skills" to sell first?
- Why it matters: `WP-07` implements exactly two agent functions end-to-end (tooling + approval + logging). More can be stubs.
- Options: A) (1) Intake & quoting: turns a client request into a scoped quote with line items from the catalog; (2) Report delivery: hashes the final report, signs it (ML-DSA), writes the attestation on-chain, notifies the client. B) (1) Retainer renewal proposals; (2) Payment reconciliation chaser (unpaid Solana Pay links). C) (1) Intake & quoting; (2) Retainer renewal.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; both fit persona B and the demo story A, and (2) reuses the PQC-signing idea from the source docs honestly.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-06 — Pricing / business model slide
- Why it matters: "sellable" is in the brief; judges ask.
- Options: A) Open-core: modules MIT, hosted "Aegis Cloud" per-tenant subscription + per-agent-action fee. B) Agency licence: flat per-agency fee + setup service (the team is itself an agency). C) Transaction fee on Solana Pay volume (0.5%).
- Default (used if unanswered): A
- AI recommendation: A + B, confidence low; keep one slide, no spreadsheet.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-07 — Mainnet claims in the pitch
- Why it matters: saying "runs on mainnet" when it was only tried on devnet is a credibility risk in front of Solana judges.
- Options: A) Devnet only; say so. B) Devnet demo + one mainnet smoke test of Solana Pay with 1 USDC on day 13. C) Mainnet demo.
- Default (used if unanswered): A
- AI recommendation: B, confidence medium, if someone has 5 USD of SOL/USDC to spare; it answers the "is it real?" question.
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-PROD-08 — Submission artefacts owner
- Why it matters: deck, video, README and the hackathon form are a package (`WP-10`) that needs a human owner from day 8.
- Options: A) TL. B) One teammate (the one with the least backend load). C) Shared, no owner.
- Default (used if unanswered): B
- AI recommendation: B, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
