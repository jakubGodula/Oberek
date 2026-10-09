# WP-11 — Stretch: ML-KEM vault for report blobs

| field | value |
|---|---|
| Package id | WP-11 |
| Branch | `feature/om-solana-wp-11-<model>-<harness>-<stamp>` |
| Worktree | `<repo>-for-ai/<model>-<stamp>` (from the integration branch, see MERGE-PLAN.md) |
| Minimum model tier | mid |
| Placement | either |
| Estimated tokens | 0.4 M |
| Estimated effort | 2 person-days (days 11–13), only if WP-07 is integrated by day 10 |
| Depends on | WP-07 (attestation entities, `PqcCryptoService`, attachments link), WP-09 (portal audits page to add a "Decrypt" action — additive, in an owned file) |
| Dual review | no (but part of the day-11 security review session if landed) |

## 1. Objective (2–4 sentences)
Add the second half of the source documents' PQC story honestly (security-q_and_a.md Q-SEC-07 option B): encrypt
report attachments with a hybrid ML-KEM-768 + AES-256-GCM scheme so that only the client's KEM key can decrypt them,
store ciphertext and KEM parameters in `solana_encrypted_blobs`, and offer a decrypt API. The demo client key is
generated in the browser and kept in `localStorage`; the brief and the pitch must state that this is a demo weakness
(no key recovery, XSS-exposed), not a product design.

## 2. Acceptance criteria covered (AC-n from 01-intake/PROBLEM.md, restated concretely)
- Extends AC-8: an attestation's report blob can be stored encrypted and decrypted only with the matching ML-KEM secret
  key; a wrong key or a flipped ciphertext byte fails authentication (AES-GCM tag) and returns `VAULT_DECRYPT_FAILED`.
- New AC-11b (stretch): `VaultService.encrypt`/`decrypt` round-trip tests pass with `@noble/post-quantum` `ml_kem768`.

