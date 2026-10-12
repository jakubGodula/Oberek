import { describe, expect, test } from 'bun:test';
import { PaceStore, parsePaceMs } from './pace-store';

describe('PaceStore', () => {
	test('has no pace for an agent until one is set, then keeps the latest', () => {
		const store = new PaceStore();
		expect(store.get('tick-01')).toBeNull();
		store.set('tick-01', 2000);
		store.set('tick-01', 500);
		expect(store.get('tick-01')).toBe(500);
		expect(store.get('sentinel-01')).toBeNull();
	});
});

describe('parsePaceMs', () => {
	test('accepts a step of the wheel', () => {
		expect(parsePaceMs({ intervalMs: 500 }, true)).toBe(500);
		expect(parsePaceMs({ intervalMs: 10_000 }, false)).toBe(10_000);
	});

	test.each([
		['a pace off the wheel', { intervalMs: 750 }, true],
		['faster than the step limit without batching', { intervalMs: 1000 }, false],
		['no number', { intervalMs: '500' }, true],
		['no body', null, true]
	])('rejects %s', (_, body, batched) => {
		expect(parsePaceMs(body, batched)).toBeNull();
	});
});
