// The agent's only link to the server: one HTTP POST per decision. The contract is HTTP, so nothing here comes from
// the server's code.

export interface Submission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
}

export type SubmitOutcome =
	| { kind: 'recorded'; counter: number }
	| { kind: 'paused' }
	| { kind: 'failed'; reason: string };

/** The server answers 409 when the guard refuses the step because the owner killed the agent. */
const HTTP_CONFLICT = 409;

export function createRuntimeClient(apiUrl: string, agentId: string, fetchFn: typeof fetch = fetch) {
	const url = `${apiUrl}/api/agents/${encodeURIComponent(agentId)}/decisions`;

	return async function submit(submission: Submission): Promise<SubmitOutcome> {
		let response: Response;
		try {
			response = await fetchFn(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(submission)
			});
		} catch (error) {
			return { kind: 'failed', reason: `server unreachable: ${error instanceof Error ? error.message : error}` };
		}
		const body = await response.json().catch(() => ({}));
		if (response.ok) return { kind: 'recorded', counter: body.counter };
		if (response.status === HTTP_CONFLICT) return { kind: 'paused' };
		return { kind: 'failed', reason: `HTTP ${response.status}: ${body.message ?? response.statusText}` };
	};
}
