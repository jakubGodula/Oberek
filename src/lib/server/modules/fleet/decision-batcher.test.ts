import { describe, expect, test } from 'bun:test';
import { batchPolicyFrom, DecisionBatcher, type BatchPolicy } from './decision-batcher';
import type { QueuedDecision } from './record-decision';

const AGENT = 'tick-01';
const FLUSH_MS = 20;
const policy = (overrides: Partial<BatchPolicy> = {}): BatchPolicy => ({
	agentIds: new Set([AGENT]),
	flushMs: FLUSH_MS,
	maxDecisions: 3,
	...overrides
});
const decision = (n: number): QueuedDecision => ({ submission: { kind: 'tick', decision: { n }, summary: `#${n}` }, observedAt: '' });

function recordingFlush() {
	const flushed: number[][] = [];
	const flush = async (_: string, queued: QueuedDecision[]) => {
		flushed.push(queued.map((q) => q.submission.decision.n as number));
	};
	return { flushed, flush };
}

describe('DecisionBatcher', () => {
	test('batches only the agents in the policy', () => {
		const batcher = new DecisionBatcher(policy(), recordingFlush().flush);
		expect(batcher.batches(AGENT)).toBe(true);
		expect(batcher.batches('sentinel-01')).toBe(false);
	});

	test('flushes the buffer when the timer fires', async () => {
		const { flushed, flush } = recordingFlush();
		const batcher = new DecisionBatcher(policy(), flush);
		batcher.enqueue(AGENT, decision(1));
		batcher.enqueue(AGENT, decision(2));
		expect(batcher.queued(AGENT)).toBe(2);
		await Bun.sleep(FLUSH_MS * 3);
		expect(flushed).toEqual([[1, 2]]);
		expect(batcher.queued(AGENT)).toBe(0);
	});

	test('flushes at once when the buffer is full', async () => {
		const { flushed, flush } = recordingFlush();
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), flush);
		[1, 2, 3].forEach((n) => batcher.enqueue(AGENT, decision(n)));
		await batcher.serially(AGENT, async () => undefined);
		expect(flushed).toEqual([[1, 2, 3]]);
	});

	test('runs flushes and other tasks of one agent one at a time, in order', async () => {
		const order: string[] = [];
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), async () => {
			await Bun.sleep(10);
			order.push('flush');
		});
		batcher.enqueue(AGENT, decision(1));
		const flushing = batcher.flushNow(AGENT);
		const after = batcher.serially(AGENT, async () => void order.push('step'));
		await Promise.all([flushing, after]);
		expect(order).toEqual(['flush', 'step']);
	});

	test('a refused timer flush is reported, not thrown, and the next task still runs', async () => {
		const batcher = new DecisionBatcher(policy(), async () => {
			throw new Error('agent tick-01 is killed');
		});
		batcher.enqueue(AGENT, decision(1));
		await Bun.sleep(FLUSH_MS * 3);
		expect(await batcher.serially(AGENT, async () => 'ran')).toBe('ran');
	});

	test('flushNow passes a refusal to its caller', async () => {
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), async () => {
			throw new Error('refused');
		});
		batcher.enqueue(AGENT, decision(1));
		await expect(batcher.flushNow(AGENT)).rejects.toThrow('refused');
	});
});

describe('batchPolicyFrom', () => {
	test('defaults: nobody batches, 10 s, 16 decisions', () => {
		expect(batchPolicyFrom({})).toEqual({ agentIds: new Set(), flushMs: 10_000, maxDecisions: 16 });
	});

	test('reads the comma-separated ids and the numbers', () => {
		const env = { BATCHED_AGENT_IDS: 'tick-01, fast-02', BATCH_FLUSH_MS: '2000', BATCH_MAX_DECISIONS: '8' };
		expect(batchPolicyFrom(env)).toEqual({ agentIds: new Set(['tick-01', 'fast-02']), flushMs: 2000, maxDecisions: 8 });
	});

	test('refuses a non-positive number', () => {
		expect(() => batchPolicyFrom({ BATCH_FLUSH_MS: '0' })).toThrow('BATCH_FLUSH_MS');
	});
});
