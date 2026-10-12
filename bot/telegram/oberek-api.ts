// The bot's link to the Oberek server: the same HTTP API the page uses. Nothing here comes from the server's code.

export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';

export interface PendingProposal {
	counter: number;
	summary: string;
}

/** An agent card as GET /api/agents returns it, only the fields the bot reads. Mock agents have no `fleet`. */
export interface AgentView {
	id: string;
	name: string;
	status: AgentStatus;
	currentTask: string;
	/** The agent's step counter on chain. */
	actionsExecuted: number;
	fleet?: { pendingProposal: PendingProposal | null };
}

export interface ServerRequest {
	path: string;
	body: Record<string, string>;
}

export type Answer = { kind: 'answered'; status: number; body: unknown } | { kind: 'unreachable'; reason: string };

export interface OberekApi {
	/** Throws when the server does not answer with an agent list. */
	listAgents(): Promise<AgentView[]>;
	post(request: ServerRequest): Promise<Answer>;
}

export function createOberekApi(apiUrl: string, fetchFn: typeof fetch = fetch): OberekApi {
	return {
		async listAgents() {
			const response = await fetchFn(`${apiUrl}/api/agents`);
			const body = (await response.json().catch(() => null)) as { agents?: unknown } | null;
			const agents = body?.agents;
			if (!response.ok || !Array.isArray(agents)) throw new Error(`GET /api/agents: HTTP ${response.status}`);
			return agents as AgentView[];
		},
		async post({ path, body }) {
			try {
				const response = await fetchFn(`${apiUrl}${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				return { kind: 'answered', status: response.status, body: await response.json().catch(() => null) };
			} catch (error) {
				return { kind: 'unreachable', reason: error instanceof Error ? error.message : String(error) };
			}
		}
	};
}
