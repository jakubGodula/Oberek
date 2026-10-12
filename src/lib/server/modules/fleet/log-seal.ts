import { hkdfSync } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

// Keys of the sealed decision log: the owner's ML-KEM-768 key pair, and per agent a seal holding the ML-KEM capsule
// and the AES-256 data key derived from it. The server keeps the data key to read its own log; the owner recovers it
// from the capsule with the secret key.

export interface OwnerKemKey {
	publicKey: Uint8Array;
	secretKey: Uint8Array;
}

export interface LogSeal {
	/** ML-KEM-768 capsule to the owner's public key; only the owner's secret key opens it. */
	kemCiphertext: Uint8Array;
	/** AES-256-GCM key of the agent's decision log. */
	dataKey: Uint8Array;
}

const DATA_KEY_INFO = 'onchain-agent-guard:decision-log:v1';
const DATA_KEY_LENGTH = 32;
const NO_SALT = new Uint8Array(0);
const OWNER_ONLY = 0o600;

export function createOwnerKemKey(): OwnerKemKey {
	const { publicKey, secretKey } = ml_kem768.keygen();
	return { publicKey, secretKey };
}

export function createLogSeal(ownerPublicKey: Uint8Array): LogSeal {
	const { cipherText, sharedSecret } = ml_kem768.encapsulate(ownerPublicKey);
	return { kemCiphertext: cipherText, dataKey: deriveDataKey(sharedSecret) };
}

/** A wrong secret key does not throw (ML-KEM rejects implicitly): it yields a key that opens nothing. */
export function recoverDataKey(kemCiphertext: Uint8Array, ownerSecretKey: Uint8Array): Uint8Array {
	return deriveDataKey(ml_kem768.decapsulate(kemCiphertext, ownerSecretKey));
}

function deriveDataKey(sharedSecret: Uint8Array): Uint8Array {
	return new Uint8Array(hkdfSync('sha256', sharedSecret, NO_SALT, DATA_KEY_INFO, DATA_KEY_LENGTH));
}

export function saveOwnerKemKey(path: string, key: OwnerKemKey): void {
	saveSecretFile(path, { publicKey: key.publicKey, secretKey: key.secretKey });
}

export function loadOwnerKemKey(path: string): OwnerKemKey {
	const { publicKey, secretKey } = loadSecretFile(path);
	return { publicKey, secretKey };
}

export function saveLogSeal(path: string, seal: LogSeal): void {
	saveSecretFile(path, { kemCiphertext: seal.kemCiphertext, dataKey: seal.dataKey });
}

export function loadLogSeal(path: string): LogSeal {
	const { kemCiphertext, dataKey } = loadSecretFile(path);
	return { kemCiphertext, dataKey };
}

/** Owner-only and never overwritten (`wx`): replacing a key would leave everything sealed under it unreadable. */
function saveSecretFile(path: string, fields: Record<string, Uint8Array>): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = Object.fromEntries(
		Object.entries(fields).map(([name, bytes]) => [name, Buffer.from(bytes).toString('base64')])
	);
	writeFileSync(path, JSON.stringify(json, null, 2) + '\n', { mode: OWNER_ONLY, flag: 'wx' });
}

function loadSecretFile(path: string): Record<string, Uint8Array> {
	const json: Record<string, string> = JSON.parse(readFileSync(path, 'utf8'));
	return Object.fromEntries(
		Object.entries(json).map(([name, base64]) => [name, new Uint8Array(Buffer.from(base64, 'base64'))])
	);
}
