import { describe, expect, test } from 'bun:test';
import { decide, INITIAL_PORTFOLIO, summarize, type Policy, type PriceReading } from './policy';

const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 };
const T0 = '2026-10-10T14:00:00.000Z';
const BALANCED = { sol: 956.913095129, usdc: 104715 };

const price = (usd: number, observedAt = T0): PriceReading => ({ usd, source: 'jupiter-price-v3', observedAt });
const minutesAfterT0 = (minutes: number, seconds = 0) =>
	new Date(Date.parse(T0) + (minutes * 60 + seconds) * 1000).toISOString();
const totalValue = ({ sol, usdc }: { sol: number; usdc: number }, usd: number) => sol * usd + usdc;

describe('decide', () => {
	test('starts from the initial holdings and sells back to the target when SOL drifted above it', () => {
		const decision = decide(null, price(109.43), POLICY);
		expect(decision).toEqual({
			action: 'REBALANCE',
			reason: 'drift',
			price: price(109.43),
			policy: POLICY,
			before: { ...INITIAL_PORTFOLIO, solShare: 0.522513 },
			trade: { side: 'SELL', sol: 43.086904871, usdc: 4715 },
			after: { sol: 956.913095129, usdc: 104715 },
			lastRebalanceAt: T0
		});
	});

	test('buys back to the target when SOL drifted below it, keeping the total value', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const decision = decide(previous, price(108, minutesAfterT0(1)), POLICY);
		expect(decision.action).toBe('REBALANCE');
		expect(decision.reason).toBe('drift');
		expect(decision.trade).toEqual({ side: 'BUY', sol: 6.335119102, usdc: 684.192863 });
		expect(decision.after).toEqual({ sol: 963.248214231, usdc: 104030.807137 });
		expect(Math.abs(totalValue(decision.after, 108) - totalValue(BALANCED, 108))).toBeLessThan(0.000001);
	});

	test('holds within the band and carries the last rebalance forward', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const decision = decide(previous, price(109.44, minutesAfterT0(1)), POLICY);
		expect(decision).toEqual({
			action: 'HOLD',
			price: price(109.44, minutesAfterT0(1)),
			policy: POLICY,
			before: { ...BALANCED, solShare: 0.500023 },
			after: BALANCED,
			lastRebalanceAt: T0
		});
	});

	test('rebalances on schedule within the band once the schedule is due', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		const due = decide(previous, price(109.44, minutesAfterT0(15)), POLICY);
		expect(due.action).toBe('REBALANCE');
		expect(due.reason).toBe('schedule');
		expect(due.trade).toEqual({ side: 'SELL', sol: 0.043718617, usdc: 4.784565 });
		expect(due.lastRebalanceAt).toBe(minutesAfterT0(15));
	});

	test('holds within the band one second before the schedule is due', () => {
		const previous = { after: BALANCED, lastRebalanceAt: T0 };
		expect(decide(previous, price(109.44, minutesAfterT0(14, 59)), POLICY).action).toBe('HOLD');
	});

	test('holds when the trade to the target rounds to nothing, even with the schedule due', () => {
		const onTarget = { after: { sol: 1000, usdc: 109430 }, lastRebalanceAt: null };
		const decision = decide(onTarget, price(109.43), POLICY);
		expect(decision.action).toBe('HOLD');
		expect(decision.trade).toBeUndefined();
		expect(decision.lastRebalanceAt).toBeNull();
	});
});

describe('summarize', () => {
	test('describes a rebalance with its reason, trade, price and shares', () => {
		expect(summarize(decide(null, price(109.43), POLICY))).toBe(
			'REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%)'
		);
	});

	test('describes a buy', () => {
		const decision = decide({ after: BALANCED, lastRebalanceAt: T0 }, price(108, minutesAfterT0(1)), POLICY);
		expect(summarize(decision)).toBe('REBALANCE (drift): buy 6.335 SOL @ $108.00 (SOL 49.67% → 50.00%)');
	});

	test('describes a hold with the band', () => {
		const decision = decide({ after: BALANCED, lastRebalanceAt: T0 }, price(109.44, minutesAfterT0(1)), POLICY);
		expect(summarize(decision)).toBe('HOLD @ $109.44 (SOL 50.00%, band ±0.02 pp)');
	});
});
