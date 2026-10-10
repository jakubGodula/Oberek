// Sentinel's policy: keep a virtual SOL/USDC treasury at its target SOL share. Rebalances when the share drifts out of
// the band, or on schedule when the last rebalance is old enough. Pure: no I/O, the decision time is the price's.

export interface Portfolio {
	sol: number;
	usdc: number;
}

export interface PriceReading {
	usd: number;
	source: string;
	observedAt: string;
}

export interface Policy {
	targetSolShare: number;
	/** How far the SOL share may drift from the target, as a share (0.0002 = 0.02 percentage points). */
	driftThreshold: number;
	scheduleMinutes: number;
}

/** What Sentinel continues from: the portfolio after its last recorded decision. */
export interface Previous {
	after: Portfolio;
	lastRebalanceAt: string | null;
}

export type Trade = { side: 'SELL' | 'BUY'; sol: number; usdc: number };

export type SentinelDecision = {
	action: 'REBALANCE' | 'HOLD';
	reason?: 'drift' | 'schedule';
	price: PriceReading;
	policy: Policy;
	before: Portfolio & { solShare: number };
	trade?: Trade;
	after: Portfolio;
	lastRebalanceAt: string | null;
};

export const INITIAL_PORTFOLIO: Portfolio = { sol: 1000, usdc: 100_000 };

/** The tokens' precision. */
const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;
const SHARE_DECIMALS = 6;
const MS_PER_MINUTE = 60_000;
const PERCENT = 100;

export function decide(previous: Previous | null, price: PriceReading, policy: Policy): SentinelDecision {
	const before = previous?.after ?? INITIAL_PORTFOLIO;
	const lastRebalanceAt = previous?.lastRebalanceAt ?? null;
	const solShare = solShareOf(before, price.usd);
	const reason = rebalanceReason(solShare, lastRebalanceAt, price.observedAt, policy);
	const trade = reason && tradeToTarget(before, price.usd, policy.targetSolShare);
	const inputs = { price, policy, before: { ...before, solShare: round(solShare, SHARE_DECIMALS) } };
	if (!reason || !trade) return { action: 'HOLD', ...inputs, after: before, lastRebalanceAt };
	return {
		action: 'REBALANCE',
		reason,
		...inputs,
		trade,
		after: applyTrade(before, trade),
		lastRebalanceAt: price.observedAt
	};
}

export function summarize(decision: SentinelDecision): string {
	const at = `@ $${decision.price.usd.toFixed(2)}`;
	const share = percent(decision.before.solShare);
	if (decision.action === 'HOLD' || !decision.trade) {
		return `HOLD ${at} (SOL ${share}, band ±${(decision.policy.driftThreshold * PERCENT).toFixed(2)} pp)`;
	}
	const { side, sol } = decision.trade;
	const afterShare = percent(solShareOf(decision.after, decision.price.usd));
	return `REBALANCE (${decision.reason}): ${side.toLowerCase()} ${sol.toFixed(3)} SOL ${at} (SOL ${share} → ${afterShare})`;
}

function rebalanceReason(
	solShare: number,
	lastRebalanceAt: string | null,
	now: string,
	policy: Policy
): 'drift' | 'schedule' | null {
	if (Math.abs(solShare - policy.targetSolShare) > policy.driftThreshold) return 'drift';
	if (lastRebalanceAt === null) return 'schedule';
	const sinceLastMs = Date.parse(now) - Date.parse(lastRebalanceAt);
	return sinceLastMs >= policy.scheduleMinutes * MS_PER_MINUTE ? 'schedule' : null;
}

/** The trade that brings the SOL share back to the target; null when it rounds to nothing. */
function tradeToTarget(portfolio: Portfolio, usd: number, targetSolShare: number): Trade | null {
	const targetSol = (totalValue(portfolio, usd) * targetSolShare) / usd;
	const excessSol = round(portfolio.sol - targetSol, SOL_DECIMALS);
	if (excessSol === 0) return null;
	const sol = Math.abs(excessSol);
	return { side: excessSol > 0 ? 'SELL' : 'BUY', sol, usdc: round(sol * usd, USDC_DECIMALS) };
}

function applyTrade(portfolio: Portfolio, { side, sol, usdc }: Trade): Portfolio {
	const solOut = side === 'SELL' ? 1 : -1;
	return {
		sol: round(portfolio.sol - solOut * sol, SOL_DECIMALS),
		usdc: round(portfolio.usdc + solOut * usdc, USDC_DECIMALS)
	};
}

function solShareOf(portfolio: Portfolio, usd: number): number {
	return (portfolio.sol * usd) / totalValue(portfolio, usd);
}

function totalValue({ sol, usdc }: Portfolio, usd: number): number {
	return sol * usd + usdc;
}

function round(value: number, decimals: number): number {
	return Number(value.toFixed(decimals));
}

function percent(share: number): string {
	return `${(share * PERCENT).toFixed(2)}%`;
}
