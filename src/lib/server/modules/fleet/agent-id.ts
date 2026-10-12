import { GuardError } from 'pq-agent-guard';

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
