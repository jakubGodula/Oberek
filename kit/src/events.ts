import {
	fixDecoderSize,
	getAddressDecoder,
	getBytesDecoder,
	getStructDecoder,
	getU32Decoder,
	getU64Decoder,
	type Address
} from '@solana/kit';
import { DISCRIMINATORS, equalBytes } from './instructions';
import { DECISION_HASH_LENGTH } from './message';

// The events of onchain/programs/onchain_agent_guard (state.rs), read back from transaction logs. Anchor's emit! logs
// each one as `Program data: <base64 of 8 B discriminator + Borsh>`.

export type GuardEvent =
	| { name: 'StepRecorded'; agent: Address; counter: bigint; decisionHash: Uint8Array }
	| { name: 'BatchRecorded'; agent: Address; counter: bigint; root: Uint8Array; size: number }
	| { name: 'AgentKilled'; agent: Address; counter: bigint }
	| { name: 'AgentResumed'; agent: Address; counter: bigint }
	| { name: 'AgentActivated'; agent: Address; counter: bigint };

const DISCRIMINATOR_LENGTH = 8;
const DATA_PREFIX = 'Program data: ';
const INVOKE_LINE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT_LINE = /^Program (\w+) (success|failed)/;

const counterEventDecoder = getStructDecoder([
	['agent', getAddressDecoder()],
	['counter', getU64Decoder()]
]);
const stepRecordedDecoder = getStructDecoder([
	['agent', getAddressDecoder()],
	['counter', getU64Decoder()],
	['decisionHash', fixDecoderSize(getBytesDecoder(), DECISION_HASH_LENGTH)]
]);
const batchRecordedDecoder = getStructDecoder([
	['agent', getAddressDecoder()],
	['counter', getU64Decoder()],
	['root', fixDecoderSize(getBytesDecoder(), DECISION_HASH_LENGTH)],
	['size', getU32Decoder()]
]);

/**
 * The guard events in one transaction's logs, in order. Only data logged while the program itself is executing counts:
 * any program can log bytes that look like a guard event.
 */
export function parseGuardEvents(logs: readonly string[], programAddress: Address): GuardEvent[] {
	// Program ids of the calls in progress, innermost last: `invoke` lines push, `success` / `failed` lines pop.
	const invocations: string[] = [];
	const events: GuardEvent[] = [];
	for (const line of logs) {
		const invoke = INVOKE_LINE.exec(line);
		if (invoke) invocations.push(invoke[1]);
		else if (EXIT_LINE.test(line)) invocations.pop();
		else if (line.startsWith(DATA_PREFIX) && invocations.at(-1) === programAddress) {
			const event = decodeEvent(new Uint8Array(Buffer.from(line.slice(DATA_PREFIX.length), 'base64')));
			if (event) events.push(event);
		}
	}
	return events;
}

function decodeEvent(data: Uint8Array): GuardEvent | undefined {
	const discriminator = data.subarray(0, DISCRIMINATOR_LENGTH);
	if (equalBytes(discriminator, DISCRIMINATORS.stepRecorded)) {
		const event = stepRecordedDecoder.decode(data, DISCRIMINATOR_LENGTH);
		return { name: 'StepRecorded', ...event, decisionHash: new Uint8Array(event.decisionHash) };
	}
	if (equalBytes(discriminator, DISCRIMINATORS.batchRecorded)) {
		const event = batchRecordedDecoder.decode(data, DISCRIMINATOR_LENGTH);
		return { name: 'BatchRecorded', ...event, root: new Uint8Array(event.root) };
	}
	if (equalBytes(discriminator, DISCRIMINATORS.agentKilled)) {
		return { name: 'AgentKilled', ...counterEventDecoder.decode(data, DISCRIMINATOR_LENGTH) };
	}
	if (equalBytes(discriminator, DISCRIMINATORS.agentResumed)) {
		return { name: 'AgentResumed', ...counterEventDecoder.decode(data, DISCRIMINATOR_LENGTH) };
	}
	if (equalBytes(discriminator, DISCRIMINATORS.agentActivated)) {
		return { name: 'AgentActivated', ...counterEventDecoder.decode(data, DISCRIMINATOR_LENGTH) };
	}
	return undefined;
}
