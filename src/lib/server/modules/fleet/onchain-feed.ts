import type { FeedEntry, OperatorAction } from '../../../fleet-feed';
import type { DecisionLogEntry, LoggedTransaction } from './fleet';

// The page's on-chain feed: the agent's decisions joined with the guard transactions that recorded them, and the
// owner's kills and resumes among them. The fleet keeps both logs on disk.

/**
 * The feed's decisions with their transaction signatures, and the kills and resumes that belong among them: those
 * from the oldest decision shown on.
 */
export function withTransactions(
	entries: DecisionLogEntry[],
	transactions: LoggedTransaction[]
): { entries: FeedEntry[]; operatorActions: OperatorAction[] } {
	const stepSignatures = new Map(
		transactions.flatMap((transaction) =>
			transaction.event === 'StepRecorded' ? [[transaction.decisionHash, transaction.signature] as const] : []
		)
	);
	const oldestCounter = oldestCounterOf(entries);
	return {
		entries: entries.map((entry) => {
			const signature = stepSignatures.get(entry.decisionHash);
			return signature ? { ...entry, signature } : entry;
		}),
		operatorActions: transactions.flatMap(({ event, counter, signature, landedAt }) =>
			(event === 'AgentKilled' || event === 'AgentResumed') && counter >= oldestCounter
				? [{ event, counter, signature, landedAt }]
				: []
		)
	};
}

/** With no decision shown, every kill and resume belongs. */
function oldestCounterOf(entries: DecisionLogEntry[]): number {
	return entries.length === 0 ? 0 : Math.min(...entries.map((entry) => entry.record.counter));
}
