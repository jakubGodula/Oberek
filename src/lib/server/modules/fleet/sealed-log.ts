import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { DecisionLogEntry } from './fleet';

// One decision log line, sealed with AES-256-GCM under the agent's data key. Only the counter stays in clear; it is
// the additional authenticated data, so a line moved to another counter does not open.

export interface SealedLine {
	counter: number;
	nonce: string;
	ciphertext: string;
	tag: string;
}

const CIPHER = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const COUNTER_LENGTH = 8;

export function sealEntry(dataKey: Uint8Array, entry: DecisionLogEntry): SealedLine {
	const counter = entry.record.counter;
	const nonce = randomBytes(NONCE_LENGTH);
	const cipher = createCipheriv(CIPHER, dataKey, nonce, { authTagLength: TAG_LENGTH });
	cipher.setAAD(counterBytes(counter));
	const ciphertext = Buffer.concat([cipher.update(JSON.stringify(entry), 'utf8'), cipher.final()]);
	return { counter, nonce: base64(nonce), ciphertext: base64(ciphertext), tag: base64(cipher.getAuthTag()) };
}

/** Throws when the line was not sealed with this key and counter, or was changed since. */
export function openLine(dataKey: Uint8Array, line: SealedLine): DecisionLogEntry {
	const decipher = createDecipheriv(CIPHER, dataKey, fromBase64(line.nonce), { authTagLength: TAG_LENGTH });
	decipher.setAAD(counterBytes(line.counter));
	decipher.setAuthTag(fromBase64(line.tag));
	const plaintext = Buffer.concat([decipher.update(fromBase64(line.ciphertext)), decipher.final()]);
	return JSON.parse(plaintext.toString('utf8'));
}

/** Legacy plaintext entries have no ciphertext. */
export function isSealedLine(value: unknown): value is SealedLine {
	return typeof value === 'object' && value !== null && 'ciphertext' in value;
}

function counterBytes(counter: number): Buffer {
	const bytes = Buffer.alloc(COUNTER_LENGTH);
	bytes.writeBigUInt64LE(BigInt(counter));
	return bytes;
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const fromBase64 = (text: string) => Buffer.from(text, 'base64');
