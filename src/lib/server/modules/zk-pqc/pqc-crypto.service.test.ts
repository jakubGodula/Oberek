import { describe, it, expect } from 'bun:test';
import { pqcCrypto } from './pqc-crypto.service';

describe('PqcCryptoService - NIST PQC Verification', () => {
  it('powinien wygenerować klucze ML-DSA-44 i poprawnie podpisać oraz zweryfikować hash stanu', () => {
    const keys = pqcCrypto.generateDsaKeys();
    expect(keys.publicKey).toBeDefined();
    expect(keys.secretKey).toBeDefined();

    const payload = {
      action: 'APPROVE_TRADE',
      pair: 'SOL/USDC',
      amount: 15.5,
      nonce: 1042
    };

    const commitment = pqcCrypto.computeStateCommitment(payload);
    expect(commitment.commitmentRoot.length).toBe(32);
    expect(commitment.hexRoot.length).toBe(64);

    const signature = pqcCrypto.signState(commitment.commitmentRoot, keys.secretKey);
    expect(signature.length).toBeGreaterThan(1000); // ML-DSA-44 ma sygnaturę ~2420 bajtów

    const isValid = pqcCrypto.verifyStateSignature(commitment.commitmentRoot, signature, keys.publicKey);
    expect(isValid).toBe(true);

    // Modyfikacja jednego bajtu w hashu
    const tamperedRoot = new Uint8Array(commitment.commitmentRoot);
    tamperedRoot[0] ^= 0xff;
    const isTamperedValid = pqcCrypto.verifyStateSignature(tamperedRoot, signature, keys.publicKey);
    expect(isTamperedValid).toBe(false);
  });

  it('powinien kapsułkować i dekapsułkować sekret za pomocą ML-KEM-768', () => {
    const kemKeys = pqcCrypto.generateKemKeys();
    const enc = pqcCrypto.encapsulateSecret(kemKeys.publicKey);
    expect(enc.cipherText.length).toBeGreaterThan(1000);
    expect(enc.sharedSecret.length).toBe(32);

    const decryptedSecret = pqcCrypto.decapsulateSecret(enc.cipherText, kemKeys.secretKey);
    expect(Buffer.from(decryptedSecret).equals(Buffer.from(enc.sharedSecret))).toBe(true);
  });

  it('powinien obliczać deterministyczny 32-bajtowy skrót klucza publicznego dla on-chain PDA', () => {
    const keys = pqcCrypto.generateDsaKeys();
    const hash = pqcCrypto.computePubkeyHash(keys.publicKey);
    expect(hash.length).toBe(32);
  });
});
