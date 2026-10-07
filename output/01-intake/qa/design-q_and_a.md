---
file: design-q_and_a.md
area: design (architecture)
task: om-solana
round: 1
owner:
status: open
---
> Architecture decisions. Facts cited from `research/01-open-mercato.md` (Open Mercato 0.8.0, commit fefc71d) and
> `research/03-source-docs-review.md`. Empty answer = default accepted. `Blocking: yes` must be answered.

## Q-DESIGN-01 — Platform: Open Mercato (Next.js) or the SvelteKit plan?
- Why it matters: `../PLAN_DZIALANIA.md` and `../PLAN_WDROZENIA.md` build a Bun + SvelteKit app from scratch; `../ARCHITECTURE.md` and the TL's brief build on Open Mercato (Next.js 16, MikroORM 7, Awilix 13, Node 24, Yarn 4). Only one of these can be true, and every package depends on it.
- Options: A) Open Mercato monorepo fork (`apps/mercato` + new modules + one `gateway-solana` package), Yarn 4, Node 24. B) Open Mercato via `npx create-mercato-app` (standalone app, modules in `src/modules/`), lighter repo, harder to upstream. C) SvelteKit as in the PLAN files, no Open Mercato (rebuild auth, tenants, CRM, orders).
- Default (used if unanswered): A
- AI recommendation: A, confidence high. C contradicts the brief and the "sellable as Open Mercato capability" goal. B is acceptable if the full monorepo build is too heavy for the team's laptops (it is large: Turborepo, ~40 packages).
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-02 — Module decomposition
- Why it matters: file ownership per work package must be disjoint; Open Mercato modules are the natural unit (`research/01-open-mercato.md` §2).
- Options:
  A) Five modules + one package:
     `solana_core` (RPC client, keypair/hot wallet, tx builder, IDL client, wallet-link + SIWS, config),
     `solana_gates` (token/NFT ownership rules → ACL features and portal access),
     `solana_events` (Helius webhook adapter + polling fallback → event bus → activity log entities),
     `solana_actions` (Actions/Blinks endpoints: approve, pause, pay),
     `solana_attestations` (Anchor-program client, PQC signing, attestation entities, agent registry),
     `packages/gateway-solana` (Solana Pay `GatewayAdapter` in the existing `payment_gateways` contract),
     plus `ai-tools.ts`/`ai-agents.ts` inside those modules for the agent skills.
  B) One big `solana` module with sub-folders.
  C) Three modules: `solana` (core+events+gates), `solana_actions`, `gateway-solana`.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium: it gives six people six disjoint owners and matches the "sell capabilities separately" pitch. B blocks parallel work; C is the fallback if the team shrinks.
- Impact if wrong: high
- Blocking: yes
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-03 — Keep PQC / ZK?
- Why it matters: it is the headline of the source docs and a key cryptographic differentiator on Solana. See `research/03-source-docs-review.md` §1 and *Baldimtsi et al. (FC 2026)* on EdDSA Dual-Mode Signatures.
- Options:
  A) **Dual-Mode Signature (DMS) & One-Time Attestation**: Keep ML-DSA-65 signing + SHA3-256 salted commitments inside `solana_attestations` ("quantum-safe attestations"); on-chain `pqc_pubkey_hash` attestation in Anchor PDA without zkVM overhead; no live ZK proof generation.
  B) A + ML-KEM-768/AES-GCM encrypted report vault (`EncryptedDataBlob`) (package `WP-11`).
  C) Full source-doc scope (zkVM proof of ML-DSA verification in SP1/RISC Zero).
  D) Drop PQC completely.
