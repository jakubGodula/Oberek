import { describe, expect, test } from 'bun:test';
import { createOberekApi } from './oberek-api';

const AGENT = {
	id: 'tick-01',
	name: 'Oberek Tick One',
	status: 'ACTIVE',
	currentTask: 'TICK',
	actionsExecuted: 3,
	fleet: { pendingProposal: null }
};

function answering(status: number, body: unknown) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const unreachable = (async () => {
	throw new Error('connection refused');
}) as unknown as typeof fetch;

describe('listAgents', () => {
	test('reads the agents of GET /api/agents', async () => {
		const { fetchFn, requests } = answering(200, { success: true, agents: [AGENT] });
		expect(await createOberekApi('http://server', fetchFn).listAgents()).toEqual([AGENT]);
		expect(requests[0].url).toBe('http://server/api/agents');
	});

	test('throws when the answer holds no agent list', async () => {
		const { fetchFn } = answering(500, { message: 'boom' });
		await expect(createOberekApi('http://server', fetchFn).listAgents()).rejects.toThrow('GET /api/agents: HTTP 500');
	});
});

describe('post', () => {
	test('posts the body as JSON to the path and returns status and body', async () => {
		const { fetchFn, requests } = answering(409, { message: 'no proposal waiting' });
		const answer = await createOberekApi('http://server', fetchFn).post({
			path: '/api/agents/sentinel-01/approval',
			body: { verdict: 'accept' }
		});
		expect(answer).toEqual({ kind: 'answered', status: 409, body: { message: 'no proposal waiting' } });
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/approval');
		expect(requests[0].init?.method).toBe('POST');
		expect(JSON.parse(requests[0].init?.body as string)).toEqual({ verdict: 'accept' });
	});

	test('reports an unreachable server instead of throwing', async () => {
		const answer = await createOberekApi('http://server', unreachable).post({ path: '/x', body: {} });
		expect(answer).toEqual({ kind: 'unreachable', reason: 'connection refused' });
	});
});
