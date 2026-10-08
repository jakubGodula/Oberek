# TESTS.md — WP-07 solana_attestations
All under `apps/mercato/src/modules/solana_attestations/__tests__/`. Run: `yarn test apps/mercato/src/modules/solana_attestations`.

| # | file | proves | command |
|---|------|--------|---------|
| 1 | `pqc-crypto.service.test.ts` | keygen/sign/verify round trip (ML-DSA-44); flipped content byte → `verify` false; `commit()` deterministic for same salt+content, different salts → different hashes; `publicKeyHash` = sha3-256(pubkey). | `yarn test .../__tests__/pqc-crypto` |
| 2 | `registry-program.client.test.ts` | PDA derivation matches `["agent", id]` / `["attestation", agentPda, id]`; `registerAgent`/`commitAttestation`/`setAgentStatus` encode the IDL discriminators + args and pass through `core.sendAndConfirm` (fake). | `... registry-program.client` |
| 3 | `policy-guard.table.test.ts` | allowed tool ok; disallowed tool → `POLICY_DENIED`; lamports over cap; daily USDC sum over cap (two executed requests today); program/recipient not allow-listed; audit entry written on deny. | `... policy-guard` |
| 4 | `approval.service.test.ts` | `propose` → `proposed` + memo; `decide` approve/reject; second decide → `ALREADY_DECIDED`; `markExecuted` idempotent; events emitted once each; audit entries. | `... approval.service` |
| 5 | `execute-approved.worker.test.ts` | paused agent → `failed/AGENT_PAUSED`; `attestation` → `commitOnChain` called → `executed` with signature; `quote` → order created + payment request created (fake services); errors → `failed` with message. | `... execute-approved` |
| 6 | `attestation.service.test.ts` | `createFromAttachment` stores draft with salt/hash/signature; `verify` true for original bytes, false after modification; `commitOnChain` denied by policy → `failed`. | `... attestation.service` |
| 7 | `verify.route.test.ts` | `GET /attestations/[id]/verify` → `{ valid: true }` / `{ valid: false, reason: 'ATTESTATION_INVALID' }`; unknown id → 404. | `... verify.route` |
| 8 | `ai-tools.fake-llm.test.ts` | with a fake provider: `intake_quote` agent calls `solana.propose_quote` exactly once and never creates an order; `report_attestation` calls `solana.propose_attestation`; tools marked `isMutation`; golden conversation fixture `__tests__/fixtures/golden-intake.json`. | `... ai-tools.fake-llm` |
| 9 | (optional) `registry-program.litesvm.test.ts` | end-to-end against LiteSVM with the built program: register → commit → pause → commit fails. Skipped when `target/deploy/aegis_registry.so` is absent. | `... litesvm` |
| 10 | (manual, day 10) | register agent on devnet; propose attestation via the assistant; approve in dashboard; PDA visible in explorer; `verify` CLI prints valid. | MANUAL-TESTS.md M-07 |
