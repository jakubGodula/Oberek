import { createHash } from 'node:crypto';
import type { AgentGuard, GuardAccount } from './guard';

// One agent behind onchain_agent_guard: each action runs only after the program has recorded the decision behind it.

export interface GuardedStep<T> {
	/** The agent's counter after this step. */
	counter: number;
	/** Hex SHA-256 of the decision string, as recorded on chain. */
	decisionHash: string;
	/** What the action returned. */
	result: T;
}

export interface GuardedAgent {
	/**
	 * Records `decision` as the agent's next step, then runs `act`. A refused step throws GuardError and `act` does not
	 * run. If `act` throws, the step stays recorded: the record says the agent decided, not that the action succeeded.
	 */
	step<T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>>;
	status(): Promise<GuardAccount>;
	/** Owner only: every further step is refused until resume. */
	kill(): Promise<GuardAccount>;
	/** Owner only: signed with the agent's ML-DSA-44 key; uses up one counter value. */
	resume(): Promise<GuardAccount>;
}

/** SHA-256 of the decision's UTF-8 bytes, hex: anyone holding the string can recompute what is on chain. */
export function hashDecision(decision: string): string {
	return createHash('sha256').update(Buffer.from(decision, 'utf8')).digest('hex');
}

export function createGuardedAgent(guard: AgentGuard, agentId: string): GuardedAgent {
	const read = () => guard.readAgent(agentId);
	return {
		async step<T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>> {
			const decisionHash = hashDecision(decision);
			const { counter } = await guard.recordStep(agentId, (await read()).counter + 1, decisionHash);
			return { counter, decisionHash, result: await act() };
		},
		status: read,
		// AgentGuard takes the owner the caller claims; OnchainGuard checks its own owner key against the account.
		kill: async () => guard.kill(agentId, (await read()).owner),
		resume: async () => guard.resume(agentId, (await read()).owner)
	};
}
