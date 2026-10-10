import { getBase16Decoder, type Address } from '@solana/kit';
import type { GuardEvent } from '../agent/events';
import type { AgentState } from '../agent/instructions';
import type { DecisionLogEntry } from './fleet';
import { hashDecisionRecord } from './record-decision';

// Checks an agent's decision log against what the guard recorded on-chain: the account and the events in its
// transaction history. The program already verified every step's ML-DSA-44 signature; this checks that the history is
// complete and that the log holds the record behind every hash.

export interface AuditInput {
	agent: Address;
	state: AgentState;
	/** Events from the agent account's transaction history; events of other agents are ignored. */
	events: readonly GuardEvent[];
	log: readonly DecisionLogEntry[];
}

export interface AuditReport {
	steps: number;
	resumes: number;
	kills: number;
	logEntries: number;
	/** Events and log entries past the account's counter, left out of the audit. */
	newer: number;
	problems: string[];
}

type StepEvent = Extract<GuardEvent, { name: 'StepRecorded' }>;

const toHex = (bytes: Uint8Array) => getBase16Decoder().decode(bytes);

/** Audits up to the account's counter: steps that land while the history is fetched are counted as newer and skipped. */
export function auditHistory(input: AuditInput): AuditReport {
	const upToAccount = (counter: bigint) => counter <= input.state.counter;
	const agentEvents = input.events.filter((event) => event.agent === input.agent);
	const events = agentEvents.filter((event) => upToAccount(event.counter));
	const log = input.log.filter((entry) => upToAccount(BigInt(entry.record.counter)));
	const steps = events.filter((event): event is StepEvent => event.name === 'StepRecorded');
	const advances = events.filter((event) => event.name !== 'AgentKilled');
	return {
		steps: steps.length,
		resumes: advances.length - steps.length,
		kills: events.length - advances.length,
		logEntries: log.length,
		newer: agentEvents.length - events.length + input.log.length - log.length,
		problems: [
			...counterProblems(advances, input.state.counter),
			...lastDecisionProblems(steps, input.state.lastDecision),
			...logHashProblems(log),
			...unloggedStepProblems(steps, log),
			...unrecordedLogProblems(log, steps)
		]
	};
}

/** Every step and resume moves the counter by one, so the history must hold each of 1..counter exactly once. */
function counterProblems(advances: readonly GuardEvent[], accountCounter: bigint): string[] {
	const problems: string[] = [];
	for (let counter = 1n; counter <= accountCounter; counter++) {
		const times = advances.filter((event) => event.counter === counter).length;
		if (times === 0) problems.push(`counter ${counter}: no step or resume in the chain history (pruned?)`);
		if (times > 1) problems.push(`counter ${counter}: advanced ${times} times on-chain`);
	}
	return problems;
}

function lastDecisionProblems(steps: readonly StepEvent[], lastDecision: Uint8Array): string[] {
	const last = steps.reduce<StepEvent | undefined>((latest, step) => (!latest || step.counter > latest.counter ? step : latest), undefined);
	if (!last || toHex(last.decisionHash) === toHex(lastDecision)) return [];
	return [`account: last decision is ${toHex(lastDecision)}, the last step recorded ${toHex(last.decisionHash)}`];
}

function logHashProblems(log: readonly DecisionLogEntry[]): string[] {
	return log
		.filter((entry) => hashDecisionRecord(entry.record) !== entry.decisionHash)
		.map((entry) => `log step ${entry.record.counter}: the record does not hash to ${entry.decisionHash}`);
}

function unloggedStepProblems(steps: readonly StepEvent[], log: readonly DecisionLogEntry[]): string[] {
	return steps.flatMap((step) => {
		const atCounter = log.filter((entry) => BigInt(entry.record.counter) === step.counter);
		if (atCounter.some((entry) => entry.decisionHash === toHex(step.decisionHash))) return [];
		return [`step ${step.counter}: ${atCounter.length ? 'the log has a different hash' : 'on-chain, but not in the log'}`];
	});
}

/** An unconfirmed entry may or may not have landed; any other entry claims a recorded step. */
function unrecordedLogProblems(log: readonly DecisionLogEntry[], steps: readonly StepEvent[]): string[] {
	const recorded = new Set(steps.map((step) => `${step.counter}:${toHex(step.decisionHash)}`));
	return log
		.filter((entry) => !entry.unconfirmed && !recorded.has(`${entry.record.counter}:${entry.decisionHash}`))
		.map((entry) => `log step ${entry.record.counter}: not recorded on-chain with this hash`);
}
