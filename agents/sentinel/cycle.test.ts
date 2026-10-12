import { expect, test } from 'bun:test';
import type {
	LatestOutcome,
	RecordedDecision,
	RuntimeClient,
	ShockOutcome,
	Submission,
	SubmitOutcome
} from '../shared/runtime-client';
import { runCycle } from './cycle';
import type { Policy, PriceReading } from './policy';

/** approvalShare 1: never a proposal, so the original cycle tests keep their lines. */
const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15, approvalShare: 1 };
const DEMO_POLICY: Policy = { ...POLICY, approvalShare: 0.0025 };
const PRICE: PriceReading = { usd: 109.43, source: 'jupiter-price-v3', observedAt: '2026-10-10T14:00:00.000Z' };
const AFTER = { sol: 956.913095129, usdc: 104715 };

function clientWith(
	latest: LatestOutcome,
	outcome: SubmitOutcome = { kind: 'recorded', counter: 5 },
	shock: ShockOutcome = { kind: 'none' }
) {
	const submitted: Submission[] = [];
	const calls = { claimShock: 0 };
	const client: RuntimeClient = {
		latest: async () => latest,
		pace: async () => null,
		submit: async (submission) => {
			submitted.push(submission);
			return outcome;
		},
		claimShock: async () => {
			calls.claimShock += 1;
			return shock;
		}
	};
	return { client, submitted, calls };
}

const sentinelRecord = (decision: Record<string, unknown>): RecordedDecision => ({
	agent: 'sentinel-01',
	counter: 4,
	kind: 'sentinel',
	decision,
	summary: 'x',
	observedAt: PRICE.observedAt
});

const priceOf = (reading: PriceReading) => async () => reading;

test('submits the first decision from the initial holdings', async () => {
	const { client, submitted } = clientWith({ kind: 'none' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toHaveLength(1);
	expect(submitted[0].kind).toBe('sentinel');
	expect(submitted[0].decision).toMatchObject({ action: 'REBALANCE', before: { sol: 1000, usdc: 100000 } });
	expect(submitted[0].summary).toBe('REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%)');
	expect(line).toBe('REBALANCE (drift): sell 43.087 SOL @ $109.43 (SOL 52.25% → 50.00%) → recorded #5');
});

test('continues from the portfolio of the recorded decision', async () => {
	const { client, submitted } = clientWith({
		kind: 'found',
		record: sentinelRecord({ after: AFTER, lastRebalanceAt: PRICE.observedAt })
	});
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted[0].decision).toMatchObject({ action: 'HOLD', before: AFTER });
});

test('skips the cycle when the last decision is unavailable, without submitting', async () => {
	const { client, submitted } = clientWith({ kind: 'failed', reason: 'HTTP 409: not in its log' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toBe('skipped: last decision unavailable (HTTP 409: not in its log)');
});

test('skips the cycle when the recorded decision is not one Sentinel can continue from', async () => {
	const { client, submitted } = clientWith({ kind: 'found', record: { ...sentinelRecord({}), kind: 'tick' } });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toStartWith('skipped: ');
});

test('skips the cycle when the price is unavailable, without submitting', async () => {
	const { client, submitted } = clientWith({ kind: 'none' });
	const failingPrice = async (): Promise<PriceReading> => {
		throw new Error('Jupiter price API answered HTTP 503');
	};
	const line = await runCycle({ client, fetchPrice: failingPrice, policy: POLICY });
	expect(submitted).toEqual([]);
	expect(line).toBe('skipped: price unavailable (Jupiter price API answered HTTP 503)');
});

test('reports a decision refused while the agent is killed', async () => {
	const { client } = clientWith({ kind: 'none' }, { kind: 'paused' });
	expect(await runCycle({ client, fetchPrice: priceOf(PRICE), policy: POLICY })).toEndWith(
		'→ refused: the owner killed the agent'
	);
});

const balanced = () => ({ kind: 'found' as const, record: sentinelRecord({ after: AFTER, lastRebalanceAt: PRICE.observedAt }) });

test('waits while its proposal waits for a verdict: no shock claim, no price, no submission', async () => {
	const pending = { kind: 'found' as const, record: { ...sentinelRecord({}), requiresApproval: true as const } };
	const { client, submitted, calls } = clientWith(pending);
	let priceFetched = false;
	const fetchPrice = async () => {
		priceFetched = true;
		return PRICE;
	};
	expect(await runCycle({ client, fetchPrice, policy: DEMO_POLICY })).toBe('waiting for approval (#4)');
	expect(submitted).toEqual([]);
	expect(calls.claimShock).toBe(0);
	expect(priceFetched).toBe(false);
});

test('decides at the shocked price, keeping the real one, and submits a proposal when the trade is large', async () => {
	const { client, submitted } = clientWith(balanced(), undefined, { kind: 'armed', pct: -3 });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].requiresApproval).toBe(true);
	expect(submitted[0].decision).toMatchObject({
		approval: 'required',
		price: { usd: 109.43 * 0.97, simulatedShock: { pct: -3, realUsd: 109.43 } }
	});
	expect(line).toBe(
		'PROPOSE (drift, needs approval): buy 14.798 SOL @ $106.15 (SOL 49.24% → 50.00%) [simulated shock -3%] → recorded #5'
	);
});

test('submits an ordinary decision without the approval flag', async () => {
	const { client, submitted } = clientWith(balanced());
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect('requiresApproval' in submitted[0]).toBe(false);
});

test('goes on at the real price when the shock claim fails, noting it', async () => {
	const { client, submitted } = clientWith(balanced(), undefined, { kind: 'failed', reason: 'HTTP 502: down' });
	const line = await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].decision).toMatchObject({ action: 'HOLD', price: PRICE });
	expect(line).toEndWith('→ recorded #5 (shock claim failed: HTTP 502: down)');
});

test('continues from the traded portfolio after an accepted proposal', async () => {
	const proposed = { sol: 971.710720312, usdc: 103144.275 };
	const verdict: RecordedDecision = {
		...sentinelRecord({}),
		kind: 'approval',
		decision: {
			verdict: 'accept',
			proposal: { kind: 'sentinel', decision: { before: AFTER, after: proposed, lastRebalanceAt: PRICE.observedAt } },
			decidedBy: 'ftbM…'
		}
	};
	const { client, submitted } = clientWith({ kind: 'found', record: verdict });
	await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY });
	expect(submitted[0].decision).toMatchObject({ before: proposed });
});

test('reports a decision refused while waiting for approval', async () => {
	const { client } = clientWith(balanced(), { kind: 'awaiting' });
	expect(await runCycle({ client, fetchPrice: priceOf(PRICE), policy: DEMO_POLICY })).toEndWith(
		'→ refused: waiting for approval'
	);
});
