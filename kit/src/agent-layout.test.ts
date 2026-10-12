import { describe, expect, it } from 'bun:test';
import { getU64Encoder } from '@solana/kit';
import { decodeAgent, DISCRIMINATORS } from './instructions';

// kit/README.md tells on-chain programs to check these bytes of the Agent account; this pins them to the decoder.

const README_DISCRIMINATOR = [47, 166, 112, 147, 155, 197, 86, 7];
const STATUS_OFFSET = 72;
const COUNTER_OFFSET = 73;
/** discriminator, owner, agent key, status, counter, last decision, bump */
const AGENT_ACCOUNT_SIZE = 8 + 32 + 32 + 1 + 8 + 32 + 1;

function agentAccount(statusByte: number): Uint8Array {
	const data = new Uint8Array(AGENT_ACCOUNT_SIZE);
	data.set(DISCRIMINATORS.agent, 0);
	data.fill(1, 8, 40);
	data.fill(2, 40, STATUS_OFFSET);
	data[STATUS_OFFSET] = statusByte;
	data.set(getU64Encoder().encode(7n), COUNTER_OFFSET);
	return data;
}

describe('Agent account bytes in kit/README.md', () => {
	it('starts with the documented discriminator', () => {
		expect(Array.from(DISCRIMINATORS.agent)).toEqual(README_DISCRIMINATOR);
	});

	it.each([
		[0, 'Active'],
		[1, 'Killed'],
		[2, 'Pending']
	] as const)('reads status byte %d at offset 72 as %s', (statusByte, status) => {
		const agent = decodeAgent(agentAccount(statusByte));

		expect(agent.status).toBe(status);
		expect(agent.counter).toBe(7n);
	});
});
