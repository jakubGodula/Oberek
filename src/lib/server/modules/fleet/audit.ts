import { getBase16Decoder, type Address } from '@solana/kit';
import type { GuardEvent } from '../agent/events';
import type { AgentState } from '../agent/instructions';
import type { DecisionLogEntry } from './fleet';
import { hashDecisionRecord } from './record-decision';

// Audits an agent's decision log against what the guard program recorded on-chain.
//
// The agent account keeps only its counter and the latest decision hash; the full history is in the account's
// transactions, as StepRecorded / AgentKilled / AgentResumed events. The program verified every step's ML-DSA-44
// signature when it was sent, so signatures are not checked again. The audit checks that:
//   - the on-chain history is complete: counters 1..N without gaps or repeats, ending with the account's hash;
//   - the log backs it: every record still hashes to its stored hash, and log and chain agree step by step.

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

type EventNamed<Name extends GuardEvent['name']> = Extract<GuardEvent, { name: Name }>;
type StepEvent = EventNamed<'StepRecorded'>;

const toHex = (bytes: Uint8Array) => getBase16Decoder().decode(bytes);

/** A step as `counter:hash`, so on-chain steps and log entries can be matched. */
const stepKey = (counter: bigint | number, hashHex: string) => `${counter}:${hashHex}`;

/** Audits up to the account's counter: steps that land while the history is fetched are counted as newer and skipped. */
export function auditHistory(input: AuditInput): AuditReport {
	const isAudited = (counter: bigint) => counter <= input.state.counter;
	const agentEvents = input.events.filter((event) => event.agent === input.agent);
	const events = agentEvents.filter((event) => isAudited(event.counter));
	const log = input.log.filter((entry) => isAudited(BigInt(entry.record.counter)));
	const steps = eventsNamed(events, 'StepRecorded');
	const resumes = eventsNamed(events, 'AgentResumed');
	const newerEvents = agentEvents.length - events.length;
	const newerLogEntries = input.log.length - log.length;
	return {
		steps: steps.length,
		resumes: resumes.length,
		kills: eventsNamed(events, 'AgentKilled').length,
		logEntries: log.length,
		newer: newerEvents + newerLogEntries,
		problems: [
			...counterProblems([...steps, ...resumes], input.state.counter),
			...lastDecisionProblems(steps, input.state.lastDecision),
			...logHashProblems(log),
			...unloggedStepProblems(steps, log),
			...unrecordedLogProblems(log, steps)
		]
	};
}

function eventsNamed<Name extends GuardEvent['name']>(events: readonly GuardEvent[], name: Name): EventNamed<Name>[] {
	return events.filter((event): event is EventNamed<Name> => event.name === name);
}

/**
 * Every step and resume moves the counter by one (a kill does not), so the history must hold each of 1..counter
 * exactly once. A gap means the RPC no longer has that transaction.
 */
function counterProblems(advances: readonly GuardEvent[], accountCounter: bigint): string[] {
	const problems: string[] = [];
	for (let counter = 1n; counter <= accountCounter; counter++) {
		const times = advances.filter((event) => event.counter === counter).length;
		if (times === 0) problems.push(`counter ${counter}: no step or resume in the chain history (pruned?)`);
		if (times > 1) problems.push(`counter ${counter}: advanced ${times} times on-chain`);
	}
	return problems;
}

/** The account keeps the newest step's hash, so it must match the step the history ends with. */
function lastDecisionProblems(steps: readonly StepEvent[], lastDecision: Uint8Array): string[] {
	const latest = latestStep(steps);
	if (!latest || toHex(latest.decisionHash) === toHex(lastDecision)) return [];
	return [`account: last decision is ${toHex(lastDecision)}, the last step recorded ${toHex(latest.decisionHash)}`];
}

function latestStep(steps: readonly StepEvent[]): StepEvent | undefined {
	return steps.reduce<StepEvent | undefined>((latest, step) => (!latest || step.counter > latest.counter ? step : latest), undefined);
}

/** A record edited after it was logged no longer hashes to the hash stored next to it. */
function logHashProblems(log: readonly DecisionLogEntry[]): string[] {
	return log
		.filter((entry) => hashDecisionRecord(entry.record) !== entry.decisionHash)
		.map((entry) => `log step ${entry.record.counter}: the record does not hash to ${entry.decisionHash}`);
}

/** Every on-chain step needs a log entry with its hash, or nobody can show which decision it stands for. */
function unloggedStepProblems(steps: readonly StepEvent[], log: readonly DecisionLogEntry[]): string[] {
	return steps.flatMap((step) => {
		const atCounter = log.filter((entry) => BigInt(entry.record.counter) === step.counter);
		if (atCounter.some((entry) => entry.decisionHash === toHex(step.decisionHash))) return [];
		return [`step ${step.counter}: ${atCounter.length ? 'the log has a different hash' : 'on-chain, but not in the log'}`];
	});
}

/** A log entry claims its step was recorded on-chain, unless it is marked unconfirmed (the send may not have landed). */
function unrecordedLogProblems(log: readonly DecisionLogEntry[], steps: readonly StepEvent[]): string[] {
	const recorded = new Set(steps.map((step) => stepKey(step.counter, toHex(step.decisionHash))));
	return log
		.filter((entry) => !entry.unconfirmed && !recorded.has(stepKey(entry.record.counter, entry.decisionHash)))
		.map((entry) => `log step ${entry.record.counter}: not recorded on-chain with this hash`);
}
