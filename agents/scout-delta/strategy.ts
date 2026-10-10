// Scout Delta's rule: buy after a drop, sell after a rise, otherwise hold. Pure functions, no network.

export type Action = 'BUY' | 'SELL' | 'HOLD';

export interface Decision {
	action: Action;
	amountSol: number;
	priceUsd: number;
	changePercent: number;
}

/** A move of at least this size (in percent) triggers a trade. */
export const TRADE_THRESHOLD_PERCENT = 1.5;
export const TRADE_SIZE_SOL = 0.5;

export function decide(previousPriceUsd: number, priceUsd: number): Decision {
	const changePercent = round2(((priceUsd - previousPriceUsd) / previousPriceUsd) * 100);
	const action = actionFor(changePercent);
	const amountSol = action === 'HOLD' ? 0 : TRADE_SIZE_SOL;
	return { action, amountSol, priceUsd: round2(priceUsd), changePercent };
}

function actionFor(changePercent: number): Action {
	if (changePercent <= -TRADE_THRESHOLD_PERCENT) return 'BUY';
	if (changePercent >= TRADE_THRESHOLD_PERCENT) return 'SELL';
	return 'HOLD';
}

/** One line for the log and the GUI card. */
export function summarize(decision: Decision): string {
	const change = `${decision.changePercent >= 0 ? '+' : ''}${decision.changePercent.toFixed(2)}%`;
	const trade = decision.action === 'HOLD' ? 'HOLD' : `${decision.action} ${decision.amountSol} SOL`;
	return `${trade} at ${decision.priceUsd.toFixed(2)} USD (${change})`;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}
