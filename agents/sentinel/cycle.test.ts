import { expect, test } from 'bun:test';
import type { LatestOutcome, RecordedDecision, RuntimeClient, Submission, SubmitOutcome } from '../shared/runtime-client';
import { runCycle } from './cycle';
import type { Policy, PriceReading } from './policy';

const POLICY: Policy = { targetSolShare: 0.5, driftThreshold: 0.0002, scheduleMinutes: 15 };
const PRICE: PriceReading = { usd: 109.43, source: 'jupiter-price-v3', observedAt: '2026-10-10T14:00:00.000Z' };
const AFTER = { sol: 956.913095129, usdc: 104715 };

function clientWith(latest: LatestOutcome, outcome: SubmitOutcome = { kind: 'recorded', counter: 5 }) {
	const submitted: Submission[] = [];
	const client: RuntimeClient = {
		latest: async () => latest,
		submit: async (submission) => {
			submitted.push(submission);
			return outcome;
		}
	};
	return { client, submitted };
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
