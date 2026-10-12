// Getting Sentinel to propose the trade the test's price shock causes. A proposal at the real price may wait first: the
// rebound after an earlier shock was approved at the shocked price, or a drift a rejection left in place. Approving it
// brings the treasury back to its target, so the armed shock (kept while a proposal waits) is proposed next. Pure.

export interface PendingProposal {
	counter: number;
	/** Sentinel's decision; its price carries `simulatedShock` when the shock was applied (agents/sentinel/policy.ts). */
	decision: { price?: { usd: number; simulatedShock?: unknown } };
}

export type TowardShock = { kind: 'wait' } | { kind: 'shock'; counter: number } | { kind: 'approve'; counter: number };

export function towardShockProposal(pending: PendingProposal | null): TowardShock {
	if (!pending) return { kind: 'wait' };
	const kind = pending.decision.price?.simulatedShock ? 'shock' : 'approve';
	return { kind, counter: pending.counter };
}
