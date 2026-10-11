import type { PriceReading } from './policy';

const PERCENT = 100;

/** The reading at a simulated price, keeping the real one: the demo's way to force a large move on demand. */
export function applyShock(reading: PriceReading, pct: number): PriceReading {
	return { ...reading, usd: reading.usd * (1 + pct / PERCENT), simulatedShock: { pct, realUsd: reading.usd } };
}
