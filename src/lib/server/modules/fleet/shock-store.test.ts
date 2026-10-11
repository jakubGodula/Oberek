import { describe, expect, test } from 'bun:test';
import { parseShockPct, ShockStore } from './shock-store';

describe('ShockStore', () => {
	test('has nothing armed at first', () => {
		const store = new ShockStore();
		expect(store.isArmed('sentinel-01')).toBe(false);
		expect(store.claim('sentinel-01')).toBeNull();
	});

	test('hands an armed shock out once', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		expect(store.isArmed('sentinel-01')).toBe(true);
		expect(store.claim('sentinel-01')).toBe(-3);
		expect(store.isArmed('sentinel-01')).toBe(false);
		expect(store.claim('sentinel-01')).toBeNull();
	});

	test('replaces a shock armed earlier', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		store.arm('sentinel-01', 5);
		expect(store.claim('sentinel-01')).toBe(5);
	});

	test('keeps each agent apart', () => {
		const store = new ShockStore();
		store.arm('sentinel-01', -3);
		expect(store.claim('tick-01')).toBeNull();
		expect(store.claim('sentinel-01')).toBe(-3);
	});
});

describe('parseShockPct', () => {
	test.each([-3, 2.5, 50, -50])('accepts %p', (pct) => {
		expect(parseShockPct({ pct })).toBe(pct);
	});

	test.each([
		['zero', { pct: 0 }],
		['above 50', { pct: 50.5 }],
		['below -50', { pct: -51 }],
		['a string', { pct: '-3' }],
		['not finite', { pct: Infinity }],
		['no pct', {}],
		['no body', null]
	])('rejects %s', (_, body) => {
		expect(parseShockPct(body)).toBeNull();
	});
});
