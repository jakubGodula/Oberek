// The guard: the agent's account that onchain_agent_guard keeps on Solana, and the four things
// the program lets anyone do with it. OnchainGuard implements it; tests use an in-memory stand-in.

export type GuardStatus = 'Active' | 'Killed' | 'Pending';

export interface GuardAccount {
	owner: string;
	/** Address of the account holding the agent's ML-DSA-44 public key. */
	agentKey: string;
	status: GuardStatus;
	/** Steps and resumes so far. */
	counter: number;
	/** Hex SHA-256 of the last recorded decision. */
	lastDecision: string;
}

export const NO_DECISION = '00'.repeat(32);

/** The events the program emits, one per successful transaction. */
export type GuardEventName = 'StepRecorded' | 'BatchRecorded' | 'AgentKilled' | 'AgentResumed';

/** A guard transaction that landed and succeeded, named by the event it emitted on chain. */
export interface LandedTransaction {
	agentId: string;
	event: GuardEventName;
	/** The counter the event carries: the step's or the resume's, or the unchanged one of a kill. */
	counter: number;
	signature: string;
	/** Steps only. */
	decisionHash?: string;
	/** Batches only: the Merkle root and the number of decisions under it. */
	root?: string;
	size?: number;
}

/**
 * Error names follow the program's errors. NotOwner stands for its `has_one = owner` check, CounterMismatch for a step
 * signed for a counter that is no longer the next one (the program rejects that signature). PayerUnfunded is the
 * guard's own: the account that would pay the transaction cannot, so nothing is sent.
 */
export type GuardErrorCode =
	| 'AgentNotFound'
	| 'AgentKilled'
	| 'AgentPending'
	| 'AgentNotKilled'
	| 'AgentNotActive'
	| 'NotOwner'
	| 'CounterMismatch'
	| 'PayerUnfunded';

export class GuardError extends Error {
	constructor(
		readonly code: GuardErrorCode,
		message: string
	) {
		super(message);
	}
}

export interface AgentGuard {
	readAgent(agentId: string): Promise<GuardAccount>;
	/**
	 * Records the decision as step `counter`, which must be the agent's next one. Rejected with AgentKilled while the
	 * agent is killed, with AgentPending until the owner activates it, and with CounterMismatch when another step took that counter first.
	 */
	recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount>;
	/**
	 * Records `size` decisions under Merkle root `root` as step `counter`, with one signature. Same refusals as
	 * recordStep.
	 */
	recordBatch(agentId: string, counter: number, root: string, size: number): Promise<GuardAccount>;
	/** Owner only; the agent must be active. */
	kill(agentId: string, owner: string): Promise<GuardAccount>;
	/** Owner only; the agent must be killed. Uses up one counter value, like the program. */
	resume(agentId: string, owner: string): Promise<GuardAccount>;
}
