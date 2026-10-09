# TASK.md — Open Mercato × Solana (hackathon, 6 people, 2 weeks)

- Task id: `om-solana`
- Title: `open-mercato-solana-hackathon`
- Written: 2026-10-07 (restated from the team lead's brief and the three source documents in the parent folder)
- Sharing mode: folder (this `output/` folder is shared with the team)

## 1. One-line idea
Extend **Open Mercato** (open-source, modular Next.js/MikroORM ERP-CRM platform) with a **Solana integration layer** and
**AI agent bots**, and package the result as something a **small, security-focused software agency** can actually sell
and run: on-chain events, NFT/token-gated access, a payment gateway, Solana Actions/Blinks, and agent bots that execute
a few business functions under human control.

## 2. Why (from the team lead)
- Open Mercato already gives the boring 80%: tenants, users, roles, customers, catalog, orders, dashboards, API, CLI,
  event bus, custom fields. Nobody in a hackathon should rebuild that.
- Solana gives cheap, fast settlement, NFTs as credentials, and Blinks as a distribution channel inside social media.
- Small security agencies (pentest shops, audit boutiques, DevSecOps consultancies) sell retainers, audits, hours and
  training. They are crypto-curious, security-literate, and small enough that a modular monolith fits them. They are the
  customer persona for the demo and the pitch.
- AI agents sell themselves right now, but only if the human stays in control. Agents in this product propose, humans
  approve (via dashboard or a Blink), and every step is logged and, where it matters, anchored on-chain.

## 3. Source documents (read-only inputs)
- `../README.md`, `../ARCHITECTURE.md` — "Aegis Mercato" architecture: Open Mercato modules `solana-blink`,
  `agent-tracker`, `zk-pqc`, `private-vault`; Anchor program `aegis-registry` (agent PDA, state-root commits,
  kill-switch); PQC (ML-KEM-768 / ML-DSA-44) and ZK ideas; 48-hour schedule.
- `../PLAN_DZIALANIA.md`, `../PLAN_WDROZENIA.md` — a step-by-step plan for the same idea but on a different stack
  (Bun + SvelteKit + Tailwind, no Open Mercato). These two documents contradict `ARCHITECTURE.md` on the stack and are
  written for a 48-hour solo build, not a 6-person, 2-week build. The intake must reconcile this.

## 4. What must exist at the end (team lead's bar)
1. A fork or plugin set of Open Mercato running locally and on one public URL, with Solana modules installed.
2. A live demo on **devnet** that a judge can follow in under 5 minutes:
   wallet login → token-gated area → buy something with Solana Pay (USDC) → order appears in Open Mercato →
   on-chain event lands in the activity log → an AI agent proposes an action → human approves via a Blink → result on-chain and in the dashboard.
3. Something sellable to a security agency: a clear persona, a pricing idea, and at least two agent "skills" that map
   to real agency work (e.g. intake and quoting, audit-report delivery with on-chain proof, retainer renewals).
4. Pitch deck, 2–3 minute video, README with a 10-minute local setup.

## 5. Constraints
- 6 people, 2 calendar weeks, mixed AI licences (one strong model licence on the TL, cheaper models elsewhere).
- Must stay within Open Mercato conventions (modules, DI, event bus, API routes, widgets) so the work could be
  upstreamed or sold as a plugin later.
- Devnet only; no real funds; no custody of customer keys beyond one server-side hot wallet for demo flows.
- Everything in English in the repo; Polish allowed in internal chat.

## 6. Open points the TL wants the team to settle (go to Q&A)
- Keep or drop the PQC/ZK ambition from the source documents.
- Which of the five Solana capabilities (events, NFT gating, gateway, payments, Blinks) are MVP and which are stretch.
- Which AI-agent functions to sell first, and how human approval works.
- Hosting, RPC provider, wallets, test strategy, and who does what with which model.
