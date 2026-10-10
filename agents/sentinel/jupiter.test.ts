import { expect, test } from 'bun:test';
import { fetchSolPrice, JUPITER_PRICE_URL } from './jupiter';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const NOW = new Date('2026-10-10T14:00:00.000Z');

function answering(status: number, body: unknown) {
	const urls: string[] = [];
	const fetchFn = (async (url: string) => {
		urls.push(url);
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return { fetchFn, urls };
}

const fetchWith = (status: number, body: unknown) => fetchSolPrice(answering(status, body).fetchFn, () => NOW);

test('reads the SOL price from the Jupiter Price API v3, timed by the agent clock', async () => {
	const { fetchFn, urls } = answering(200, { [SOL_MINT]: { usdPrice: 109.43, priceChange24h: -0.3 } });
	expect(await fetchSolPrice(fetchFn, () => NOW)).toEqual({
		usd: 109.43,
		source: 'jupiter-price-v3',
		observedAt: NOW.toISOString()
	});
	expect(urls).toEqual([JUPITER_PRICE_URL]);
	expect(JUPITER_PRICE_URL).toBe(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
});

test('refuses an HTTP error', async () => {
	await expect(fetchWith(429, { error: 'rate limited' })).rejects.toThrow('HTTP 429');
});

test('refuses an answer without the SOL price', async () => {
	await expect(fetchWith(200, {})).rejects.toThrow('no valid SOL price');
});

test.each([0, -1, '109.43', null])('refuses the price %p', async (usdPrice) => {
	await expect(fetchWith(200, { [SOL_MINT]: { usdPrice } })).rejects.toThrow('no valid SOL price');
});

test('refuses a body that is not JSON', async () => {
	await expect(fetchWith(200, '<html>maintenance</html>')).rejects.toThrow('not JSON');
});
