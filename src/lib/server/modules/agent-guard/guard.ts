// The guard as the server sees it: the agent's account that onchain_agent_guard keeps on Solana, and the four things
// the program lets anyone do with it. OnchainGuard implements it; tests use an in-memory stand-in.

export type GuardStatus = 'Active' | 'Killed';

export interface GuardAccount {
	owner: string;
	status: GuardStatus;
	/** Steps and resumes so far. */
	counter: number;
	/** Hex SHA-256 of the last recorded decision. */
	lastDecision: string;
}

export const NO_DECISION = '00'.repeat(32);

/**
 * Error names follow the program's errors. NotOwner stands for its `has_one = owner` check, CounterMismatch for a step
 * signed for a counter that is no longer the next one (the program rejects that signature). PayerUnfunded is the
 * guard's own: the account that would pay the transaction cannot, so nothing is sent.
 */
export type GuardErrorCode =
	| 'AgentNotFound'
	| 'AgentKilled'
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

export const HTTP_STATUS_BY_GUARD_ERROR: Record<GuardErrorCode, number> = {
	AgentNotFound: 404,
	NotOwner: 403,
	AgentKilled: 409,
	AgentNotKilled: 409,
	AgentNotActive: 409,
	CounterMismatch: 409,
	PayerUnfunded: 503
};

export interface AgentGuard {
	readAgent(agentId: string): Promise<GuardAccount>;
	/**
	 * Records the decision as step `counter`, which must be the agent's next one. Rejected with AgentKilled while the
	 * agent is killed and with CounterMismatch when another step took that counter first.
	 */
	recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount>;
	/** Owner only; the agent must be active. */
	kill(agentId: string, owner: string): Promise<GuardAccount>;
	/** Owner only; the agent must be killed. Uses up one counter value, like the program. */
	resume(agentId: string, owner: string): Promise<GuardAccount>;
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Agent ids arrive in URLs and become file names; no agent can have an id outside the pattern. */
export function isAgentId(agentId: string): boolean {
	return AGENT_ID_PATTERN.test(agentId);
}

export function assertAgentId(agentId: string): void {
	if (!isAgentId(agentId)) {
		throw new GuardError('AgentNotFound', `invalid agent id: ${JSON.stringify(agentId)}`);
	}
}
