import { expect, test } from 'bun:test';
import { randomBytes } from 'crypto';
import type { DecisionLogEntry } from './fleet';
import { isSealedLine, openLine, sealEntry, type SealedLine } from './sealed-log';

const KEY = new Uint8Array(randomBytes(32));
const ENTRY: DecisionLogEntry = {
	record: {
		agent: 'sentinel-01',
		counter: 7,
		kind: 'sentinel',
		decision: { action: 'REBALANCE', usdc: 125.5 },
		summary: 'SELL 0.5 SOL',
		observedAt: '2026-10-11T12:00:00.000Z'
	},
	decisionHash: 'ab'.repeat(32),
	unconfirmed: true
};

/** The same base64 field with one bit flipped. */
function flipped(base64: string): string {
	const bytes = Buffer.from(base64, 'base64');
	bytes[0] ^= 1;
	return bytes.toString('base64');
}

test('opens back to the same entry, unconfirmed mark included', () => {
	expect(openLine(KEY, sealEntry(KEY, ENTRY))).toEqual(ENTRY);
});

test('keeps only the counter in clear', () => {
	const line = sealEntry(KEY, ENTRY);
	expect(Object.keys(line).sort()).toEqual(['ciphertext', 'counter', 'nonce', 'tag']);
	expect(line.counter).toBe(7);
	expect(JSON.stringify(line)).not.toContain('REBALANCE');
	expect(JSON.stringify(line)).not.toContain(ENTRY.decisionHash);
});

test('a fresh nonce per line: the same entry seals differently twice', () => {
	expect(sealEntry(KEY, ENTRY).ciphertext).not.toBe(sealEntry(KEY, ENTRY).ciphertext);
});

test('refuses another key', () => {
	expect(() => openLine(new Uint8Array(randomBytes(32)), sealEntry(KEY, ENTRY))).toThrow();
});

test('refuses a line moved to another counter', () => {
	const line: SealedLine = { ...sealEntry(KEY, ENTRY), counter: 8 };
	expect(() => openLine(KEY, line)).toThrow();
});

test('refuses a flipped ciphertext, tag or nonce', () => {
	const line = sealEntry(KEY, ENTRY);
	for (const field of ['ciphertext', 'tag', 'nonce'] as const) {
		expect(() => openLine(KEY, { ...line, [field]: flipped(line[field]) })).toThrow();
	}
});

test('tells a sealed line from a legacy plaintext entry', () => {
	expect(isSealedLine(sealEntry(KEY, ENTRY))).toBe(true);
	expect(isSealedLine(ENTRY)).toBe(false);
});
