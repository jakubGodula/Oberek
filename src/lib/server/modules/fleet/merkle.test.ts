import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { merkleProof, merkleRoot, verifyProof } from './merkle';

const hashOf = (n: number) => createHash('sha256').update(String(n)).digest('hex');
const hashes = (count: number) => Array.from({ length: count }, (_, n) => hashOf(n));
const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest('hex');
const leaf = (hash: string) => sha256(Buffer.from([0]), Buffer.from(hash, 'hex'));
const node = (left: string, right: string) => sha256(Buffer.from([1]), Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

describe('merkleRoot', () => {
	test('of one decision is its leaf, not the bare hash', () => {
		expect(merkleRoot([hashOf(0)])).toBe(leaf(hashOf(0)));
		expect(merkleRoot([hashOf(0)])).not.toBe(hashOf(0));
	});

	test('of three moves the odd leaf up unchanged', () => {
		const [a, b, c] = hashes(3);
		expect(merkleRoot([a, b, c])).toBe(node(node(leaf(a), leaf(b)), leaf(c)));
	});

	test('differs when the order of decisions differs', () => {
		const [a, b] = hashes(2);
		expect(merkleRoot([a, b])).not.toBe(merkleRoot([b, a]));
	});

	test('refuses an empty batch', () => {
		expect(() => merkleRoot([])).toThrow(RangeError);
	});
});

describe('merkleProof', () => {
	test.each([1, 2, 3, 5, 16, 17])('every decision of %i proves against the root', (count) => {
		const all = hashes(count);
		const root = merkleRoot(all);
		all.forEach((hash, index) => {
			expect(verifyProof(hash, merkleProof(all, index), root)).toBe(true);
		});
	});

	test('a proof does not hold for another decision or another root', () => {
		const all = hashes(5);
		const proof = merkleProof(all, 2);
		expect(verifyProof(all[3], proof, merkleRoot(all))).toBe(false);
		expect(verifyProof(all[2], proof, merkleRoot(hashes(6)))).toBe(false);
	});

	test('a proof cut short does not hold', () => {
		const all = hashes(8);
		expect(verifyProof(all[0], merkleProof(all, 0).slice(0, -1), merkleRoot(all))).toBe(false);
	});

	test('refuses an index outside the batch', () => {
		expect(() => merkleProof(hashes(3), 3)).toThrow(RangeError);
	});
});
