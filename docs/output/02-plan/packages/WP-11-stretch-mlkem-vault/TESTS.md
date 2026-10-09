# TESTS.md — WP-11

| # | file | proves | command |
|---|------|--------|---------|
| T-11-01 | `apps/mercato/src/modules/solana_attestations/__tests__/vault.service.test.ts` | encrypt → decrypt round-trip returns the plaintext; `recipient_kem_pubkey_hash` equals SHA3-256 of the public key. | `yarn test apps/mercato/src/modules/solana_attestations` |
| T-11-02 | same file | wrong KEM secret key → `VAULT_DECRYPT_FAILED`; flipped ciphertext byte → `VAULT_DECRYPT_FAILED`; changed AAD (other attestationId) → `VAULT_DECRYPT_FAILED`. | same |
| T-11-03 | `apps/mercato/src/modules/solana_attestations/__tests__/vault.routes.test.ts` | encrypt route requires `solana_attestations.manage`; decrypt route returns 403 `GATE_DENIED` for a customer without a passing gate (FakeSolanaCoreService), 200 octet-stream otherwise. | same |
| T-11-04 | manual (day-12 rehearsal) | Portal: generate key → agency encrypts report → client decrypts and opens the PDF. | record in `MANUAL-TEST-RESULTS.md` |
