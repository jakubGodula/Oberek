import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Fleet, type DecisionLogEntry } from './fleet';

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
