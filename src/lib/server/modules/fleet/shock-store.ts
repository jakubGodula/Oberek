/** The largest shock the demo accepts, in percent of the price, either way. */
const MAX_SHOCK_PCT = 50;

/**
 * One-off simulated price shocks for the demo: armed from the page, claimed by the agent's next cycle. Kept in memory;
 * a server restart drops an armed shock.
 */
export class ShockStore {
	private readonly armed = new Map<string, number>();

	arm(agentId: string, pct: number): void {
		this.armed.set(agentId, pct);
	}

	/** The armed shock, which this call disarms; null when none is armed. */
	claim(agentId: string): number | null {
		const pct = this.armed.get(agentId);
		this.armed.delete(agentId);
		return pct ?? null;
	}

	isArmed(agentId: string): boolean {
		return this.armed.has(agentId);
	}
}

/** The shock in a request body: a finite, non-zero percent, at most 50 either way; null otherwise. */
export function parseShockPct(body: unknown): number | null {
	const pct = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).pct : undefined;
	const valid = typeof pct === 'number' && Number.isFinite(pct) && pct !== 0 && Math.abs(pct) <= MAX_SHOCK_PCT;
	return valid ? (pct as number) : null;
}
