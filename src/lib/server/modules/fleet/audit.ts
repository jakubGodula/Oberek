import { getBase16Decoder, type Address } from '@solana/kit';
import type { AgentState, GuardEvent } from 'pq-agent-guard';
import type { DecisionLogEntry } from './fleet';
import { merkleRoot, verifyProof } from './merkle';
import { hashDecisionRecord } from './record-decision';

// Audits an agent's decision log against what the guard program recorded on-chain.
//
// The agent account keeps only its counter and the latest decision hash; the full history is in the account's
// transactions, as StepRecorded / AgentKilled / AgentResumed events. The program verified every step's ML-DSA-44
// signature when it was sent, so signatures are not checked again. The audit checks that:
//   - the on-chain history is complete: counters 1..N without gaps or repeats, ending with the account's hash;
//   - the log backs it: every record still hashes to its stored hash, and log and chain agree step by step;
//   - every batch (BatchRecorded) has all its decisions in the log, each with a proof leading to the batch's root.

export interface AuditInput {
	agent: Address;
	state: AgentState;
	/** Events from the agent account's transaction history; events of other agents are ignored. */
	events: readonly GuardEvent[];
	log: readonly DecisionLogEntry[];
}

export interface AuditReport {
	steps: number;
	batches: number;
	resumes: number;
	kills: number;
	logEntries: number;
	/** Events and log entries past the account's counter, left out of the audit. */
	newer: number;
	problems: string[];
}

type EventNamed<Name extends GuardEvent['name']> = Extract<GuardEvent, { name: Name }>;
type StepEvent = EventNamed<'StepRecorded'>;
type BatchEvent = EventNamed<'BatchRecorded'>;
/** A step or a batch: what the account's last decision holds after it. */
type Recorded = { counter: bigint; hash: Uint8Array };

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
	const batches = eventsNamed(events, 'BatchRecorded');
	const resumes = eventsNamed(events, 'AgentResumed');
	const newerEvents = agentEvents.length - events.length;
	const newerLogEntries = input.log.length - log.length;
	return {
		steps: steps.length,
		batches: batches.length,
		resumes: resumes.length,
		kills: eventsNamed(events, 'AgentKilled').length,
		logEntries: log.length,
		newer: newerEvents + newerLogEntries,
		problems: [
			...counterProblems([...steps, ...batches, ...resumes], input.state.counter),
			...lastDecisionProblems(recordedHashes(steps, batches), input.state.lastDecision),
			...logHashProblems(log),
			...unloggedStepProblems(steps, log),
			...batchProblems(batches, log),
			...unrecordedLogProblems(log, steps, batches)
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

function recordedHashes(steps: readonly StepEvent[], batches: readonly BatchEvent[]): Recorded[] {
	return [
		...steps.map((step) => ({ counter: step.counter, hash: step.decisionHash })),
		...batches.map((batch) => ({ counter: batch.counter, hash: batch.root }))
	];
}

/** The account keeps the newest step's hash or batch's root, so it must match what the history ends with. */
function lastDecisionProblems(recorded: readonly Recorded[], lastDecision: Uint8Array): string[] {
	const latest = recorded.reduce<Recorded | undefined>(
		(newest, item) => (!newest || item.counter > newest.counter ? item : newest),
		undefined
	);
	if (!latest || toHex(latest.hash) === toHex(lastDecision)) return [];
	return [`account: last decision is ${toHex(lastDecision)}, the last step recorded ${toHex(latest.hash)}`];
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

/**
 * Every batch on-chain needs all its decisions in the log, at its counter and with its root: indexes 0..size-1, each
 * proof leading to the root, and the tree over them giving the root.
 */
function batchProblems(batches: readonly BatchEvent[], log: readonly DecisionLogEntry[]): string[] {
	return batches.flatMap((batch) => {
		const root = toHex(batch.root);
		const entries = log.filter((entry) => BigInt(entry.record.counter) === batch.counter && entry.batch?.root === root);
		if (entries.length === 0) return [`batch ${batch.counter}: on-chain, but not in the log`];
		return batchEntryProblems(batch, root, entries);
	});
}

function batchEntryProblems(batch: BatchEvent, root: string, entries: readonly DecisionLogEntry[]): string[] {
	const problems: string[] = [];
	if (entries.length !== batch.size) {
		problems.push(`batch ${batch.counter}: ${entries.length} log entries, the batch holds ${batch.size}`);
	}
	const ordered = [...entries].sort((a, b) => (a.record.index ?? -1) - (b.record.index ?? -1));
	if (ordered.some((entry, position) => entry.record.index !== position)) {
		problems.push(`batch ${batch.counter}: log indexes are not 0..${entries.length - 1}`);
	}
	for (const entry of ordered) {
		if (!verifyProof(entry.decisionHash, entry.batch!.proof, root)) {
			problems.push(`batch ${batch.counter}, decision ${entry.record.index}: its proof does not lead to the root`);
		}
	}
	if (merkleRoot(ordered.map((entry) => entry.decisionHash)) !== root) {
		problems.push(`batch ${batch.counter}: the log's decisions do not hash to the root`);
	}
	return problems;
}

/**
 * A log entry claims its step or batch was recorded on-chain, unless it is marked unconfirmed (the send may not have
 * landed). A batch entry is matched only against batches, by its root, so it cannot pass for a step with that hash.
 */
function unrecordedLogProblems(
	log: readonly DecisionLogEntry[],
	steps: readonly StepEvent[],
	batches: readonly BatchEvent[]
): string[] {
	const stepKeys = new Set(steps.map((step) => stepKey(step.counter, toHex(step.decisionHash))));
	const batchKeys = new Set(batches.map((batch) => stepKey(batch.counter, toHex(batch.root))));
	const isRecorded = (entry: DecisionLogEntry) =>
		entry.batch
			? batchKeys.has(stepKey(entry.record.counter, entry.batch.root))
			: stepKeys.has(stepKey(entry.record.counter, entry.decisionHash));
	return log
		.filter((entry) => !entry.unconfirmed && !isRecorded(entry))
		.map((entry) => `log step ${entry.record.counter}: not recorded on-chain with this hash`);
}
