// Quiet cycles for an agent that has nothing to record: counted in memory so the page can show one line instead of a
// transaction. A server restart drops the count. A recorded decision clears it.

export interface QuietStreak {
	count: number;
	/** When the latest quiet cycle was noted, in ms. */
	at: number;
}

export class QuietStore {
	private readonly streaks = new Map<string, QuietStreak>();

	/** Counts one more quiet cycle and returns the streak, including this one. */
	note(agentId: string, at = Date.now()): QuietStreak {
		const count = (this.streaks.get(agentId)?.count ?? 0) + 1;
		const streak = { count, at };
		this.streaks.set(agentId, streak);
		return streak;
	}

	clear(agentId: string): void {
		this.streaks.delete(agentId);
	}

	get(agentId: string): QuietStreak | null {
		return this.streaks.get(agentId) ?? null;
	}
}

/** The one line the page shows for a run of quiet cycles. */
export function quietSummary(count: number): string {
	return `No new proposals detected ×${count}`;
}
