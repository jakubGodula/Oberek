// Before and after every e2e test the test fleet goes back to its starting state: every agent active, no proposal
// waiting. A run stopped half-way (after a kill, or with a proposal open) is cleaned up by the next one. Pure: the
// fixture sends the requests.

export interface FleetCard {
	id: string;
	status: 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
	currentTask: string;
	fleet: { pendingProposal: { counter: number } | null };
}

export interface RestoreRequest {
	path: string;
	body: Record<string, unknown>;
}

/** A killed agent shows PAUSED even with a proposal waiting, so it is resumed first. */
export function restoreRequests(cards: readonly FleetCard[]): RestoreRequest[] {
	return cards.flatMap((card) => [...resumeIfKilled(card), ...rejectIfWaiting(card)]);
}

/** Agents the server could not read, with its reason: no test can rely on them. */
export function unavailable(cards: readonly FleetCard[]): string[] {
	return cards.filter((card) => card.status === 'UNAVAILABLE').map((card) => `${card.id} (${card.currentTask})`);
}

function resumeIfKilled(card: FleetCard): RestoreRequest[] {
	return card.status === 'PAUSED' ? [{ path: `/api/agents/${card.id}/control`, body: { action: 'resume' } }] : [];
}

function rejectIfWaiting(card: FleetCard): RestoreRequest[] {
	const pending = card.fleet.pendingProposal;
	return pending
		? [{ path: `/api/agents/${card.id}/approval`, body: { verdict: 'reject', counter: pending.counter } }]
		: [];
}
