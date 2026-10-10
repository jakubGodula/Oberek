import { describe, expect, test } from 'bun:test';
import { acceptsShock, toFeedRow, type FeedEntry } from './fleet-feed';

const AT = '2026-10-10T15:00:00.000Z';
const BEFORE = { sol: 956.913095129, usdc: 104715, solShare: 0.492386 };
const PROPOSED = { sol: 971.710720312, usdc: 103144.275 };
const TRADE = { side: 'BUY', sol: 14.797625183, usdc: 1570.725 };
const SHOCKED_PRICE = { usd: 106.1471, source: 'jupiter-price-v3', observedAt: AT, simulatedShock: { pct: -3, realUsd: 109.43 } };
const PROPOSAL_DECISION = { action: 'REBALANCE', reason: 'drift', approval: 'required', price: SHOCKED_PRICE, before: BEFORE, trade: TRADE, after: PROPOSED };

const entry = (counter: number, kind: string, decision: Record<string, unknown>, extra: object = {}): FeedEntry => ({
	record: { counter, kind, decision, summary: `summary #${counter}`, observedAt: AT, ...extra },
	decisionHash: 'ab'.repeat(32)
});

describe('toFeedRow', () => {
	test('a hold: grey chip, price and share, no trade', () => {
		const hold = entry(3, 'sentinel', { action: 'HOLD', price: { usd: 109.7 }, before: { ...PROPOSED, solShare: 0.4999 }, after: PROPOSED });
		expect(toFeedRow(hold, null)).toMatchObject({
			counter: 3,
			chip: 'HOLD',
			summary: 'summary #3',
			unconfirmed: false,
			details: { priceUsd: 109.7, shockPct: null, solShareBefore: 0.4999, trade: null }
		});
	});

	test('the waiting proposal: amber chip, its trade, the shock and the share after', () => {
		const row = toFeedRow(entry(7, 'sentinel', PROPOSAL_DECISION, { requiresApproval: true }), 7);
		expect(row.chip).toBe('AWAITING_APPROVAL');
		expect(row.details).toMatchObject({ priceUsd: 106.1471, shockPct: -3, trade: { side: 'BUY', sol: 14.797625183, usdc: 1570.725 } });
		expect(row.details!.solShareAfter).toBeCloseTo(0.5, 6);
	});

	test('a proposal already decided is just a proposal', () => {
		expect(toFeedRow(entry(7, 'sentinel', PROPOSAL_DECISION, { requiresApproval: true }), null).chip).toBe('PROPOSAL');
	});

	test.each([
		['accept', 'APPROVED'],
		['reject', 'REJECTED']
	])('a verdict %s shows as %s with the proposal trade', (verdict, chip) => {
		const row = toFeedRow(entry(8, 'approval', { verdict, proposal: { kind: 'sentinel', decision: PROPOSAL_DECISION } }), null);
		expect(row.chip).toBe(chip);
		expect(row.details?.trade?.usdc).toBe(1570.725);
	});

	test("Tick's decisions show their summary only", () => {
		const row = toFeedRow(entry(2, 'tick', { action: 'SELL', amountSol: 0.5 }), null);
		expect(row).toMatchObject({ chip: 'DECISION', summary: 'summary #2', details: null });
	});

	test('keeps the unconfirmed mark', () => {
		expect(toFeedRow({ ...entry(4, 'sentinel', { action: 'HOLD' }), unconfirmed: true }, null).unconfirmed).toBe(true);
	});

	test('a decision without a sound price or portfolio has no details', () => {
		const broken = entry(5, 'sentinel', { action: 'HOLD', price: { usd: '109' }, before: BEFORE, after: PROPOSED });
		expect(toFeedRow(broken, null).details).toBeNull();
	});
});

describe('acceptsShock', () => {
	test.each([
		['sentinel', true],
		['approval', true],
		['tick', false],
		[null, false]
	])('%p → %p', (kind, expected) => {
		expect(acceptsShock(kind)).toBe(expected);
	});
});
