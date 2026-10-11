import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
	createLogSeal,
	createOwnerKemKey,
	loadLogSeal,
	loadOwnerKemKey,
	recoverDataKey,
	saveLogSeal,
	saveOwnerKemKey
} from './log-seal';

const OWNER_ONLY_MODE = 0o600;
const PERMISSION_BITS = 0o777;
let dir: string;

beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'log-seal-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const modeOf = (path: string) => statSync(path).mode & PERMISSION_BITS;

test("the owner's secret key recovers the data key the seal was made with", () => {
	const owner = createOwnerKemKey();
	const seal = createLogSeal(owner.publicKey);
	expect(seal.dataKey.length).toBe(32);
	expect(recoverDataKey(seal.kemCiphertext, owner.secretKey)).toEqual(seal.dataKey);
});

test("another owner's secret key recovers a different key", () => {
	const seal = createLogSeal(createOwnerKemKey().publicKey);
	expect(recoverDataKey(seal.kemCiphertext, createOwnerKemKey().secretKey)).not.toEqual(seal.dataKey);
});

test('each seal carries a fresh data key, even for the same owner', () => {
	const owner = createOwnerKemKey();
	expect(createLogSeal(owner.publicKey).dataKey).not.toEqual(createLogSeal(owner.publicKey).dataKey);
});

test('the owner key file round-trips, is 0600 and is never overwritten', () => {
	const path = join(dir, 'keys', 'owner-mlkem.json');
	const owner = createOwnerKemKey();
	saveOwnerKemKey(path, owner);
	expect(loadOwnerKemKey(path)).toEqual(owner);
	expect(modeOf(path)).toBe(OWNER_ONLY_MODE);
	expect(() => saveOwnerKemKey(path, createOwnerKemKey())).toThrow();
	expect(loadOwnerKemKey(path)).toEqual(owner);
});

test('the seal file round-trips, is 0600 and is never overwritten', () => {
	const path = join(dir, 'seal.json');
	const seal = createLogSeal(createOwnerKemKey().publicKey);
	saveLogSeal(path, seal);
	expect(loadLogSeal(path)).toEqual(seal);
	expect(modeOf(path)).toBe(OWNER_ONLY_MODE);
	expect(() => saveLogSeal(path, createLogSeal(createOwnerKemKey().publicKey))).toThrow();
	expect(loadLogSeal(path)).toEqual(seal);
});
