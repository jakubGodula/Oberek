import { expect, test } from 'bun:test';
import { applyShock } from './shock';

const READING = { usd: 109.43, source: 'jupiter-price-v3', observedAt: '2026-10-10T15:00:00.000Z' };

test('moves the price by the percent and keeps the real one', () => {
	expect(applyShock(READING, -3)).toEqual({
		usd: 109.43 * 0.97,
		source: 'jupiter-price-v3',
		observedAt: '2026-10-10T15:00:00.000Z',
		simulatedShock: { pct: -3, realUsd: 109.43 }
	});
});

test('moves it up for a positive percent', () => {
	expect(applyShock(READING, 10).usd).toBeCloseTo(120.373, 9);
});
