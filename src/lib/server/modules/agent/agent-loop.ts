import { getBase16Decoder, type Address } from '@solana/kit';
import { hashDecision, tickDecision, type DecisionRecord } from './decision';
import { describeTransactionError } from './guard-errors';
import type { AgentState } from './instructions';
import { stepMessage } from './message';

/** What the cycle needs to know about a sent transaction. */
export interface SentTransaction {
	signature: string;
	err: unknown;
}

export interface DecisionLogEntry {
	record: DecisionRecord;
	decisionHash: string;
	transaction: string;
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
 * One agent cycle: read the on-chain state (the only source of truth), skip while killed, otherwise sign and send the
 * next step. Never throws: a failure is logged and the next cycle starts again from the on-chain state.
 */
export async function runCycle(ports: CyclePorts): Promise<CycleOutcome> {
	try {
		return await recordNextStep(ports);
	} catch (error) {
		ports.log(`cycle failed: ${error instanceof Error ? error.message : String(error)}`);
		return 'failed';
	}
}

async function recordNextStep(ports: CyclePorts): Promise<CycleOutcome> {
	const state = await ports.readAgent();
	if (state.status === 'Killed') {
		ports.log('paused: agent is killed');
		return 'paused';
	}
	const counter = state.counter + 1n;
	const record = tickDecision(ports.agent, counter, ports.now());
	const decisionHash = hashDecision(record);
	const signature = ports.sign(stepMessage(ports.agent, counter, decisionHash));
	const sent = await ports.sendStep(decisionHash, signature);
	await ports.appendLog({
		record,
		decisionHash: getBase16Decoder().decode(decisionHash),
		transaction: sent.signature,
		err: sent.err
	});
	if (sent.err !== null) {
		ports.log(`step ${counter} failed: ${describeTransactionError(sent.err)} (${sent.signature})`);
		return 'failed';
	}
	ports.log(`step ${counter} recorded (${sent.signature})`);
	return 'recorded';
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
