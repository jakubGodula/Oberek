import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Fleet, type DecisionLogEntry, type LoggedTransaction } from './fleet';
import { isSealedLine } from './sealed-log';
import { TEST_SEAL } from './testing/test-seal';

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
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: 0 }, TEST_SEAL);
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

const decisionLogPath = () => join(rootDir, 'fleet', AGENT, 'decisions.jsonl');
const legacyLine = (counter: number) => JSON.stringify(entry(counter)) + '\n';

test('writes no decision in clear', () => {
	fleet.appendDecision(AGENT, entry(1));
	const lines = readFileSync(decisionLogPath(), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
	expect(lines.every(isSealedLine)).toBe(true);
	expect(readFileSync(decisionLogPath(), 'utf8')).not.toContain('HOLD');
});

test('reads back what an earlier instance sealed, as after a restart', () => {
	[1, 2].forEach((counter) => fleet.appendDecision(AGENT, entry(counter)));
	expect(new Fleet(join(rootDir, 'fleet')).decisions(AGENT)).toEqual([entry(1), entry(2)]);
});

test('reads a plaintext history followed by sealed lines, in order', () => {
	appendFileSync(decisionLogPath(), legacyLine(1));
	fleet.appendDecision(AGENT, entry(2));
	expect(fleet.decisions(AGENT)).toEqual([entry(1), entry(2)]);
	expect(fleet.decisionLineCounts(AGENT)).toEqual({ sealed: 1, legacy: 1 });
});

test('keeps an unconfirmed entry and the retry with the same counter', () => {
	fleet.appendDecision(AGENT, entry(1, true));
	fleet.appendDecision(AGENT, entry(1));
	expect(fleet.decisions(AGENT)).toEqual([entry(1, true), entry(1)]);
});

test('passes over a sealed line that does not open with the key', () => {
	fleet.appendDecision(AGENT, entry(1));
	const otherKey = new Fleet(join(rootDir, 'fleet'), () => new Uint8Array(32).fill(9));
	expect(otherKey.decisions(AGENT)).toEqual([]);
});

test('reads with the key source it was given', () => {
	fleet.appendDecision(AGENT, entry(1));
	const ownerSide = new Fleet(join(rootDir, 'fleet'), () => TEST_SEAL.dataKey);
	expect(ownerSide.decisions(AGENT)).toEqual([entry(1)]);
});

describe('an agent without a seal', () => {
	const OLD = 'tick-01';
	const oldLogPath = () => join(rootDir, 'fleet', OLD, 'decisions.jsonl');

	beforeEach(() => {
		mkdirSync(join(rootDir, 'fleet', OLD));
		const oldEntry = { id: OLD, name: 'Tick', riskLevel: 'LOW', registeredAt: 0 };
		writeFileSync(join(rootDir, 'fleet', OLD, 'agent.json'), JSON.stringify(oldEntry));
		appendFileSync(oldLogPath(), legacyLine(1));
	});

	test('still reads its plaintext history', () => {
		expect(fleet.isSealed(OLD)).toBe(false);
		expect(fleet.decisions(OLD)).toEqual([entry(1)]);
	});

	test('refuses to append rather than write in clear', () => {
		expect(() => fleet.appendDecision(OLD, entry(2))).toThrow();
		expect(readFileSync(oldLogPath(), 'utf8')).toBe(legacyLine(1));
	});

	test('can be sealed once, then appends sealed lines', () => {
		fleet.addSeal(OLD, TEST_SEAL);
		expect(fleet.isSealed(OLD)).toBe(true);
		fleet.appendDecision(OLD, entry(2));
		expect(fleet.decisions(OLD)).toEqual([entry(1), entry(2)]);
		expect(() => fleet.addSeal(OLD, TEST_SEAL)).toThrow();
	});
});

test('refuses to seal an agent that is not in the fleet', () => {
	expect(() => fleet.addSeal('ghost-01', TEST_SEAL)).toThrow('not in the fleet');
	expect(existsSync(join(rootDir, 'fleet', 'ghost-01'))).toBe(false);
});

test('register keeps the seal it was given', () => {
	expect(fleet.seal(AGENT)).toEqual(TEST_SEAL);
});
