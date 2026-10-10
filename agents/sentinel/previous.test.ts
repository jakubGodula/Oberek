import { expect, test } from 'bun:test';
import type { RecordedDecision } from '../shared/runtime-client';
import { previousFrom } from './previous';

const record = (kind: string, decision: Record<string, unknown>): RecordedDecision => ({
	agent: 'sentinel-01',
	counter: 3,
	kind,
	decision,
	summary: 'HOLD',
	observedAt: '2026-10-10T14:00:00.000Z'
});
const AFTER = { sol: 956.913095129, usdc: 104715 };

test('continues from the portfolio after the recorded decision', () => {
	const decision = { action: 'HOLD', after: AFTER, lastRebalanceAt: '2026-10-10T13:50:00.000Z' };
	expect(previousFrom(record('sentinel', decision))).toEqual({
		after: AFTER,
		lastRebalanceAt: '2026-10-10T13:50:00.000Z'
	});
});

test('accepts a decision made before any rebalance', () => {
	expect(previousFrom(record('sentinel', { after: AFTER, lastRebalanceAt: null })).lastRebalanceAt).toBeNull();
});

test('refuses a decision of another kind of agent', () => {
	expect(() => previousFrom(record('tick', {}))).toThrow('not a sentinel decision');
});

test.each([
	['a missing portfolio', { lastRebalanceAt: null }],
	['a negative amount', { after: { sol: -1, usdc: 100 }, lastRebalanceAt: null }],
	['an amount that is not a number', { after: { sol: '10', usdc: 100 }, lastRebalanceAt: null }],
	['a last rebalance that is not a time', { after: AFTER, lastRebalanceAt: 'yesterday' }],
	['a missing last rebalance', { after: AFTER }]
])('refuses %s', (_, decision) => {
	expect(() => previousFrom(record('sentinel', decision))).toThrow('malformed');
});
