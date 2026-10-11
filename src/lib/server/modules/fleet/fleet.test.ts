import { afterEach, beforeEach, expect, test } from 'bun:test';
import { appendFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Fleet, type DecisionLogEntry, type LoggedTransaction } from './fleet';

const AGENT = 'sentinel-01';
let rootDir: string;
let fleet: Fleet;

function entry(counter: number, unconfirmed?: true): DecisionLogEntry {
	const record = {
		agent: AGENT,
		counter,
		kind: 'sentinel',
		decision: { action: 'HOLD' },
		summary: `HOLD #${counter}`,
		observedAt: '2026-10-10T15:00:00.000Z'
	};
	const decisionHash = String(counter).padStart(64, '0');
	return unconfirmed ? { record, decisionHash, unconfirmed } : { record, decisionHash };
}

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'fleet-'));
	fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: 0 });
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

test('lists the newest decisions first, at most the limit', () => {
	[1, 2, 3].forEach((counter) => fleet.appendDecision(AGENT, entry(counter)));
	expect(fleet.recentDecisions(AGENT, 2)).toEqual([entry(3), entry(2)]);
});

test('keeps the unconfirmed mark', () => {
	fleet.appendDecision(AGENT, entry(1, true));
	expect(fleet.recentDecisions(AGENT, 10)).toEqual([entry(1, true)]);
});

test('is empty before the first decision', () => {
	expect(fleet.recentDecisions(AGENT, 10)).toEqual([]);
});

const kill = (counter: number): LoggedTransaction => ({
	agentId: AGENT,
	event: 'AgentKilled',
	counter,
	signature: `sig-${counter}`,
	landedAt: counter
});

test("keeps the agent's landed transactions, oldest first, in a file that outlives the server", () => {
	[1, 2].forEach((counter) => fleet.appendTransaction(kill(counter)));
	expect(new Fleet(join(rootDir, 'fleet')).transactions(AGENT)).toEqual([kill(1), kill(2)]);
});

test('has no transactions before the first one lands', () => {
	expect(fleet.transactions(AGENT)).toEqual([]);
});

test('passes over a transaction line cut short by a crash', () => {
	fleet.appendTransaction(kill(1));
	appendFileSync(join(rootDir, 'fleet', AGENT, 'transactions.jsonl'), '{"agentId":\n');
	fleet.appendTransaction(kill(2));
	expect(fleet.transactions(AGENT)).toEqual([kill(1), kill(2)]);
});
