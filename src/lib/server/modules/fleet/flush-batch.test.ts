import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, type AgentGuard } from '../agent-guard/guard';
import { Fleet } from './fleet';
import { merkleRoot, verifyProof } from './merkle';
import { AwaitingApprovalError } from './approval';
import { flushBatch, hashDecisionRecord, recordDecision, type QueuedDecision } from './record-decision';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';
import { TEST_SEAL } from './testing/test-seal';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const AGENT = 'tick-01';
const NOW = new Date('2026-10-11T12:00:00.000Z');
const queued = (n: number): QueuedDecision => ({
	submission: { kind: 'tick', decision: { n }, summary: `TICK ${n}` },
	observedAt: new Date(NOW.getTime() + n).toISOString()
});

let rootDir: string;
let runtime: FleetRuntime;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'flush-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Tick', riskLevel: 'LOW', registeredAt: NOW.getTime() }, TEST_SEAL);
	runtime = { guard: new MemoryGuard(AGENT, OWNER), fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('flushBatch', () => {
	test('records the batch as one step under the Merkle root and logs every decision with its proof', async () => {
		const entries = await flushBatch(runtime, AGENT, [queued(0), queued(1), queued(2)]);

		const root = merkleRoot(entries.map((entry) => entry.decisionHash));
		expect(await runtime.guard.readAgent(AGENT)).toMatchObject({ counter: 1, lastDecision: root });
		expect(runtime.fleet.decisions(AGENT)).toEqual(entries);
		entries.forEach((entry, index) => {
			const { submission, observedAt } = queued(index);
			expect(entry.record).toEqual({ agent: AGENT, counter: 1, index, ...submission, observedAt });
			expect(entry.decisionHash).toBe(hashDecisionRecord(entry.record));
			expect(entry.batch).toMatchObject({ root, size: 3 });
			expect(verifyProof(entry.decisionHash, entry.batch!.proof, root)).toBe(true);
		});
	});

	test('refuses to flush while a proposal waits for the verdict, and logs nothing', async () => {
		const proposal = { kind: 'tick', decision: {}, summary: 'PROPOSE', requiresApproval: true as const };
		await recordDecision(runtime, AGENT, await runtime.guard.readAgent(AGENT), proposal);
		const error = await flushBatch(runtime, AGENT, [queued(0)]).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(AwaitingApprovalError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(1);
		expect(runtime.fleet.decisions(AGENT)).toHaveLength(1);
	});

	test('records a lone decision as a single step, as without batching, with the time it was submitted', async () => {
		const [entry] = await flushBatch(runtime, AGENT, [queued(4)]);

		expect(entry.batch).toBeUndefined();
		expect(entry.record).toEqual({ agent: AGENT, counter: 1, ...queued(4).submission, observedAt: queued(4).observedAt });
		expect(await runtime.guard.readAgent(AGENT)).toMatchObject({ counter: 1, lastDecision: entry.decisionHash });
		expect(runtime.fleet.decisions(AGENT)).toEqual([entry]);
	});

	test('does nothing for an empty buffer', async () => {
		expect(await flushBatch(runtime, AGENT, [])).toEqual([]);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(0);
	});

	test('logs nothing when the guard refuses the batch', async () => {
		await runtime.guard.kill(AGENT, OWNER);
		const error = await flushBatch(runtime, AGENT, [queued(0)]).catch((caught: unknown) => caught);
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(runtime.fleet.decisions(AGENT)).toEqual([]);
	});

	test('logs the decisions as unconfirmed when the guard fails without a verdict', async () => {
		const timingOut: AgentGuard = {
			...runtime.guard,
			readAgent: (agentId) => runtime.guard.readAgent(agentId),
			recordBatch: async () => {
				throw new Error('confirmation timed out');
			}
		};
		const error = await flushBatch({ ...runtime, guard: timingOut }, AGENT, [queued(0), queued(1)]).catch((caught) => caught);
		expect((error as Error).message).toBe('confirmation timed out');
		expect(runtime.fleet.decisions(AGENT).map((entry) => entry.unconfirmed)).toEqual([true, true]);
	});
});
