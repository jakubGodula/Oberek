import type { RecordedDecision } from '../shared/runtime-client';
import type { Portfolio, Previous } from './policy';

export const SENTINEL_KIND = 'sentinel';
/** The server records the owner's verdict on a proposal under this kind. */
export const APPROVAL_KIND = 'approval';

/**
 * What Sentinel continues from, read from its last recorded decision: a Sentinel decision, or the owner's verdict on
 * its proposal (accepted: the trade is applied; rejected: the portfolio before it, with the schedule restarted).
 * Throws on anything else, so the agent skips the cycle instead of resetting the treasury.
 */
export function previousFrom(record: RecordedDecision): Previous {
	if (record.kind !== APPROVAL_KIND) return fromSentinelDecision(record.kind, record.decision);
	const { verdict, proposal } = record.decision;
	if (verdict !== 'accept' && verdict !== 'reject') throw new Error(`malformed verdict: ${JSON.stringify(verdict)}`);
	if (!isObject(proposal) || !isObject(proposal.decision)) throw new Error('malformed verdict: no proposal in it');
	const proposed = fromSentinelDecision(proposal.kind, proposal.decision);
	if (verdict === 'accept') return proposed;
	return { after: portfolioOf(proposal.decision.before), lastRebalanceAt: proposed.lastRebalanceAt };
}

function fromSentinelDecision(kind: unknown, decision: Record<string, unknown>): Previous {
	if (kind !== SENTINEL_KIND) throw new Error(`the last decision is not a sentinel decision (${kind})`);
	const { after, lastRebalanceAt } = decision;
	const portfolio = portfolioOf(after);
	if (!isTimeOrNull(lastRebalanceAt)) {
		throw new Error(`malformed decision: bad lastRebalanceAt ${JSON.stringify(lastRebalanceAt)}`);
	}
	return { after: portfolio, lastRebalanceAt };
}

function portfolioOf(value: unknown): Portfolio {
	if (!isObject(value) || !isAmount(value.sol) || !isAmount(value.usdc)) {
		throw new Error(`malformed decision: bad portfolio ${JSON.stringify(value)}`);
	}
	return { sol: value.sol, usdc: value.usdc };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isAmount(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isTimeOrNull(value: unknown): value is string | null {
	return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}
