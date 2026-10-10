import { describe, expect, test } from 'bun:test';
import { createRuntimeClient } from './runtime-client';

const SUBMISSION = { kind: 'market-scout', decision: { action: 'HOLD' }, summary: 'HOLD at 150.00 USD (+0.10%)' };

function answering(status: number, body: unknown) {
	const requests: { url: string; init: RequestInit }[] = [];
	const fetchFn = (async (url: string, init: RequestInit) => {
		requests.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

describe('submit', () => {
	test('posts the decision as JSON to the agent decisions endpoint', async () => {
		const { fetchFn, requests } = answering(200, { counter: 1 });
		await createRuntimeClient('http://server', 'scout-04', fetchFn)(SUBMISSION);
		expect(requests[0].url).toBe('http://server/api/agents/scout-04/decisions');
		expect(requests[0].init.method).toBe('POST');
		expect(JSON.parse(requests[0].init.body as string)).toEqual(SUBMISSION);
	});

	test('reports the counter of a recorded decision', async () => {
		const { fetchFn } = answering(200, { counter: 24 });
		expect(await createRuntimeClient('http://server', 'scout-04', fetchFn)(SUBMISSION)).toEqual({
			kind: 'recorded',
			counter: 24
		});
	});

	test('reports a refusal of a killed agent as paused', async () => {
		const { fetchFn } = answering(409, { error: 'AgentKilled', message: 'agent scout-04 is killed' });
		expect(await createRuntimeClient('http://server', 'scout-04', fetchFn)(SUBMISSION)).toEqual({ kind: 'paused' });
	});

	test('reports any other answer as failed, with the server message', async () => {
		const { fetchFn } = answering(404, { error: 'AgentNotFound', message: 'agent scout-04 is not in the fleet' });
		expect(await createRuntimeClient('http://server', 'scout-04', fetchFn)(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'HTTP 404: agent scout-04 is not in the fleet'
		});
	});

	test('reports an unreachable server as failed instead of throwing', async () => {
		const fetchFn = (async () => {
			throw new Error('connection refused');
		}) as unknown as typeof fetch;
		expect(await createRuntimeClient('http://server', 'scout-04', fetchFn)(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'server unreachable: connection refused'
		});
	});
});
