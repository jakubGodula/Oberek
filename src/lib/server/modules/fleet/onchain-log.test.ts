import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { LandedTransaction } from '../agent-guard/guard';
import { APPROVAL_KIND } from './approval';
import { Fleet } from './fleet';
import { describeTransactions, OnchainLog } from './onchain-log';

const SENTINEL = 'sentinel-01';
const TICK = 'tick-01';
const NOW = 1_000;

const kill = (agentId: string, counter: number): LandedTransaction => ({
	agentId,
	event: 'AgentKilled',
	counter,
	signature: `sig-${agentId}-${counter}`
});

const step = (counter: number, decisionHash: string): LandedTransaction => ({
	agentId: SENTINEL,
	event: 'StepRecorded',
	counter,
	signature: `sig-${counter}`,
	decisionHash
});

describe('OnchainLog', () => {
	test('lists the newest transactions first, at most the limit, stamped when they landed', () => {
		let now = NOW;
		const log = new OnchainLog(() => now++);
		[1, 2, 3].forEach((counter) => log.record(kill(SENTINEL, counter)));
		expect(log.recent(2)).toEqual([
			{ ...kill(SENTINEL, 3), landedAt: NOW + 2 },
			{ ...kill(SENTINEL, 2), landedAt: NOW + 1 }
		]);
	});

	test("lists one agent's transactions", () => {
		const log = new OnchainLog(() => NOW);
		[kill(SENTINEL, 1), kill(TICK, 1), kill(SENTINEL, 2)].forEach((transaction) => log.record(transaction));
		expect(log.recent(10, TICK).map((entry) => entry.agentId)).toEqual([TICK]);
	});

	test('drops the oldest transactions beyond its capacity', () => {
		const log = new OnchainLog(() => NOW, 2);
		[1, 2, 3].forEach((counter) => log.record(kill(SENTINEL, counter)));
		expect(log.recent(10).map((entry) => entry.counter)).toEqual([3, 2]);
	});
});

describe('describeTransactions', () => {
	let rootDir: string;
	let fleet: Fleet;

	beforeEach(() => {
		rootDir = mkdtempSync(join(tmpdir(), 'onchain-log-'));
		fleet = new Fleet(join(rootDir, 'fleet'));
		fleet.register({ id: SENTINEL, name: 'Sentinel Alpha', riskLevel: 'MEDIUM', registeredAt: 0 });
	});

	afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

	function logDecision(counter: number, kind: string, decision: Record<string, unknown>, summary: string): string {
		const decisionHash = String(counter).padStart(64, '0');
		const record = { agent: SENTINEL, counter, kind, decision, summary, observedAt: '2026-10-10T15:00:00.000Z' };
		fleet.appendDecision(SENTINEL, { record, decisionHash });
		return decisionHash;
	}

	test("names the agent and adds a step's summary from the decision log", () => {
		const hash = logDecision(5, 'sentinel', { action: 'HOLD' }, 'HOLD: SOL 142.10');
		const [item] = describeTransactions([{ ...step(5, hash), landedAt: NOW }], fleet);
		expect(item).toEqual({
			id: 'sig-5',
			agentId: SENTINEL,
			agentName: 'Sentinel Alpha',
			event: 'StepRecorded',
			counter: 5,
			signature: 'sig-5',
			decisionHash: hash,
			landedAt: NOW,
			summary: 'HOLD: SOL 142.10'
		});
	});

	test("marks a step that records the owner's verdict", () => {
		const hash = logDecision(6, APPROVAL_KIND, { verdict: 'reject' }, 'REJECTED: sell 1 SOL');
		const [item] = describeTransactions([{ ...step(6, hash), landedAt: NOW }], fleet);
		expect(item).toMatchObject({ verdict: 'reject', summary: 'REJECTED: sell 1 SOL' });
	});

	test('leaves out the summary of a step the decision log does not hold, and names an unknown agent by its id', () => {
		const [stepItem, killItem] = describeTransactions(
			[
				{ ...step(7, 'ff'.repeat(32)), landedAt: NOW },
				{ ...kill(TICK, 3), landedAt: NOW }
			],
			fleet
		);
		expect(stepItem.summary).toBeUndefined();
		expect(killItem.agentName).toBe(TICK);
	});
});
