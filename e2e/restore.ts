// Before and after every e2e test the test fleet goes back to its starting state: every agent active, no proposal
// waiting, no price shock armed. A run stopped half-way (after a kill, or with a proposal open) is cleaned up by the
// next one. Pure: the fixture sends the requests.
import type { AgentStatusRecord, FleetDetails } from '../src/lib/server/modules/solana-blink/blink.service';
import type { PendingProposal } from './proposals';

/** The part of a card in GET /api/agents the tests use. */
export interface FleetCard extends Pick<AgentStatusRecord, 'id' | 'name' | 'status' | 'currentTask'> {
	fleet: Pick<FleetDetails, 'queued' | 'shockArmed'> & { pendingProposal: PendingProposal | null };
}

export interface RestoreRequest {
	path: string;
	body: Record<string, unknown>;
}

/** A killed agent shows PAUSED even with a proposal waiting, so it is resumed first. */
export function restoreRequests(cards: readonly FleetCard[]): RestoreRequest[] {
	return cards.flatMap((card) => [...resumeIfKilled(card), ...rejectIfWaiting(card), ...disarmShock(card)]);
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

/** Claimed as the agent claims it, which disarms it: the server has no other way to drop an armed shock. */
function disarmShock(card: FleetCard): RestoreRequest[] {
	return card.fleet.shockArmed ? [{ path: `/api/agents/${card.id}/shock/claim`, body: {} }] : [];
}
