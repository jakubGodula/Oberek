import { describe, expect, test } from 'bun:test';
import { FakeGuard } from '../agent-guard/fake-guard';
import { chainFrom, createFleetRuntime } from './runtime';

describe('chainFrom', () => {
	test('defaults to the fake chain', () => {
		expect(chainFrom({})).toBe('fake');
	});

	test('accepts devnet', () => {
		expect(chainFrom({ CHAIN: 'devnet' })).toBe('devnet');
	});

	test('rejects anything else', () => {
		expect(() => chainFrom({ CHAIN: 'mainnet' })).toThrow('CHAIN must be "fake" or "devnet"');
	});
});

describe('createFleetRuntime', () => {
	test('uses the fake guard on the fake chain, without any Solana settings', async () => {
		const runtime = await createFleetRuntime({ CHAIN: 'fake' });
		expect(runtime.chain).toBe('fake');
		expect(runtime.guard).toBeInstanceOf(FakeGuard);
	});

	test('needs the program and keys on devnet', async () => {
		await expect(createFleetRuntime({ CHAIN: 'devnet' })).rejects.toThrow('GUARD_PROGRAM_ID is not set');
	});
});
