/** A step refused because the agent submitted again too soon. Server policy, not a rule of the guard. */
export class RateLimitedError extends Error {
	constructor(
		agentId: string,
		readonly retryAfterMs: number
	) {
		super(`agent ${agentId} submitted too soon; retry in ${Math.ceil(retryAfterMs / 1000)} s`);
	}
}

/**
 * At most one step per agent per interval. The server pays every step on devnet and cannot trust an agent to pace
 * itself, so the limit lives here. Kept in memory: a server restart lets at most one extra step through.
 */
export class StepThrottle {
	private readonly lastClaimAt = new Map<string, number>();

	constructor(private readonly minIntervalMs: number) {}

	/** Synchronous check-and-set, so two concurrent submissions cannot both pass. */
	claim(agentId: string, nowMs: number): void {
		const last = this.lastClaimAt.get(agentId);
		if (last !== undefined && nowMs - last < this.minIntervalMs) {
			throw new RateLimitedError(agentId, last + this.minIntervalMs - nowMs);
		}
		this.lastClaimAt.set(agentId, nowMs);
	}
}
