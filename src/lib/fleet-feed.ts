// How the page shows a fleet agent's decisions: one row per log entry, read from the record's JSON. Records it cannot
// read as Sentinel's (e.g. Tick's) show their summary only.

export type Chip = 'HOLD' | 'REBALANCE' | 'AWAITING_APPROVAL' | 'PROPOSAL' | 'APPROVED' | 'REJECTED' | 'DECISION';

export interface FeedEntry {
	record: {
		counter: number;
		kind: string;
		decision: Record<string, unknown>;
		summary: string;
		observedAt: string;
		requiresApproval?: true;
	};
	decisionHash: string;
	unconfirmed?: true;
}

export interface TradeDetails {
	priceUsd: number;
	shockPct: number | null;
	solShareBefore: number;
	solShareAfter: number;
	trade: { side: string; sol: number; usdc: number } | null;
}

export interface FeedRow {
	/** The record's hash: unique, unlike the counter, which an unlanded step and its retry share. */
	key: string;
	counter: number;
	observedAt: string;
	chip: Chip;
	summary: string;
	unconfirmed: boolean;
	/** From the decision, or for a verdict from its proposal; null when the record has no price and portfolio. */
	details: TradeDetails | null;
}

const SHOCK_KINDS = new Set(['sentinel', 'approval']);

/** `pendingCounter`: the counter of the proposal waiting for a verdict, if any. */
export function toFeedRow(entry: FeedEntry, pendingCounter: number | null): FeedRow {
	const { record } = entry;
	return {
		key: entry.decisionHash,
		counter: record.counter,
		observedAt: record.observedAt,
		chip: chipOf(record, pendingCounter),
		summary: record.summary,
		unconfirmed: entry.unconfirmed === true,
		details: tradeDetails(record.kind === 'approval' ? proposalDecision(record.decision) : record.decision)
	};
}

/** Only Sentinel reads the demo shock; the server cannot tell which program runs an agent. */
export function acceptsShock(lastDecisionKind: string | null): boolean {
	return lastDecisionKind !== null && SHOCK_KINDS.has(lastDecisionKind);
}

function chipOf(record: FeedEntry['record'], pendingCounter: number | null): Chip {
	if (record.kind === 'approval') return record.decision.verdict === 'accept' ? 'APPROVED' : 'REJECTED';
	if (record.requiresApproval) return record.counter === pendingCounter ? 'AWAITING_APPROVAL' : 'PROPOSAL';
	const { action } = record.decision;
	return action === 'HOLD' || action === 'REBALANCE' ? action : 'DECISION';
}

function proposalDecision(verdict: Record<string, unknown>): unknown {
	return isObject(verdict.proposal) ? verdict.proposal.decision : undefined;
}

function tradeDetails(decision: unknown): TradeDetails | null {
	if (!isObject(decision)) return null;
	const { price, before, after, trade } = decision;
	if (!isObject(price) || !isObject(before) || !isObject(after)) return null;
	const { usd } = price;
	const { solShare } = before;
	if (!isNumber(usd) || !isNumber(solShare) || !isNumber(after.sol) || !isNumber(after.usdc)) return null;
	const solValueAfter = after.sol * usd;
	return {
		priceUsd: usd,
		shockPct: isObject(price.simulatedShock) && isNumber(price.simulatedShock.pct) ? price.simulatedShock.pct : null,
		solShareBefore: solShare,
		solShareAfter: solValueAfter / (solValueAfter + after.usdc),
		trade: tradeOf(trade)
	};
}

function tradeOf(trade: unknown): TradeDetails['trade'] {
	if (!isObject(trade) || typeof trade.side !== 'string' || !isNumber(trade.sol) || !isNumber(trade.usdc)) return null;
	return { side: trade.side, sol: trade.sol, usdc: trade.usdc };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}
