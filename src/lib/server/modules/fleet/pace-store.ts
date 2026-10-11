import { paceStepsFor } from '../../../tick-pace';

/**
 * The pause between ticks the owner picked on the page's speed wheel, per agent; the agent reads it before each pause.
 * Kept in memory: after a server restart the agent goes back to its own default.
 */
export class PaceStore {
	private readonly paces = new Map<string, number>();

	set(agentId: string, intervalMs: number): void {
		this.paces.set(agentId, intervalMs);
	}

	get(agentId: string): number | null {
		return this.paces.get(agentId) ?? null;
	}
}

/** The pace in a request body when it is a step of the wheel for the agent; null otherwise. */
export function parsePaceMs(body: unknown, batched: boolean): number | null {
	const intervalMs = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).intervalMs : undefined;
	return typeof intervalMs === 'number' && paceStepsFor(batched).includes(intervalMs) ? intervalMs : null;
}
