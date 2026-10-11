import { describe, expect, test } from 'bun:test';
import type { LandedTransaction } from '../agent-guard/guard';
import type { DecisionLogEntry, LoggedTransaction } from './fleet';
import { withTransactions } from './onchain-feed';

const SENTINEL = 'sentinel-01';
const NOW = 1_000;

const hashOf = (counter: number) => String(counter).padStart(64, '0');

const landed = (event: LandedTransaction['event'], counter: number, agentId = SENTINEL): LoggedTransaction => ({
	agentId,
	event,
	counter,
	signature: `sig-${event}-${counter}`,
	...(event === 'StepRecorded' ? { decisionHash: hashOf(counter) } : {}),
	landedAt: NOW
});

const decision = (counter: number): DecisionLogEntry => ({
	record: { agent: SENTINEL, counter, kind: 'sentinel', decision: {}, summary: `#${counter}`, observedAt: '' },
	decisionHash: hashOf(counter)
});

describe('withTransactions', () => {
	test("gives each decision its step's signature, and none to a decision the transaction log does not hold", () => {
		const { entries } = withTransactions([decision(6), decision(5)], [landed('StepRecorded', 6)]);
		expect(entries).toEqual([{ ...decision(6), signature: 'sig-StepRecorded-6' }, decision(5)]);
	});

	test('adds the kills and resumes from the oldest decision shown on', () => {
		const transactions = [landed('AgentKilled', 3), landed('AgentKilled', 5), landed('AgentResumed', 6)];
		const { operatorActions } = withTransactions([decision(7), decision(5)], transactions);
		expect(operatorActions).toEqual([
			{ event: 'AgentKilled', counter: 5, signature: 'sig-AgentKilled-5', landedAt: NOW },
			{ event: 'AgentResumed', counter: 6, signature: 'sig-AgentResumed-6', landedAt: NOW }
		]);
	});

	test('adds every kill and resume while the agent has no decision yet', () => {
		expect(withTransactions([], [landed('AgentKilled', 0)]).operatorActions).toHaveLength(1);
	});

	test('keeps a batch transaction out of the operator actions', () => {
		const batchTx: LoggedTransaction = { agentId: SENTINEL, event: 'BatchRecorded', counter: 7, signature: 'sig-batch', root: 'cd'.repeat(32), size: 2, landedAt: NOW };
		expect(withTransactions([], [batchTx]).operatorActions).toEqual([]);
	});
});
