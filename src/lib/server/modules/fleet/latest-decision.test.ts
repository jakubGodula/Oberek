import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from 'pq-agent-guard';
import { Fleet, type DecisionLogEntry } from './fleet';
import { TEST_SEAL } from './testing/test-seal';
import { batchSizeOf, DecisionNotInLogError, latestDecision } from './latest-decision';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';

const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const HASH_A = 'aa'.repeat(32);
const HASH_B = 'bb'.repeat(32);

let rootDir: string;
let fleet: Fleet;

/** Only readAgent matters here: it returns an account whose lastDecision the test sets. */
function guardHolding(lastDecision: string): AgentGuard {
	const account: GuardAccount = { owner: 'owner', agentKey: 'agent-key', status: 'Active', counter: 2, lastDecision };
	const unused = async (): Promise<GuardAccount> => {
		throw new Error('not used');
	};
	return { readAgent: async () => account, recordStep: unused, recordBatch: unused, kill: unused, resume: unused };
}

function runtimeWith(guard: AgentGuard): FleetRuntime {
	return { guard, fleet, throttle: new StepThrottle(0), now: () => NOW };
}

function entry(counter: number, decisionHash: string, unconfirmed?: true): DecisionLogEntry {
	const record = {
		agent: AGENT,
		counter,
		kind: 'sentinel',
		decision: { action: 'HOLD' },
		summary: `HOLD #${counter}`,
		observedAt: NOW.toISOString()
	};
	return unconfirmed ? { record, decisionHash, unconfirmed } : { record, decisionHash };
}

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'latest-'));
	fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() }, TEST_SEAL);
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('latestDecision', () => {
	test('is null before the agent recorded any step', async () => {
		expect(await latestDecision(runtimeWith(guardHolding(NO_DECISION)), AGENT)).toBeNull();
	});

	test('returns the log entry whose hash the chain holds', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
	});

	test("after a batch, finds the batch's last decision by the root the chain holds", async () => {
		const root = 'cc'.repeat(32);
		fleet.appendDecision(AGENT, { ...entry(3, HASH_A), batch: { root, size: 2, proof: [] } });
		fleet.appendDecision(AGENT, { ...entry(3, HASH_B), batch: { root, size: 2, proof: [] } });
		expect((await latestDecision(runtimeWith(guardHolding(root)), AGENT))?.decisionHash).toBe(HASH_B);
	});

	test("a batch entry claiming a step's hash as its root does not pass for that step", async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, { ...entry(2, HASH_B), batch: { root: HASH_A, size: 1, proof: [] } });
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
	});

	test('counts an unconfirmed entry that did land', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B, true));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_B)), AGENT)).toEqual(entry(2, HASH_B, true));
	});

	test('passes over a newer unconfirmed entry that did not land', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, entry(2, HASH_B, true));
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
	});

	test('passes over a corrupt log line, e.g. one cut short by a crash mid-append', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		appendFileSync(join(rootDir, 'fleet', AGENT, 'decisions.jsonl'), '{"record":{"agent":"sentinel-01","coun\n');
		expect(await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT)).toEqual(entry(1, HASH_A));
		expect(fleet.lastDecision(AGENT)).toEqual(entry(1, HASH_A));
	});

	test('reports a chain hash that no log entry has', async () => {
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		const error = await latestDecision(runtimeWith(guardHolding(HASH_B)), AGENT).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(DecisionNotInLogError);
	});

	test('reports a chain hash as not in the log when the agent has no log at all', async () => {
		const error = await latestDecision(runtimeWith(guardHolding(HASH_A)), AGENT).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(DecisionNotInLogError);
	});

	test('refuses an agent that is not in the fleet', async () => {
		const error = await latestDecision(runtimeWith(guardHolding(NO_DECISION)), 'stranger').catch(
			(caught: unknown) => caught
		);
		expect((error as GuardError).code).toBe('AgentNotFound');
	});
});

describe('batchSizeOf', () => {
	test('is the size of the batch whose root the chain holds, null for a single step or no decision', () => {
		const root = 'cc'.repeat(32);
		fleet.appendDecision(AGENT, entry(1, HASH_A));
		fleet.appendDecision(AGENT, { ...entry(2, HASH_B), batch: { root, size: 1, proof: [] } });
		expect(batchSizeOf(fleet, AGENT, root)).toBe(1);
		expect(batchSizeOf(fleet, AGENT, HASH_A)).toBeNull();
		expect(batchSizeOf(fleet, AGENT, NO_DECISION)).toBeNull();
	});
});
