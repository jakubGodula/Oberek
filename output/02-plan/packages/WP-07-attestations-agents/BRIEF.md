# WP-07 — `solana_attestations`: PQC-signed attestations, agent registry, approvals, PolicyGuard and the two agent skills

| field | value |
|---|---|
| Package id | WP-07 |
| Branch | `feature/om-solana-wp-07-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | strong |
| Placement | local |
| Estimated tokens | 1.2 M |
| Estimated effort | 6 person-days (days 5–10, TL + agents owner) |
| Depends on | WP-01 (skeleton, pins); WP-02 (IDL at `apps/mercato/src/modules/solana_attestations/idl/aegis_registry.json`, deployed program id in `.env`); WP-03 (`SolanaCoreService` real + fake, hot wallet, `sendAndConfirm`) |
| Dual review | yes (keys, agent execution, policy limits; Q-AI-06) |

## 1. Objective (2–4 sentences)
Build `solana_attestations`: ML-DSA-65 signing and SHA3-256 salted commitments (`PqcCryptoService`), the agent registry
mirror of the on-chain `AgentAccount`, attestation records committed on-chain through the Anchor program client, the
`ApprovalRequest` entity that every agent mutation goes through, a single `PolicyGuard`, the executor worker that runs
approved requests, and two Open Mercato AI agents (Intake & Quote, Report Attestation) exposed as `ai-tools`/`ai-agents`
and therefore through the MCP server. Humans approve from the dashboard (WP-09) or a Blink (WP-08); this package owns
the approval API they call.

## 2. Acceptance criteria covered (from 01-intake/PROBLEM.md)
- **AC-8**: `GET /api/solana_attestations/attestations/[id]/verify` returns `{ valid: true }` for a stored content hash +
  ML-DSA signature and `{ valid: false, reason }` after one byte of the content changes; the CLI does the same.
- **AC-9**: with a fake LLM, `solana.propose_quote` creates an `ApprovalRequest` (`proposed`); `POST .../approvals/[id]/decide { decision: 'approve' }`
  executes exactly once (second approve → `ALREADY_DECIDED`); a policy breach is refused with `POLICY_DENIED`; `audit_logs`
  entries exist for the proposal, the decision and the execution.
- **AC-7** consumer side: program client calls `register_agent`, `commit_attestation`, `set_agent_status` correctly (LiteSVM-backed test optional, fake-backed test required).
- Contributes to **AC-10**, **AC-11**.

## 3. Read first (exact files in the repo; nothing else)
1. `AGENTS.md` (root), `.ai/docs/module-development.md`, `.ai/skills/om-create-ai-agent/SKILL.md`
2. `packages/ai-assistant/AGENTS.md` and `apps/docs/docs/framework/ai-assistant/*.mdx` (`defineAiTool`, `defineAiAgent`, `prepareMutation`, MCP server `yarn mcp:dev`)
3. `apps/mercato/src/modules/example/{ai-tools.ts,ai-agents.ts,events.ts,subscribers/*,workers/*,api/todos/route.ts,cli.ts}` and `packages/core/src/modules/customers/ai-tools/*-pack.ts`
4. `packages/core/src/modules/audit_logs/` (how to write an audit entry from a service)
5. `packages/core/src/modules/catalog/` and `packages/core/src/modules/sales/` public services for products and order/quote creation (read the `di.ts` and `api/` folders only)
6. `apps/mercato/src/modules/solana_core/services/solana-core.service.ts` (WP-03), `docs/CONTRACTS.md` (WP-01)
7. `programs/aegis_registry/src/lib.rs` and the IDL (WP-02) — instruction names, args, PDA seeds `["agent", agent_id]`, `["attestation", agent_pda, attestation_id]`
8. `docs/research/solana-stack-2026.md` §4 (`@anchor-lang/core@1.2.1`), §8 (signing in production note)
9. `@noble/post-quantum` README (`ml_dsa65.keygen/sign/verify`)

## 4. Files owned (create/modify only these)
```
apps/mercato/src/modules/solana_attestations/index.ts, acl.ts, setup.ts, di.ts, events.ts, cli.ts, i18n/en.json
apps/mercato/src/modules/solana_attestations/idl/aegis_registry.json          # written by WP-02; read-only here
apps/mercato/src/modules/solana_attestations/data/entities.ts                 # SolanaAttestation, SolanaAgentRegistration, SolanaApprovalRequest
apps/mercato/src/modules/solana_attestations/data/validators.ts
apps/mercato/src/modules/solana_attestations/migrations/*
apps/mercato/src/modules/solana_attestations/services/pqc-crypto.service.ts
apps/mercato/src/modules/solana_attestations/services/registry-program.client.ts   # @anchor-lang/core over the IDL
apps/mercato/src/modules/solana_attestations/services/attestation.service.ts
apps/mercato/src/modules/solana_attestations/services/approval.service.ts
apps/mercato/src/modules/solana_attestations/services/policy-guard.service.ts
apps/mercato/src/modules/solana_attestations/services/agent-registry.service.ts
apps/mercato/src/modules/solana_attestations/services/audit.ts                    # thin wrapper over audit_logs
apps/mercato/src/modules/solana_attestations/workers/execute-approved.ts
apps/mercato/src/modules/solana_attestations/subscribers/pause-on-status-changed.ts
apps/mercato/src/modules/solana_attestations/api/openapi.ts
apps/mercato/src/modules/solana_attestations/api/attestations/route.ts
apps/mercato/src/modules/solana_attestations/api/attestations/[id]/verify/route.ts
apps/mercato/src/modules/solana_attestations/api/approvals/route.ts
apps/mercato/src/modules/solana_attestations/api/approvals/[id]/decide/route.ts
apps/mercato/src/modules/solana_attestations/api/agents/route.ts                  # list/register agent registrations
apps/mercato/src/modules/solana_attestations/ai-tools.ts
apps/mercato/src/modules/solana_attestations/ai-agents.ts
apps/mercato/src/modules/solana_attestations/__tests__/*.test.ts
apps/mercato/src/modules/solana_attestations/__tests__/fixtures/*
apps/mercato/src/modules/solana_attestations/README.md
```

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- Other modules (`solana_core`, `solana_gates`, `solana_events`, `solana_actions`, `packages/gateway-solana`, `packages/core/*`, `packages/ai-assistant/*`), `programs/*`.
- `apps/mercato/src/modules.ts`, root `package.json`, `.github/workflows/*`, `apps/mercato/.env.example`, `eslint.ds.config.mjs`, `docs/CONTRACTS.md`.
- Requests (env keys `PQC_DSA_SECRET`, `PQC_DSA_PUBLIC`; dependency `@noble/post-quantum` exact pin; `modules.ts` entry) → "Requests for the integrator" in `REPORT.md`.

## 6. Interfaces and contracts
Consumed: `SolanaCoreService` (Q-API-02); events `solana_events.program_log.observed` (`name: 'AgentStatusChanged'`) and `solana_events.tx.observed` (memo `aegis:v1:approve:<approvalId>` → WP-08 marks executed; this package only reacts to status changes); `gateway_solana` `PaymentRequestService.create` (WP-05) when a quote is approved — call it through the DI container by name `paymentRequestService`; if unavailable, skip and log (quote still becomes an order).

Provided:
```ts
// services/pqc-crypto.service.ts
interface PqcCryptoService {
  publicKeyHash(): Uint8Array                                  // sha3-256(ML-DSA pubkey)
  commit(content: Uint8Array): { salt: Uint8Array; contentHash: Uint8Array }   // sha3-256(salt || content)
  sign(hash: Uint8Array): Uint8Array                           // ml_dsa65.sign(secretKey, hash)
  verify(hash: Uint8Array, sig: Uint8Array, pubkey?: Uint8Array): boolean
}
// services/registry-program.client.ts  (@anchor-lang/core 1.2.1, web3.js 1.99)
interface RegistryProgramClient {
  agentPda(agentId: string): PublicKey
  attestationPda(agentPda: PublicKey, attestationId: Uint8Array /*32*/): PublicKey
  registerAgent(agentId: string, operators: PublicKey[], pqcPubkeyHash: Uint8Array): Promise<{ signature: string; agentPda: string }>
  commitAttestation(agentId: string, attestationId: Uint8Array, contentHash: Uint8Array, pqcSigHash: Uint8Array): Promise<{ signature: string; slot: number }>
  setAgentStatus(agentId: string, isActive: boolean): Promise<{ signature: string }>
  buildSetAgentStatusIx(agentId: string, isActive: boolean, signer: PublicKey): Promise<TransactionInstruction>   // used by WP-08 pause action
  buildCommitAttestationIx(...): Promise<TransactionInstruction>                                                   // used by WP-08 approve action (owner-signed path only)
  fetchAgent(agentId: string): Promise<{ owner: string; operators: string[]; isActive: boolean; attestationCount: number } | null>
}
// services/policy-guard.service.ts
type AgentPolicy = { maxLamportsPerAction: string; maxUsdcPerDay: string; allowedTools: string[]; allowedPrograms: string[]; allowedRecipients: string[] }
interface PolicyGuard { check(agentSlug: string, action: { tool: string; lamports?: bigint; usdc?: bigint; programId?: string; recipient?: string }): Promise<{ ok: true } | { ok: false; code: 'POLICY_DENIED'; reason: string }> }
// services/approval.service.ts
type ApprovalKind = 'quote' | 'attestation' | 'payment_request'
interface ApprovalService {
  propose(input: { kind: ApprovalKind; agentSlug: string; payload: Record<string, unknown>; proposedBy: string }): Promise<SolanaApprovalRequest>   // status 'proposed', memo 'aegis:v1:approve:<id>'
  decide(id: string, decision: 'approve'|'reject', by: { userId?: string; wallet?: string; via: 'dashboard'|'blink' }): Promise<SolanaApprovalRequest>
  markExecuted(id: string, signature: string): Promise<void>     // called by the worker, and by WP-08 for blink-signed memos
}
```
Routes (Q-API-01): `GET|POST /api/solana_attestations/attestations`, `GET /api/solana_attestations/attestations/[id]/verify`,
`GET /api/solana_attestations/approvals?status=`, `POST /api/solana_attestations/approvals/[id]/decide` (`{ decision }`),
`GET|POST /api/solana_attestations/agents`. All `requireAuth: true`; features `solana_attestations.view|manage|approve`.
Events (Q-TS-05): `solana_attestations.attestation.committed`, `solana_attestations.approval.requested|approved|rejected|executed`, `solana_attestations.agent.paused` — all `clientBroadcast: true`.
AI tools (Q-API-04): `solana.propose_quote` (`{ customerId, requestText }`, `isMutation: true`), `solana.propose_attestation` (`{ attachmentId, agentSlug }`, `isMutation: true`); both only create an `ApprovalRequest`, never execute.
Agents (`ai-agents.ts`, Q-AGENT-03): `intake_quote` (allowedTools: `catalog.*` read, `customers.*` read, `solana.propose_quote`, `solana.get_gate_status`) and `report_attestation` (allowedTools: `attachments.*` read, `solana.propose_attestation`, `solana.list_activity`).
Entities:
- `solana_attestations`: `id`, `tenant_id`, `organization_id`, `agent_registration_id`, `attestation_id` bytea(32), `content_hash` bytea(32), `salt` bytea(32), `pqc_signature` bytea, `pqc_sig_hash` bytea(32), `signature` text nullable, `slot` bigint nullable, `status` enum `draft|committed|failed`, `attachment_id` uuid nullable, `created_at`, `updated_at`, `deleted_at`.
- `solana_agent_registrations`: `id`, `tenant_id`, `organization_id`, `agent_slug` (unique per tenant), `agent_pda`, `operators` jsonb (string[]), `pqc_pubkey` bytea, `pqc_pubkey_hash` bytea(32), `is_active` bool, `policy` jsonb (`AgentPolicy`), `registered_signature`, timestamps.
- `solana_approval_requests`: `id`, `tenant_id`, `organization_id`, `kind`, `agent_registration_id`, `payload` jsonb, `status` enum `proposed|approved|rejected|executed|failed`, `proposed_by`, `decided_by`, `decided_via` enum `dashboard|blink` nullable, `decided_at`, `execution_signature`, `memo` (`aegis:v1:approve:<id>`), `reference` (base58 pubkey, nullable; written by WP-08's action builder for Actions-spec attribution — create the column here, leave it unused), `error`, timestamps.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. **Wiring.** `index.ts`, `acl.ts` (`view`, `manage`, `approve`), `setup.ts` (`admin: ['solana_attestations.*']`, `employee: ['solana_attestations.view']`), `events.ts`, `i18n/en.json`. `yarn generate && yarn typecheck`.
2. **Entities + migration.** Three entities as in §6; unique `(tenant_id, agent_slug)`; `yarn db:generate`, review, `yarn db:migrate`.
3. **PqcCryptoService.** `@noble/post-quantum` `ml_dsa65`; secret key from `PQC_DSA_SECRET` (base64), public from `PQC_DSA_PUBLIC`; if missing in non-production, generate once and log the **public** key only; `commit()` = 32-byte random salt, `sha3-256(salt || content)` via Node `crypto.createHash('sha3-256')`. Unit tests with known vectors (sign → verify true; flipped byte → false).
4. **Program client.** `registry-program.client.ts`: `new Program(idl, provider)` from `@anchor-lang/core` with an `AnchorProvider` wrapping `core.connection()` and a wallet adapter over `core.hotWallet()`; PDA helpers; the three methods build the instruction and send through `core.sendAndConfirm` (not Anchor's `rpc()` so the retry/priority-fee policy applies); `build*Ix` helpers for WP-08. Test with `FakeSolanaCoreService` asserting instruction data discriminators and account metas.
5. **Agent registry service.** `register(agentSlug, operators, policy)`: derive pqc pubkey hash, call `registerAgent`, store the row; `pause/unpause` via `setAgentStatus` (unpause owner-only is enforced on-chain; mirror in service). Subscriber `pause-on-status-changed.ts` on `solana_events.program_log.observed` with `name === 'AgentStatusChanged'` → update `is_active` and emit `solana_attestations.agent.paused` when false.
6. **PolicyGuard.** Loads the registration's `policy`; checks tool allow-list, per-action lamports, daily USDC sum (sum of executed `payment_request`/`quote` payloads today), program and recipient allow-lists; returns `POLICY_DENIED` with a reason; writes an audit entry on deny. Table-driven tests.
7. **ApprovalService.** `propose` (audit entry `solana.approval.proposed`), `decide` (only `proposed` → `approved|rejected`; else `ALREADY_DECIDED`; audit entry; emit `approval.approved|rejected`), `markExecuted` (only `approved` → `executed`; idempotent). Route handlers in `api/approvals/*`.
8. **AttestationService.** `createFromAttachment(attachmentId, agentSlug)`: read bytes via the `attachments` module service, `commit()`, `sign()`, store `draft`; `commitOnChain(attestationId)`: PolicyGuard check (`tool: 'solana.commit_attestation'`), `commitAttestation(...)`, set `committed` + signature/slot, emit `attestation.committed`, audit entry. `verify(id, content?)`: recompute hash from stored salt + provided/attached content, `pqc.verify`, and if committed compare `fetchAttestation` PDA `content_hash` (read via `connection.getAccountInfo` + coder) → `{ valid, onChain: { matches, signature } }`. Routes + CLI `verify --id`.
9. **Executor worker.** `workers/execute-approved.ts` `{ queue: 'solana_attestations', id: 'solana_attestations:execute-approved', concurrency: 1 }` triggered by `approval.approved`: if the agent is not `is_active` → `failed` with `AGENT_PAUSED`; `kind === 'attestation'` → `commitOnChain`; `kind === 'quote'` → create the order via the `sales` service with the payload's line items, then `paymentRequestService.create` if available; `kind === 'payment_request'` → `paymentRequestService.create`; on success `markExecuted(id, signature ?? '')`, emit `approval.executed`, audit.
10. **AI tools + agents.** `ai-tools.ts`: `solana.propose_quote` (uses `catalog` search to map request text to product ids, computes totals, calls `propose`), `solana.propose_attestation`; `ai-agents.ts` with the two `defineAiAgent` definitions, system prompts stating "you only propose; a human approves", and `prepareMutation` usage per the assistant docs. Fake-LLM tests (Q-TEST-05): tool routing, no execution without approval.
11. **CLI** `register-agent --slug --operators`, `verify --id`; `README.md`; `REPORT.md`.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install
yarn generate && yarn db:generate && yarn db:migrate
yarn mercato auth sync-role-acls && yarn mercato configs cache structural --all-tenants
yarn typecheck && yarn lint && yarn test
yarn test apps/mercato/src/modules/solana_attestations
yarn mercato solana_attestations register-agent --tenant <id> --slug aegis-ops --operators <pubkey1>,<pubkey2>
yarn mercato solana_attestations verify --id <attestationId>
yarn mcp:dev     # confirm the two tools are listed for an API key with solana_attestations.manage
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md`: pqc vectors, program client instruction encoding, policy table, approval state machine, worker branches (paused, quote, attestation), verify route true/false, fake-LLM agent routing, audit entries.

## 10. Definition of done (checklist)
- [ ] AC-8, AC-9 tests pass; gates green.
- [ ] No tool executes on-chain or money-moving actions directly; all go through `ApprovalRequest` + `PolicyGuard` + worker.
- [ ] Secret key material never logged; public key hash shown in the agents API.
- [ ] Two agents visible in the assistant UI and tools listed in `yarn mcp:dev` for an authorised key.
- [ ] Every route exports `openApi`; codes `POLICY_DENIED`, `ALREADY_DECIDED`, `AGENT_PAUSED`, `ATTESTATION_INVALID`.
- [ ] Dual review requested in `STATUS.md`; secret scan clean; no AI mentions in commits; `REPORT.md` written.

## 11. Stop conditions (when to stop and report instead of continuing)
- Token use > 2.4 M, or 3 failed gate runs on one step.
- IDL from WP-02 not available by day 6 → implement everything with a fixture IDL and a fake client; mark `commitOnChain` untested on devnet in REPORT.md.
- `ai-assistant` API differs from the docs (e.g. `defineAiAgent` signature) → follow the code, note the drift; if agents cannot be registered per module, stop and ask the TL.
- Contract change needed → REPORT.md proposal. Devnet outage > 2 h → fakes.

## 12. Report (what REPORT.md must contain)
200–300 words: files, test counts, devnet signatures of `register_agent` and one `commit_attestation`, the agent slugs and policy defaults, env/dependency/`modules.ts` requests, the exact fake-LLM golden conversation used (path), known gaps, token use.
