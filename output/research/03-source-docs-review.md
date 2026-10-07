# research/03-source-docs-review.md — what the three source documents say, and where they disagree

Read on 2026-10-07: `../README.md`, `../ARCHITECTURE.md`, `../PLAN_DZIALANIA.md`, `../PLAN_WDROZENIA.md`
(all in the parent folder of `output/`). They describe "Aegis Mercato: PQC-Secured Private Agent Observability &
Action Engine on Solana".

## 1. What they agree on
| Element | Where | Keep? |
|---|---|---|
| Solana Actions / Blinks for human-in-the-loop approval and a kill-switch, testable in dial.to | all four | **Yes** — it is the most demo-able piece and the brief lists Blinks. |
| Anchor program `aegis-registry`: `AgentAccount` PDA (`seeds=[b"agent", agent_id]`), `register_agent`, `commit_private_state(root, zk_proof)`, `set_agent_status`, event `PrivateStateCommitted` | ARCHITECTURE §5.3, PLAN_* Faza 2 | **Yes, trimmed** — a 3-instruction program is realistic; rename to what the product does (attestations/agent registry). |
| Helius webhook → DB → event bus → dashboard ("agent-tracker") | all | **Yes** — maps 1:1 onto "on-chain events" in the brief. |
| PQC: ML-KEM-768 for encrypting agent data, ML-DSA-65 for signing state, SHA3-256 salted commitments, only the 32-byte root on-chain | all | **Yes** — grounded in the **Dual-Mode Signature (DMS)** framework (*Baldimtsi et al., FC 2026*), taking advantage of Solana's RFC 8032 SHA-512 seed structure. One-time attestation registers `pqc_pubkey_hash` on-chain. |
| ZK proof in a zkVM (SP1 / RISC Zero) that verifies an ML-DSA signature | ARCHITECTURE §4.3 | **Roadmap / Level 2** — the Anchor code never verifies `_zk_proof` on-chain (ignored param); a full zkVM prover is a multi-week research task. Keep the clean hash-based commitment + DMS attestation model as core deliverable. |

## 2. Where they contradict each other
| Topic | ARCHITECTURE.md / README.md | PLAN_DZIALANIA.md / PLAN_WDROZENIA.md | Resolution proposed |
|---|---|---|---|
| Application stack | Open Mercato: Next.js App Router, Awilix DI, MikroORM, Event Bus, modules under `src/modules/` | Bun + SvelteKit 2 (Svelte 5 runes) + Tailwind; "Open Mercato standard" used only as a label; modules under `src/lib/server/modules/` | **Open Mercato** (A-01). The brief is "extend Open Mercato"; a SvelteKit app is not an Open Mercato extension and throws away tenants, auth, CRM, catalog, orders, ACL, widgets. Question kept in `design-q_and_a.md` so the team can overrule. |
| Package manager / runtime | implied Node | Bun everywhere, `bun test` | Follow whatever Open Mercato uses (see `research/01-open-mercato.md`). Bun may still be used for scripts. |
| Timeline | 36–48 h | 48 h in three days | **2 weeks, 6 people** per the brief; the hour-by-hour tables are discarded. |
| Dashboard | Open Mercato admin dashboard | custom Svelte dashboard with glassmorphism | Open Mercato backend pages + widgets; styling via its design system. |
| Module paths | `src/modules/<name>/{services,controllers,entities,subscribers}` (invented, not the real OM layout) | `src/lib/server/modules/...` | Use the **real** Open Mercato module layout (see research 01). |

## 3. Technical defects in the sample code worth knowing before anyone copies it
1. `BlinkController.createActionTransaction` builds a raw `TransactionInstruction` with `data: Buffer.from(JSON.stringify(...))` and only the user as a key. An Anchor program expects an 8-byte discriminator + Borsh args and the PDA account in `keys`. Use the generated IDL client (Anchor TS or Codama) instead.
2. `declare_id!("Aeg1sRegistry1111...")` is not a valid base58 program id of the right length; `anchor keys sync` must set it.
3. `space = 8 + 32 + 64 + 32 + 32 + 1 + 8` assumes `agent_id` ≤ 60 bytes but nothing enforces it; add a `max_len` constraint (`#[max_len(32)]` with `InitSpace`).
4. `commit_private_state` takes `_zk_proof: Vec<u8>` and ignores it. Either verify something (e.g. an Ed25519 pre-instruction, or just drop the parameter) or do not call it ZK.
5. `set_agent_status` is the kill-switch but is callable only by `owner`; the Blink flow has a *social-media user* signing. Decide who may pause: owner, an `operator` list, or anyone holding a "guardian" NFT. This is a real product question (goes to `solana-q_and_a.md`).
6. The ML-DSA secret key lives in the Node process ("agent signs"). That is fine for a demo but must be stated; a KMS/HSM is out of scope.
7. Helius webhook "signature verification": Helius sends a static `Authorization` header that you configure, not a cryptographic signature. The code must compare it in constant time and additionally re-fetch the transaction by signature from RPC before trusting the payload.
8. `description` in the Blink uses Polish strings; Blinks are rendered to a global audience, keep English.

## 4. What the source documents do not cover but the brief requires
- **NFT / token ownership gating** (nothing in the four files).
- **Payment gateway / Solana Pay** (nothing).
- **AI agent bots that execute business functions** — the docs have an "agent" only as an abstract on-chain actor with a state root; no LLM, no tools, no spend limits.
- **The customer** (security agencies) and anything sellable.
- **Team split** for six people.
These gaps are why the Q&A set has `solana-`, `ai-agents-`, `product-` and `api-contract-` files.
