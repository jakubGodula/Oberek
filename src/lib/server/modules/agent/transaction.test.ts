import { describe, expect, it } from 'bun:test';
import { SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, SolanaError, type RpcTransport } from '@solana/kit';
import { withRateLimitRetry } from './transaction';

const NO_WAIT_MS = 0;
const RESPONSE = { jsonrpc: '2.0', id: 1, result: 'ok' };
const REQUEST = { payload: { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [] } };

const httpError = (statusCode: number) =>
	new SolanaError(SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, { headers: new Headers(), message: 'HTTP error', statusCode });

/** A transport that answers each request with the next of `answers` (a response, or an error to throw). */
function transportAnswering(answers: unknown[]) {
	const calls = { count: 0 };
	const transport = (async () => {
		const answer = answers[calls.count++];
		if (answer instanceof Error) throw answer;
		return answer;
	}) as RpcTransport;
	return { transport, calls };
}

describe('withRateLimitRetry', () => {
	it('retries a request the RPC rate-limited', async () => {
		const { transport, calls } = transportAnswering([httpError(429), httpError(429), RESPONSE]);
		expect(await withRateLimitRetry(transport, NO_WAIT_MS)(REQUEST)).toBe(RESPONSE);
		expect(calls.count).toBe(3);
	});

	it('does not retry other HTTP errors', async () => {
		const { transport, calls } = transportAnswering([httpError(500), RESPONSE]);
		await expect(withRateLimitRetry(transport, NO_WAIT_MS)(REQUEST)).rejects.toThrow();
		expect(calls.count).toBe(1);
	});

	it('gives up after the last attempt', async () => {
		const { transport } = transportAnswering(Array.from({ length: 100 }, () => httpError(429)));
		await expect(withRateLimitRetry(transport, NO_WAIT_MS)(REQUEST)).rejects.toThrow();
	});
});
