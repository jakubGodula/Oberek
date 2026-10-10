import { describe, expect, test } from 'bun:test';
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

describe('after a verdict', () => {
	const BEFORE = { sol: 956.913095129, usdc: 104715, solShare: 0.492386 };
	const PROPOSED = { sol: 971.710720312, usdc: 103144.275 };
	const PROPOSED_AT = '2026-10-10T14:01:00.000Z';
	const verdictRecord = (verdict: unknown, proposal: unknown) =>
		record('approval', { verdict, proposal, decidedBy: 'ftbM…' });
	const proposal = (decision: Record<string, unknown>, kind = 'sentinel') => ({
		counter: 2,
		decisionHash: 'ab'.repeat(32),
		kind,
		decision,
		summary: 'PROPOSE'
	});
	const PROPOSAL = proposal({ before: BEFORE, after: PROPOSED, lastRebalanceAt: PROPOSED_AT });

	test('continues from the traded portfolio after an accept', () => {
		expect(previousFrom(verdictRecord('accept', PROPOSAL))).toEqual({ after: PROPOSED, lastRebalanceAt: PROPOSED_AT });
	});

	test('continues from the portfolio before the proposal after a reject, restarting the schedule', () => {
		expect(previousFrom(verdictRecord('reject', PROPOSAL))).toEqual({
			after: { sol: BEFORE.sol, usdc: BEFORE.usdc },
			lastRebalanceAt: PROPOSED_AT
		});
	});

	test.each([
		['an unknown verdict', verdictRecord('maybe', PROPOSAL), 'malformed'],
		['a missing proposal', verdictRecord('accept', undefined), 'malformed'],
		['a proposal of another agent kind', verdictRecord('accept', proposal({ after: PROPOSED, lastRebalanceAt: null }, 'tick')), 'not a sentinel decision'],
		['a rejected proposal without a sound portfolio before it', verdictRecord('reject', proposal({ after: PROPOSED, lastRebalanceAt: PROPOSED_AT })), 'malformed']
	])('refuses %s', (_, verdict, message) => {
		expect(() => previousFrom(verdict)).toThrow(message);
	});
});
