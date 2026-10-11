import { describe, expect, test } from 'bun:test';
import { createRuntimeClient, describeSubmitOutcome } from './runtime-client';

const SUBMISSION = { kind: 'tick', decision: {}, summary: 'TICK' };
const RECORD = {
	agent: 'sentinel-01',
	counter: 7,
	kind: 'sentinel',
	decision: { action: 'HOLD' },
	summary: 'HOLD',
	observedAt: '2026-10-10T12:00:00.000Z'
};

function answering(status: number, body: unknown) {
	const requests: { url: string; init?: RequestInit }[] = [];
	const fetchFn = (async (url: string, init?: RequestInit) => {
		requests.push({ url, init });
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, requests };
}

const unreachable = (async () => {
	throw new Error('connection refused');
}) as unknown as typeof fetch;

describe('submit', () => {
	test('posts the decision as JSON to the agent decisions endpoint', async () => {
		const { fetchFn, requests } = answering(200, { counter: 1 });
		await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION);
		expect(requests[0].url).toBe('http://server/api/agents/tick-01/decisions');
		expect(requests[0].init?.method).toBe('POST');
		expect(JSON.parse(requests[0].init?.body as string)).toEqual(SUBMISSION);
	});

	test('reports the counter of a recorded decision', async () => {
		const { fetchFn } = answering(200, { counter: 24 });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'recorded',
			counter: 24
		});
	});

	test('reports a refusal of a killed agent as paused', async () => {
		const { fetchFn } = answering(409, { error: 'AgentKilled', message: 'agent tick-01 is killed' });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'paused'
		});
	});

	test('reports any other answer as failed, with the server message', async () => {
		const { fetchFn } = answering(404, { error: 'AgentNotFound', message: 'agent tick-01 is not in the fleet' });
		expect(await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'HTTP 404: agent tick-01 is not in the fleet'
		});
	});

	test('reports a recorded answer with a JSON null body as failed instead of throwing', async () => {
		const { fetchFn } = answering(200, null);
		expect((await createRuntimeClient('http://server', 'tick-01', fetchFn).submit(SUBMISSION)).kind).toBe('failed');
	});

	test('reports an unreachable server as failed instead of throwing', async () => {
		expect(await createRuntimeClient('http://server', 'tick-01', unreachable).submit(SUBMISSION)).toEqual({
			kind: 'failed',
			reason: 'server unreachable: connection refused'
		});
	});

	test('reports a refusal while a proposal waits as awaiting, not as a kill', async () => {
		const { fetchFn } = answering(409, { error: 'AwaitingApproval', message: 'waiting for a verdict' });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).submit(SUBMISSION)).toEqual({
			kind: 'awaiting'
		});
	});

	test('sends the approval flag with a proposal', async () => {
		const { fetchFn, requests } = answering(200, { counter: 2 });
		await createRuntimeClient('http://server', 'sentinel-01', fetchFn).submit({ ...SUBMISSION, requiresApproval: true });
		expect(JSON.parse(requests[0].init?.body as string).requiresApproval).toBe(true);
	});
});

describe('claimShock', () => {
	test('posts to the agent shock claim endpoint and reports an armed shock', async () => {
		const { fetchFn, requests } = answering(200, { shock: { pct: -3 } });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).toEqual({
			kind: 'armed',
			pct: -3
		});
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/shock/claim');
		expect(requests[0].init?.method).toBe('POST');
	});

	test('reports none when nothing is armed', async () => {
		const { fetchFn } = answering(200, { shock: null });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).toEqual({ kind: 'none' });
	});

	test.each([
		['an error answer', 404, { error: 'AgentNotFound', message: 'not in the fleet' }],
		['an answer without a shock field', 200, {}],
		['a shock without a number', 200, { shock: { pct: '-3' } }]
	])('reports %s as failed', async (_, status, body) => {
		const { fetchFn } = answering(status, body);
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).claimShock()).kind).toBe('failed');
	});

	test('reports an unreachable server as failed', async () => {
		expect((await createRuntimeClient('http://server', 'sentinel-01', unreachable).claimShock()).kind).toBe('failed');
	});
});

describe('latest', () => {
	test('asks the latest endpoint of the agent', async () => {
		const { fetchFn, requests } = answering(200, { latest: null });
		await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest();
		expect(requests[0].url).toBe('http://server/api/agents/sentinel-01/decisions/latest');
	});

	test('reports an agent without recorded decisions as none', async () => {
		const { fetchFn } = answering(200, { latest: null });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({ kind: 'none' });
	});

	test('returns the recorded decision', async () => {
		const { fetchFn } = answering(200, { latest: { counter: 7, record: RECORD, decisionHash: 'ab'.repeat(32) } });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({
			kind: 'found',
			record: RECORD
		});
	});

	test('reports a log that disagrees with the chain as failed', async () => {
		const { fetchFn } = answering(409, { error: 'DecisionNotInLog', message: 'not in its log' });
		expect(await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).toEqual({
			kind: 'failed',
			reason: 'HTTP 409: not in its log'
		});
	});

	test('reports a 200 answer without a latest field as failed, never as none', async () => {
		const { fetchFn } = answering(200, '<html>proxy page</html>');
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).kind).toBe('failed');
	});

	test('reports a JSON null body as failed instead of throwing', async () => {
		const { fetchFn } = answering(200, null);
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).kind).toBe('failed');
	});

	test('reports an error answer with a JSON null body as failed instead of throwing', async () => {
		const { fetchFn } = answering(500, null);
		expect((await createRuntimeClient('http://server', 'sentinel-01', fetchFn).latest()).kind).toBe('failed');
	});

	test('reports an unreachable server as failed', async () => {
		expect(await createRuntimeClient('http://server', 'sentinel-01', unreachable).latest()).toEqual({
			kind: 'failed',
			reason: 'server unreachable: connection refused'
		});
	});
});

test('describes each submit outcome in one line', () => {
	expect(describeSubmitOutcome({ kind: 'recorded', counter: 3 })).toBe('recorded #3');
	expect(describeSubmitOutcome({ kind: 'paused' })).toBe('refused: the owner killed the agent');
	expect(describeSubmitOutcome({ kind: 'failed', reason: 'HTTP 502: x' })).toBe('failed: HTTP 502: x');
});

test('describes a refusal while waiting for approval', () => {
	expect(describeSubmitOutcome({ kind: 'awaiting' })).toBe('refused: waiting for approval');
});
