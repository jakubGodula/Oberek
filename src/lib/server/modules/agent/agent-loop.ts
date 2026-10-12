import { getBase16Decoder, type Address } from '@solana/kit';
import { hashDecision, tickDecision, type DecisionRecord } from './decision';
import { describeTransactionError } from './guard-errors';
import type { AgentState, AgentStatus } from './instructions';
import { stepMessage } from './message';

const PAUSE_REASONS: Record<Exclude<AgentStatus, 'Active'>, string> = {
	Killed: 'paused: agent is killed',
	Pending: 'paused: agent awaits the owner activation (bun scripts/agent.ts activate)'
};

/** What the cycle needs to know about a sent transaction. */
export interface SentTransaction {
	signature: string;
	err: unknown;
}

export interface DecisionLogEntry {
	record: DecisionRecord;
	decisionHash: string;
	/** `null` when the send threw before its outcome was known; the step may still have landed. */
	transaction: string | null;
	err: unknown;
}

/** Everything a cycle touches outside itself, injected so the cycle can be tested without a network. */
export interface CyclePorts {
	agent: Address;
	readAgent(): Promise<AgentState>;
	sign(message: Uint8Array): Uint8Array;
	sendStep(decisionHash: Uint8Array, signature: Uint8Array): Promise<SentTransaction>;
	appendLog(entry: DecisionLogEntry): Promise<void>;
	now(): Date;
	log(line: string): void;
}

export type CycleOutcome = 'paused' | 'recorded' | 'failed';

/**
 * One agent cycle: read the on-chain state (the only source of truth), skip while killed or not yet activated, otherwise sign and send the
 * next step. Never throws: a failure is logged and the next cycle starts again from the on-chain state.
 */
export async function runCycle(ports: CyclePorts): Promise<CycleOutcome> {
	try {
		return await recordNextStep(ports);
	} catch (error) {
		ports.log(`cycle failed: ${errorMessage(error)}`);
		return 'failed';
	}
}

async function recordNextStep(ports: CyclePorts): Promise<CycleOutcome> {
	const state = await ports.readAgent();
	if (state.status !== 'Active') {
		ports.log(PAUSE_REASONS[state.status]);
		return 'paused';
	}
	const counter = state.counter + 1n;
	const record = tickDecision(ports.agent, counter, ports.now());
	const decisionHash = hashDecision(record);
	const signature = ports.sign(stepMessage(ports.agent, counter, decisionHash));
	const logStep = (transaction: string | null, err: unknown) =>
		ports.appendLog({ record, decisionHash: getBase16Decoder().decode(decisionHash), transaction, err });
	let sent: SentTransaction;
	try {
		sent = await ports.sendStep(decisionHash, signature);
	} catch (error) {
		// Logged anyway: the step may land after the send gave up, and the record is the only way to audit its hash.
		await logStep(null, errorMessage(error));
		throw error;
	}
	await logStep(sent.signature, sent.err);
	if (sent.err !== null) {
		ports.log(`step ${counter} failed: ${describeTransactionError(sent.err)} (${sent.signature})`);
		return 'failed';
	}
	ports.log(`step ${counter} recorded (${sent.signature})`);
	return 'recorded';
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Runs a cycle every `tickMs` until `signal` aborts. */
export async function runLoop(ports: CyclePorts, tickMs: number, signal: AbortSignal): Promise<void> {
	while (!signal.aborted) {
		await runCycle(ports);
		await sleep(tickMs, signal);
	}
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}