## 3. Read first (exact files in the repo; nothing else)
1. `apps/mercato/src/modules/solana_attestations/services/pqc-crypto.service.ts` (WP-07) — key handling conventions.
2. `apps/mercato/src/modules/solana_attestations/data/entities.ts` (WP-07) — `SolanaAttestation` fields, `attachment_id`.
3. `packages/core/src/modules/attachments/` — how attachment bytes are read and stored (storage abstraction, `storage_s3` optional).
4. `apps/mercato/src/modules/example/data/entities.ts` and `.ai/docs/module-development.md` — entity + migration conventions (`yarn db:generate`).
5. `apps/mercato/src/modules/solana_gates/frontend/portal/AuditsPage.tsx` (WP-09) — where the "Decrypt" action is added.
6. `@noble/post-quantum` README (pinned version from WP-01's `package.json`): `ml_kem768.keygen()`, `encapsulate(publicKey)` → `{ cipherText, sharedSecret }`, `decapsulate(cipherText, secretKey)`.

## 4. Files owned (create/modify only these)
- `apps/mercato/src/modules/solana_attestations/services/vault.service.ts`
- `apps/mercato/src/modules/solana_attestations/data/vault-entities.ts` (`SolanaEncryptedBlob`) and its migration in `solana_attestations/migrations/` (generated)
- `apps/mercato/src/modules/solana_attestations/api/vault/encrypt/route.ts`, `api/vault/decrypt/[blobId]/route.ts`, `api/vault/openapi.ts`
- `apps/mercato/src/modules/solana_attestations/frontend/vault/{ClientKeyManager.tsx,DecryptButton.tsx}`
- `apps/mercato/src/modules/solana_gates/frontend/portal/AuditsVaultSection.tsx` (new file imported by WP-09's page via one added line — that one-line change must be requested in REPORT.md, not made here)
- `apps/mercato/src/modules/solana_attestations/i18n/en.json` (additive keys)
- Tests: `apps/mercato/src/modules/solana_attestations/__tests__/vault.service.test.ts`, `__tests__/vault.routes.test.ts`

## 5. Files NOT to touch (and what to write in REPORT.md instead)
- `pqc-crypto.service.ts`, `data/entities.ts`, `di.ts`, `events.ts`, `ai-tools.ts`, `ai-agents.ts`, workers, approvals and
  attestation routes (WP-07). Needed DI registration of `vaultService` → request the exact line in REPORT.md (TL adds it at integration) — or register it from `vault.service.ts` via the module's documented secondary registration if the conventions allow; cite.
- WP-09 pages (only the one-line import requested via REPORT.md).
- `apps/mercato/src/modules.ts`, root `package.json`, `.env.example`, CI, `docker-compose*.yml`.

## 6. Interfaces and contracts (exact TS signatures / routes / events this package provides and consumes)
```ts
// vault.service.ts
export interface VaultService {
  encryptForRecipient(plaintext: Uint8Array, recipientKemPublicKey: Uint8Array, meta: { attestationId: string; tenantId: string; organizationId: string }): Promise<{ blobId: string }>
  decryptWithSecret(blobId: string, recipientKemSecretKey: Uint8Array): Promise<Uint8Array>   // throws VAULT_DECRYPT_FAILED
}
// scheme: { cipherText, sharedSecret } = ml_kem768.encapsulate(pk); aesKey = HKDF-SHA256(sharedSecret, salt=blobId, info='aegis-vault-v1', 32)
//         iv = random 12 bytes; ciphertext = AES-256-GCM(aesKey, iv, plaintext, aad = attestationId); store authTag separately
```
Entity `solana_encrypted_blobs`: `id`, `tenant_id`, `organization_id`, `attestation_id`, `ciphertext_ref` (attachment id
or inline bytea if < 1 MB), `kem_ciphertext` (bytea), `iv` (bytea 12), `auth_tag` (bytea 16), `recipient_kem_pubkey_hash`
(bytea 32, SHA3-256), `created_at`, `updated_at`, `deleted_at`.
Routes: `POST /api/solana_attestations/vault/encrypt { attestationId, recipientKemPublicKey (base64) }` → `{ blobId }`
(requires `solana_attestations.manage`); `POST /api/solana_attestations/vault/decrypt/[blobId] { kemSecretKey (base64) }`
→ `application/octet-stream` (portal customer with a passing gate). Decrypt happens server-side only in this demo;
the secret key transits over TLS — state it in the honesty section (a browser-side decrypt is the product path).
Error codes: `VAULT_DECRYPT_FAILED`, `VAULT_BLOB_NOT_FOUND`, `GATE_DENIED`.

## 7. Step-by-step implementation guide (numbered, each step = one commit)
1. Worktree; `yarn install && yarn generate && yarn typecheck`.
2. `vault.service.ts` with the scheme in §6; pure functions `wrapKey`/`unwrapKey` exported for tests.
3. Entity + `yarn db:generate` migration; review the generated SQL; `yarn db:migrate` locally.
4. Encrypt route (reads the attestation's attachment bytes via the attachments module) + OpenAPI doc.
5. Decrypt route (gate check through `GatesService.evaluate` for the customer; returns bytes).
6. `ClientKeyManager.tsx`: generate `ml_kem768` keypair in the browser, store in `localStorage` under `aegis.vault.kem.v1`,
   show the public key (base64) with a copy button and a red "demo only" notice; `DecryptButton.tsx` posts the secret key and downloads the file.
7. `AuditsVaultSection.tsx` composing both; request the one-line import in REPORT.md.
8. Tests (TESTS.md); `yarn lint` clean; i18n keys.

## 8. Exact commands (setup, generate, test, lint)
```bash
corepack enable && yarn install && yarn generate
yarn db:generate && yarn db:migrate
yarn typecheck && yarn lint
yarn test apps/mercato/src/modules/solana_attestations
```

## 9. Tests to add (file names + what each proves)
See `TESTS.md` (T-11-01 … T-11-04).

## 10. Definition of done (checklist)
- [ ] Round-trip, wrong-key, tampered-ciphertext and tampered-AAD tests pass.
- [ ] Migration generated and applied; entity carries tenant/org/soft-delete columns.
- [ ] Portal decrypt works end-to-end in the day-12 rehearsal with the demo customer.
- [ ] Pitch wording delivered to WP-10 in REPORT.md: "reports are encrypted to the client's ML-KEM-768 key; the demo keeps that key in the browser, a product build would use a wallet-bound or hardware key".
- [ ] `yarn generate && yarn typecheck && yarn lint && yarn test` green; REPORT.md, STATUS.md; worktree removed.
- [ ] No AI mentions in commits.

## 11. Stop conditions (when to stop and report instead of continuing)
- WP-07 not on the integration branch by day 10 → do not start.
- Attachments module cannot stream bytes server-side within 2 hours → store inline bytea ≤ 1 MB and report.
- 2× token estimate or 3 failed Gate 0 runs.

## 12. Report (what REPORT.md must contain)
Scheme summary, entity/migration names, routes, the one-line WP-09 import request, the DI registration request,
honesty wording for the pitch, test results, tokens used.
