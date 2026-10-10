// A fake SOL price: a random walk, so Scout Delta has something to react to without real market data.

export const START_PRICE_USD = 150;
/** Largest move per tick, in percent, up or down. */
const MAX_STEP_PERCENT = 3;

/** `random` returns a number in [0, 1), like Math.random; injected so tests can fix it. */
export function nextPrice(priceUsd: number, random: () => number = Math.random): number {
	const stepPercent = (random() * 2 - 1) * MAX_STEP_PERCENT;
	return priceUsd * (1 + stepPercent / 100);
}
