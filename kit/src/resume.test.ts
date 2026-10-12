import { describe, expect, it } from 'bun:test';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getAddressDecoder } from '@solana/kit';
import type { AgentState, AgentStatus } from './instructions';
import { GUARD_CONTEXT, resumeMessage } from './message';
import { signResume } from './resume';

const AGENT = getAddressDecoder().decode(new Uint8Array(32).fill(7));
const KEYS = ml_dsa44.keygen();

function agentState(status: AgentStatus, counter: bigint): AgentState {
	return { owner: AGENT, agentKey: AGENT, status, counter, lastDecision: new Uint8Array(32), bump: 255 };
}

describe('signResume', () => {
	it('signs the resume for the next counter of a killed agent', () => {
		const signature = signResume(AGENT, agentState('Killed', 4n), KEYS.secretKey);
		expect(ml_dsa44.verify(signature, resumeMessage(AGENT, 5n), KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
	});

	it('refuses to sign while the agent is active', () => {
		expect(() => signResume(AGENT, agentState('Active', 4n), KEYS.secretKey)).toThrow('not killed');
	});
});
