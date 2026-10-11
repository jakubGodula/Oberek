import { describe, expect, it } from 'bun:test';
import { address, getBase16Encoder } from '@solana/kit';
import type { GuardEvent } from '../agent/events';
import type { AgentState } from '../agent/instructions';
import { auditHistory } from './audit';
import type { DecisionLogEntry } from './fleet';
import { hashDecisionRecord } from './record-decision';

const AGENT = address('BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN');
const OTHER_AGENT = address('ComputeBudget111111111111111111111111111111');

function logEntry(counter: number, extra: Partial<DecisionLogEntry> = {}): DecisionLogEntry {
	const record = {
		agent: 'sentinel-01',
		counter,
		kind: 'sentinel',
		decision: { action: 'HOLD' },
		summary: 'HOLD',
		observedAt: `2026-10-10T15:00:0${counter}.000Z`
	};
	return { record, decisionHash: hashDecisionRecord(record), ...extra };
}

const toBytes = (hex: string) => new Uint8Array(getBase16Encoder().encode(hex));

function step(entry: DecisionLogEntry): GuardEvent {
	return { name: 'StepRecorded', agent: AGENT, counter: BigInt(entry.record.counter), decisionHash: toBytes(entry.decisionHash) };
}

const killed = (counter: number): GuardEvent => ({ name: 'AgentKilled', agent: AGENT, counter: BigInt(counter) });
const resumed = (counter: number): GuardEvent => ({ name: 'AgentResumed', agent: AGENT, counter: BigInt(counter) });

function stateAfter(counter: number, last: DecisionLogEntry | undefined): AgentState {
	return {
		owner: AGENT,
		agentKey: AGENT,
		status: 'Active',
		counter: BigInt(counter),
		lastDecision: last ? toBytes(last.decisionHash) : new Uint8Array(32),
		bump: 255
	};
}

const one = logEntry(1);
const two = logEntry(2);
const four = logEntry(4);

describe('auditHistory', () => {
	it('finds no problem when the chain and the log agree, kills and resumes included', () => {
		const report = auditHistory({
			agent: AGENT,
			state: stateAfter(4, four),
			events: [step(one), step(two), killed(2), resumed(3), step(four)],
			log: [one, two, four]
		});

		expect(report).toEqual({ steps: 3, resumes: 1, kills: 1, logEntries: 3, newer: 0, problems: [] });
	});

	it('reports a log record edited after its hash was recorded', () => {
		const edited = { ...one, record: { ...one.record, summary: 'REBALANCE' } };

		const { problems } = auditHistory({ agent: AGENT, state: stateAfter(1, one), events: [step(one)], log: [edited] });

		expect(problems).toEqual([`log step 1: the record does not hash to ${one.decisionHash}`]);
	});

	it('reports a step the chain has but the log lacks', () => {
		const { problems } = auditHistory({
			agent: AGENT,
			state: stateAfter(2, two),
			events: [step(one), step(two)],
			log: [two]
		});

		expect(problems).toEqual(['step 1: on-chain, but not in the log']);
	});

	it('reports a log entry whose hash differs from the one on-chain', () => {
		const record = { ...one.record, summary: 'REBALANCE' };
		const rewritten = { record, decisionHash: hashDecisionRecord(record) };

		const { problems } = auditHistory({ agent: AGENT, state: stateAfter(1, one), events: [step(one)], log: [rewritten] });

		expect(problems).toEqual([
			'step 1: the log has a different hash',
			'log step 1: not recorded on-chain with this hash'
		]);
	});

	it('reports a confirmed log entry the chain never recorded, but not an unconfirmed one', () => {
		const { problems } = auditHistory({
			agent: AGENT,
			state: stateAfter(2, one),
			events: [step(one), killed(1), resumed(2)],
			log: [one, logEntry(2), logEntry(2, { unconfirmed: true })]
		});

		expect(problems).toEqual(['log step 2: not recorded on-chain with this hash']);
	});

	it('reports counters missing from the chain history', () => {
		const { problems } = auditHistory({ agent: AGENT, state: stateAfter(2, two), events: [step(two)], log: [two] });

		expect(problems).toEqual(['counter 1: no step or resume in the chain history (pruned?)']);
	});

	it('reports a last decision that differs from the last recorded step', () => {
		const { problems } = auditHistory({
			agent: AGENT,
			state: stateAfter(2, one),
			events: [step(one), step(two)],
			log: [one, two]
		});

		expect(problems).toEqual([`account: last decision is ${one.decisionHash}, the last step recorded ${two.decisionHash}`]);
	});

	it('ignores events of other agents', () => {
		const foreign: GuardEvent = { ...step(two), agent: OTHER_AGENT };

		const report = auditHistory({ agent: AGENT, state: stateAfter(1, one), events: [step(one), foreign], log: [one] });

		expect(report).toEqual({ steps: 1, resumes: 0, kills: 0, logEntries: 1, newer: 0, problems: [] });
	});

	it('skips events and log entries past the account counter, read before the history', () => {
		const report = auditHistory({
			agent: AGENT,
			state: stateAfter(1, one),
			events: [step(one), step(two)],
			log: [one, two]
		});

		expect(report).toEqual({ steps: 1, resumes: 0, kills: 0, logEntries: 1, newer: 2, problems: [] });
	});
});
