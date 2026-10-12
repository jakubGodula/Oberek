// One-off simulated Jito proposals for the demo: armed from the page, claimed by the agent's next cycle. Kept in
// memory; a server restart drops an armed proposal. A later arm replaces the one waiting. The direction is the
// steward's simulated reading of the proposal, positive or negative for JitoSOL holders.

export type ProposalReading = 'positive' | 'negative';

export class ProposalStore {
	private readonly armed = new Map<string, ProposalReading>();

	arm(agentId: string, direction: ProposalReading): void {
		this.armed.set(agentId, direction);
	}

	/** The armed proposal, which this call disarms; null when none is armed. */
	claim(agentId: string): ProposalReading | null {
		const direction = this.armed.get(agentId);
		this.armed.delete(agentId);
		return direction ?? null;
	}

	direction(agentId: string): ProposalReading | null {
		return this.armed.get(agentId) ?? null;
	}
}

/** The reading in a request body: `positive` or `negative`; null otherwise. */
export function parseProposalReading(body: unknown): ProposalReading | null {
	const direction = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).direction : undefined;
	return direction === 'positive' || direction === 'negative' ? direction : null;
}
