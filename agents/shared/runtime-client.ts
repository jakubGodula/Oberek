// The agent's only link to the server: it submits decisions and reads back its last recorded one. The contract is
// HTTP, so nothing here comes from the server's code.

export interface Submission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
}

export type SubmitOutcome =
	| { kind: 'recorded'; counter: number }
	| { kind: 'paused' }
	| { kind: 'failed'; reason: string };

/** A decision as the server recorded it: the submission plus the step counter and the server's time. */
export interface RecordedDecision extends Submission {
	agent: string;
	counter: number;
	observedAt: string;
}

export type LatestOutcome =
	| { kind: 'none' }
	| { kind: 'found'; record: RecordedDecision }
	| { kind: 'failed'; reason: string };

export interface RuntimeClient {
	submit(submission: Submission): Promise<SubmitOutcome>;
	/** The agent's last decision recorded on chain; `none` before its first step. */
	latest(): Promise<LatestOutcome>;
}

/** The server answers 409 when the guard refuses the step because the owner killed the agent. */
const HTTP_CONFLICT = 409;

type Answer = { kind: 'answered'; response: Response; body: Record<string, any> } | { kind: 'unreachable'; reason: string };

export function createRuntimeClient(apiUrl: string, agentId: string, fetchFn: typeof fetch = fetch): RuntimeClient {
	const decisionsUrl = `${apiUrl}/api/agents/${encodeURIComponent(agentId)}/decisions`;

	async function request(url: string, init?: RequestInit): Promise<Answer> {
		try {
			const response = await fetchFn(url, init);
			return { kind: 'answered', response, body: asObject(await response.json().catch(() => null)) };
		} catch (error) {
			return { kind: 'unreachable', reason: `server unreachable: ${error instanceof Error ? error.message : error}` };
		}
	}

	return {
		async submit(submission) {
			const answer = await request(decisionsUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(submission)
			});
			if (answer.kind === 'unreachable') return { kind: 'failed', reason: answer.reason };
			if (answer.response.ok) {
				const { counter } = answer.body;
				if (typeof counter !== 'number') return { kind: 'failed', reason: 'unexpected answer: no counter in it' };
				return { kind: 'recorded', counter };
			}
			if (answer.response.status === HTTP_CONFLICT) return { kind: 'paused' };
			return { kind: 'failed', reason: httpFailure(answer) };
		},

		async latest() {
			const answer = await request(`${decisionsUrl}/latest`);
			if (answer.kind === 'unreachable') return { kind: 'failed', reason: answer.reason };
			if (!answer.response.ok) return { kind: 'failed', reason: httpFailure(answer) };
			// Only an explicit null means "no decisions yet"; anything else must not reset the agent's state.
			if (answer.body.latest === null) return { kind: 'none' };
			if (typeof answer.body.latest?.record !== 'object') {
				return { kind: 'failed', reason: 'unexpected answer: no latest decision in it' };
			}
			return { kind: 'found', record: answer.body.latest.record };
		}
	};
}

/** Any answer that is not a JSON object (a proxy page, a bare `null`) is read as an empty one. */
function asObject(body: unknown): Record<string, any> {
	return typeof body === 'object' && body !== null && !Array.isArray(body) ? body : {};
}

function httpFailure({ response, body }: Extract<Answer, { kind: 'answered' }>): string {
	return `HTTP ${response.status}: ${body.message ?? response.statusText}`;
}

export function describeSubmitOutcome(outcome: SubmitOutcome): string {
	switch (outcome.kind) {
		case 'recorded':
			return `recorded #${outcome.counter}`;
		case 'paused':
			return 'refused: the owner killed the agent';
		case 'failed':
			return `failed: ${outcome.reason}`;
	}
}
