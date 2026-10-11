import type { PriceReading } from './policy';

// The SOL price in USD from Jupiter, aggregated from Solana DEX liquidity. Free, no API key.

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const PRICE_SOURCE = 'jupiter-price-v3';
export const JUPITER_PRICE_URL = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;

/** Jupiter gives no publish time, so the reading is timed by the agent's clock when the answer arrives. */
export async function fetchSolPrice(fetchFn: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<PriceReading> {
	const response = await fetchFn(JUPITER_PRICE_URL);
	if (!response.ok) throw new Error(`Jupiter price API answered HTTP ${response.status}`);
	const text = await response.text();
	let body: any;
	try {
		body = JSON.parse(text);
	} catch {
		throw new Error(`Jupiter price API answer is not JSON: ${text.slice(0, 80)}`);
	}
	const usd = body?.[SOL_MINT]?.usdPrice;
	if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
		throw new Error(`Jupiter gave no valid SOL price: ${JSON.stringify(body).slice(0, 200)}`);
	}
	return { usd, source: PRICE_SOURCE, observedAt: now().toISOString() };
}
