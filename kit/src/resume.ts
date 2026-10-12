import type { Address } from '@solana/kit';
import type { AgentState } from './instructions';
import { resumeMessage, signGuardMessage } from './message';

/**
 * Signs the resume that moves a killed agent's counter to the next value. Refuses while the agent is active: such a
 * resume fails on-chain but publishes its signature, and a later kill at the same counter would make it valid, letting
 * the owner's Ed25519 key alone resume the agent.
 */
export function signResume(agent: Address, state: AgentState, secretKey: Uint8Array): Uint8Array {
	if (state.status !== 'Killed') throw new Error(`agent ${agent} is not killed (status ${state.status}); nothing to resume`);
	return signGuardMessage(resumeMessage(agent, state.counter + 1n), secretKey);
}
