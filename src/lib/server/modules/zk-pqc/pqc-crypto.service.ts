import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { createHash, randomBytes } from 'crypto';

export interface PqcKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface StateCommitmentResult {
  commitmentRoot: Uint8Array;
  salt: Uint8Array;
  hexRoot: string;
}

export class PqcCryptoService {
  /**
   * Generuje parę kluczy ML-DSA-44 (Dilithium) dla agenta (NIST PQC Security Level 2)
   */
  generateDsaKeys(): PqcKeyPair {
    const keys = ml_dsa44.keygen();
    return {
      publicKey: keys.publicKey,
      secretKey: keys.secretKey
    };
  }

  /**
   * Generuje parę kluczy ML-KEM-768 (Kyber) do post-kwantowego szyfrowania danych poufnych
   */
  generateKemKeys(): PqcKeyPair {
    const keys = ml_kem768.keygen();
    return {
      publicKey: keys.publicKey,
      secretKey: keys.secretKey
    };
  }

  /**
   * Kapsułkuje klucz sesyjny dla zadanego klucza publicznego KEM-768
   */
  encapsulateSecret(peerPublicKey: Uint8Array): { cipherText: Uint8Array; sharedSecret: Uint8Array } {
    const res = ml_kem768.encapsulate(peerPublicKey);
    return {
      cipherText: res.cipherText,
      sharedSecret: res.sharedSecret
    };
  }

  /**
   * Dekapsułkuje współdzielony klucz sesyjny
   */
  decapsulateSecret(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ml_kem768.decapsulate(cipherText, secretKey);
  }

  /**
   * Oblicza solony commitment stanu z użyciem SHA3-256 (Quantum-Safe State Root)
   * Formalna definicja: Root = SHA3-256(Salt || JSON(Payload))
   */
  computeStateCommitment(privatePayload: Record<string, unknown>, existingSalt?: Uint8Array): StateCommitmentResult {
    const salt = existingSalt ?? randomBytes(32);
    const serialized = Buffer.from(JSON.stringify(privatePayload), 'utf-8');

    const hasher = createHash('sha3-256');
    hasher.update(salt);
    hasher.update(serialized);
    const commitmentRoot = hasher.digest();

    return {
      commitmentRoot: new Uint8Array(commitmentRoot),
      salt: new Uint8Array(salt),
      hexRoot: commitmentRoot.toString('hex')
    };
  }

  /**
   * Podpisuje hash stanu przy użyciu post-kwantowego podpisu cyfrowego ML-DSA-44
   */
  signState(stateHash: Uint8Array, secretKey: Uint8Array): Uint8Array {
    return ml_dsa44.sign(stateHash, secretKey);
  }

  /**
   * Weryfikuje podpis ML-DSA-44 względem hasha stanu i klucza publicznego
   */
  verifyStateSignature(stateHash: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
    return ml_dsa44.verify(signature, stateHash, publicKey);
  }

  /**
   * Oblicza 32-bajtowy skrót SHA-256 / SHA3-256 klucza publicznego ML-DSA (do kotwiczenia w PDA na Solanie)
   */
  computePubkeyHash(publicKey: Uint8Array): Uint8Array {
    const hasher = createHash('sha256');
    hasher.update(publicKey);
    return new Uint8Array(hasher.digest());
  }
}

export const pqcCrypto = new PqcCryptoService();