- Default (used if unanswered): A
- AI recommendation: A, confidence high; B is a stretch package (`WP-11`). Option A has strong academic backing (*Baldimtsi et al., FC 2026*) proving Solana's Ed25519 seed derivation provides ~256 bits of quantum preimage resistance, enabling clean DMS without needing heavy zkVM proofs on-chain. C is moved to post-hackathon roadmap.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-04 — Where does the on-chain "agent" identity live?
- Why it matters: the Anchor program registers an agent PDA per `agent_id`. In Open Mercato an AI agent is an `ai-agents.ts` definition per module, scoped per tenant.
- Options: A) One PDA per (tenant, agent definition), seeds `[b"agent", tenant_short_id, agent_slug]`; the server hot wallet is `owner`; operators = the tenant's admins' linked wallets. B) One PDA per tenant ("the agency"), agents are just fields in the state. C) One global PDA for the demo.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-05 — On-chain event ingestion path
- Why it matters: Open Mercato has a generic inbound-webhook package (`@open-mercato/webhooks`, `WebhookEndpointAdapter`) and the payment-gateway hub route (`payment_gateways/api/webhook/[provider]`). Helius can feed either.
- Options: A) One Helius `WebhookEndpointAdapter` in `solana_events` that normalises transactions into `solana.tx.observed` events; `gateway-solana` subscribes for payment references; attestations subscribe for program logs. Polling fallback worker shares the normaliser. B) Two separate webhooks (gateway + events). C) Polling only, no webhook.
- Default (used if unanswered): A
- AI recommendation: A, confidence high (one trust boundary, one dedup table).
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-06 — Token-gating enforcement point
- Why it matters: gating can be a *feature* (ACL) decision, a *portal* route guard, or a *catalog* visibility filter.
- Options: A) `solana_gates` evaluates rules (`holds NFT of collection X` / `holds ≥ N of mint Y`) on wallet link and on a scheduled refresh, caches the result on the customer account, and exposes `gates.check` as a service + injection widget; portal pages and catalog visibility read the cached flag. B) Live RPC check on every request. C) Gating only in the portal UI (not enforced server-side).
- Default (used if unanswered): A
- AI recommendation: A, confidence high; B is slow and rate-limited; C is not security.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-07 — Human approval mechanism for agent actions
- Why it matters: Open Mercato already has mutation approvals in the AI assistant (`prepareMutation`), a `workflows` state-machine module and `notifications`. Blinks are an *additional* approval channel.
- Options: A) One `ApprovalRequest` entity in `solana_attestations` (or a tiny `approvals` module) with states proposed → approved/rejected → executed; approvable from the dashboard (button) and from a Blink (`decision=approve`, signed by an operator wallet); the agent tool `propose_*` creates it, a worker executes after approval. B) Reuse `workflows` module state machines for the same. C) Dashboard-only approvals; Blinks only for pause.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; B if someone already knows the `workflows` module (saves UI work but adds learning time).
- Impact if wrong: high
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-08 — Repo strategy
- Why it matters: upstreaming, CI and six-branch merges.
- Options: A) Fork `open-mercato/open-mercato` at `v0.8.0`, work on `develop`-based `main` of the fork; Solana modules under `apps/mercato/src/modules/` and `packages/gateway-solana`; integration branch per TPW rules. B) Separate repo with Open Mercato as a dependency (`create-mercato-app`). C) Monorepo fork but all Solana code in one `packages/solana` package.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium; matches Q-DESIGN-01 A.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-09 — Realtime updates in the dashboard
- Why it matters: the demo's "event lands in the dashboard" moment. Open Mercato events support `clientBroadcast: true` (SSE to the browser).
- Options: A) Use `clientBroadcast` on `solana.*` events + a dashboard "Activity feed" widget that subscribes. B) Polling every 5 s in the widget. C) Manual refresh.
- Default (used if unanswered): A
- AI recommendation: A, confidence medium (verify SSE works behind the chosen hosting proxy early; fallback B).
- Impact if wrong: low
- Blocking: no
- Answer:
- Answered by / date:
- Notes:

## Q-DESIGN-10 — Use of Open Mercato skills and AGENTS.md conventions by the AI workers
- Why it matters: Open Mercato ships `AGENTS.md`, `.ai/docs/module-development.md`, `.ai/skills/om-create-ai-agent`, `om-integration-builder`, and the standalone `om-module-scaffold`. Workers that read them produce code that passes `yarn lint` (there are repo-specific ESLint "om-ds" rules).
- Options: A) Every work-package brief starts with "read AGENTS.md, .ai/docs/module-development.md and the example module"; `yarn install-skills` on day 1. B) Workers free-style.
- Default (used if unanswered): A
- AI recommendation: A, confidence high.
- Impact if wrong: medium
- Blocking: no
- Answer:
- Answered by / date:
- Notes:
