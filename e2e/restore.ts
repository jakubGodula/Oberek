// Before and after every e2e test the test fleet goes back to its starting state: every agent active, no proposal
// waiting. A run stopped half-way (after a kill, or with a proposal open) is cleaned up by the next one. Pure: the
// fixture sends the requests.
import type { PendingProposal } from './proposals';

export interface FleetCard {
	id: string;
	status: 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
	currentTask: string;
	/** `queued`: decisions in the server's buffer, waiting for the agent's next batch. */
	fleet: { pendingProposal: PendingProposal | null; queued: number };
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

/**
 * Agents with decisions still waiting for their batch. A stopped agent's last batch lands up to a flush later, so a test
 * that ends with one would see it land in the next test.
 */
export function queuedAgents(cards: readonly FleetCard[]): string[] {
	return cards.filter((card) => card.fleet.queued > 0).map((card) => card.id);
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
