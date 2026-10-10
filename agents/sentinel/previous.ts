import type { RecordedDecision } from '../shared/runtime-client';
import type { Portfolio, Previous } from './policy';

export const SENTINEL_KIND = 'sentinel';

/**
 * What Sentinel continues from, read from its last recorded decision. Throws when the record is not a Sentinel
 * decision with a sound portfolio, so the agent skips the cycle instead of resetting the treasury.
 */
export function previousFrom(record: RecordedDecision): Previous {
	if (record.kind !== SENTINEL_KIND) throw new Error(`the last decision is not a sentinel decision (${record.kind})`);
	const { after, lastRebalanceAt } = record.decision;
	if (!isPortfolio(after)) throw new Error(`malformed decision: bad portfolio ${JSON.stringify(after)}`);
	if (!isTimeOrNull(lastRebalanceAt)) {
		throw new Error(`malformed decision: bad lastRebalanceAt ${JSON.stringify(lastRebalanceAt)}`);
	}
	return { after: { sol: after.sol, usdc: after.usdc }, lastRebalanceAt };
}

function isPortfolio(value: unknown): value is Portfolio {
	if (typeof value !== 'object' || value === null) return false;
	const { sol, usdc } = value as Record<string, unknown>;
	return isAmount(sol) && isAmount(usdc);
}

function isAmount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimeOrNull(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}
