import { describe, expect, test } from 'bun:test';
import { acceptsShock, decisionHashLabel, explorerAddressUrl, explorerTxUrl, toFeedRow, toTimeline, type FeedEntry, type OperatorAction, type TimelineRow } from './fleet-feed';

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
	] as const)('a verdict %s shows as %s with the proposal trade', (verdict, chip) => {
		const row = toFeedRow(entry(8, 'approval', { verdict, proposal: { kind: 'sentinel', decision: PROPOSAL_DECISION } }), null);
		expect(row.chip).toBe(chip);
		expect(row.details?.trade?.usdc).toBe(1570.725);
	});

	test("Tick's decisions show their summary only", () => {
		const row = toFeedRow(entry(2, 'tick', { action: 'SELL', amountSol: 0.5 }), null);
		expect(row).toMatchObject({ chip: 'DECISION', summary: 'summary #2', details: null });
	});

	test('keys each row by its record hash, so two entries with one counter (an unlanded step and its retry) differ', () => {
		const unlanded = { ...entry(4, 'sentinel', { action: 'HOLD' }), decisionHash: 'aa'.repeat(32), unconfirmed: true as const };
		const retry = { ...entry(4, 'sentinel', { action: 'HOLD' }), decisionHash: 'bb'.repeat(32) };
		expect([toFeedRow(unlanded, null).key, toFeedRow(retry, null).key]).toEqual(['aa'.repeat(32), 'bb'.repeat(32)]);
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

describe('toTimeline', () => {
	const hold = (counter: number) => ({ ...entry(counter, 'sentinel', { action: 'HOLD' }), decisionHash: `hash-${counter}` });
	const action = (event: OperatorAction['event'], counter: number): OperatorAction => ({
		event,
		counter,
		signature: `sig-${event}-${counter}`,
		landedAt: 0
	});
	const labels = (rows: ReturnType<typeof toTimeline>) =>
		rows.map((row) => {
			if (row.type === 'decision') return `step ${row.row.counter}`;
			return row.type === 'batch' ? `batch ${row.counter}` : `${row.event} ${row.counter}`;
		});

	test('puts a kill right above the step whose counter it keeps, and the resume above the kill', () => {
		const rows = toTimeline([hold(8), hold(7), hold(5)], [action('AgentKilled', 5), action('AgentResumed', 6)], null);
		expect(labels(rows)).toEqual(['step 8', 'step 7', 'AgentResumed 6', 'AgentKilled 5', 'step 5']);
	});

	test("links a decision to its transaction only when the server saw it land", () => {
		const [linked, unlinked] = toTimeline([{ ...hold(6), signature: 'sig-6' }, hold(5)], [], null);
		expect(linked.type === 'decision' && linked.row.signature).toBe('sig-6');
		expect(unlinked.type === 'decision' && unlinked.row.signature).toBeNull();
	});
});

test('links a transaction to the devnet explorer', () => {
	expect(explorerTxUrl('5Kx3abc')).toBe('https://explorer.solana.com/tx/5Kx3abc?cluster=devnet');
});

test('links an account to the devnet explorer', () => {
	expect(explorerAddressUrl('CA61y1mT')).toBe('https://explorer.solana.com/address/CA61y1mT?cluster=devnet');
});

describe('batches in the timeline', () => {
	test('groups the decisions of one batch under one row, by counter among the others', () => {
		const root = 'cd'.repeat(32);
		const inBatch = (index: number): FeedEntry => ({
			record: { counter: 5, index, kind: 'tick', decision: {}, summary: `TICK ${index}`, observedAt: AT },
			decisionHash: `${index}`.padStart(64, 'e'),
			batch: { root, size: 2 },
			signature: 'sig-batch'
		});
		const single = { ...entry(6, 'tick', {}), decisionHash: 'f'.repeat(64) };
		const rows = toTimeline([single, inBatch(1), inBatch(0)], [], null);

		expect(rows.map((row) => row.type)).toEqual(['decision', 'batch']);
		const batch = rows[1] as Extract<TimelineRow, { type: 'batch' }>;
		expect(batch).toMatchObject({ key: root, counter: 5, root, size: 2, signature: 'sig-batch' });
		expect(batch.rows.map((row) => row.batch?.index)).toEqual([1, 0]);
	});

	test('a single step has no batch', () => {
		expect(toFeedRow(entry(3, 'tick', {}), null).batch).toBeNull();
	});
});

describe('decisionHashLabel', () => {
	test('names the Merkle root after a batch and the decision hash after a single step', () => {
		expect(decisionHashLabel(16)).toBe('Quantum-Safe Merkle Root (SHA-256)');
		expect(decisionHashLabel(null)).toBe('Last decision (SHA-256)');
	});
});
