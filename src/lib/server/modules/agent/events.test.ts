import { describe, expect, it } from 'bun:test';
import { address, getAddressEncoder, getU32Encoder, getU64Encoder } from '@solana/kit';
import { parseGuardEvents } from './events';
import { DISCRIMINATORS } from './instructions';

const PROGRAM = address('BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs');
const OTHER_PROGRAM = address('ComputeBudget111111111111111111111111111111');
const AGENT = address('BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN');
const HASH = new Uint8Array(32).fill(7);

function dataLine(...parts: ArrayLike<number>[]): string {
	const bytes = Uint8Array.from(parts.flatMap((part) => Array.from(part)));
	return `Program data: ${Buffer.from(bytes).toString('base64')}`;
}

const agentAndCounter = (counter: bigint) => [getAddressEncoder().encode(AGENT), getU64Encoder().encode(counter)];

function invoked(program: string, ...lines: string[]): string[] {
	return [`Program ${program} invoke [1]`, ...lines, `Program ${program} success`];
}

describe('parseGuardEvents', () => {
	it('decodes StepRecorded, AgentKilled and AgentResumed emitted by the program', () => {
		const logs = invoked(
			PROGRAM,
			'Program log: Instruction: RecordStep',
			dataLine(DISCRIMINATORS.stepRecorded, ...agentAndCounter(3n), HASH),
			dataLine(DISCRIMINATORS.agentKilled, ...agentAndCounter(3n)),
			dataLine(DISCRIMINATORS.agentResumed, ...agentAndCounter(4n))
		);

		expect(parseGuardEvents(logs, PROGRAM)).toEqual([
			{ name: 'StepRecorded', agent: AGENT, counter: 3n, decisionHash: HASH },
			{ name: 'AgentKilled', agent: AGENT, counter: 3n },
			{ name: 'AgentResumed', agent: AGENT, counter: 4n }
		]);
	});

	it('decodes BatchRecorded with its root and size', () => {
		const root = new Uint8Array(32).fill(0xb7);
		const logs = invoked(PROGRAM, dataLine(DISCRIMINATORS.batchRecorded, ...agentAndCounter(5n), root, getU32Encoder().encode(16)));
		expect(parseGuardEvents(logs, PROGRAM)).toEqual([{ name: 'BatchRecorded', agent: AGENT, counter: 5n, root, size: 16 }]);
	});

	it('decodes AgentActivated', () => {
		const logs = invoked(PROGRAM, dataLine(DISCRIMINATORS.agentActivated, ...agentAndCounter(0n)));
		expect(parseGuardEvents(logs, PROGRAM)).toEqual([{ name: 'AgentActivated', agent: AGENT, counter: 0n }]);
	});

	it('ignores data logged by another program, even with a guard event discriminator', () => {
		const forged = dataLine(DISCRIMINATORS.stepRecorded, ...agentAndCounter(9n), HASH);
		const logs = [...invoked(OTHER_PROGRAM, forged), ...invoked(PROGRAM, 'Program log: Instruction: Kill')];

		expect(parseGuardEvents(logs, PROGRAM)).toEqual([]);
	});

	it('attributes data to the program on top of the invocation stack', () => {
		const step = dataLine(DISCRIMINATORS.stepRecorded, ...agentAndCounter(1n), HASH);
		const forged = dataLine(DISCRIMINATORS.stepRecorded, ...agentAndCounter(2n), HASH);
		const logs = [
			`Program ${PROGRAM} invoke [1]`,
			`Program ${OTHER_PROGRAM} invoke [2]`,
			forged,
			`Program ${OTHER_PROGRAM} success`,
			step,
			`Program ${PROGRAM} success`
		];

		expect(parseGuardEvents(logs, PROGRAM).map((event) => event.counter)).toEqual([1n]);
	});

	it('pops a program that failed', () => {
		const logs = [
			`Program ${PROGRAM} invoke [1]`,
			`Program ${OTHER_PROGRAM} invoke [2]`,
			`Program ${OTHER_PROGRAM} failed: custom program error: 0x1`,
			dataLine(DISCRIMINATORS.agentKilled, ...agentAndCounter(5n)),
			`Program ${PROGRAM} success`
		];

		expect(parseGuardEvents(logs, PROGRAM)).toEqual([{ name: 'AgentKilled', agent: AGENT, counter: 5n }]);
	});

	it('skips data with an unknown discriminator', () => {
		const logs = invoked(PROGRAM, dataLine(new Uint8Array(8), ...agentAndCounter(1n)));

		expect(parseGuardEvents(logs, PROGRAM)).toEqual([]);
	});
});
