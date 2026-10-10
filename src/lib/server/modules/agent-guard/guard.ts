// The guard as the server sees it: the agent's account that onchain_agent_guard keeps on Solana, and the four things
// the program lets anyone do with it. FakeGuard implements it on local files; the on-chain program will replace it.

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

/** Error names follow the program's errors; NotOwner stands for its `has_one = owner` check. */
export type GuardErrorCode = 'AgentNotFound' | 'AgentKilled' | 'AgentNotKilled' | 'AgentNotActive' | 'NotOwner';

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
	AgentNotActive: 409
};

export interface AgentGuard {
	readAgent(agentId: string): Promise<GuardAccount>;
	/** Rejected with AgentKilled while the agent is killed. */
	recordStep(agentId: string, decisionHash: string): Promise<GuardAccount>;
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
