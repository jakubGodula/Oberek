import type { FeedEntry, OperatorAction } from '../../../fleet-feed';
import type { LandedTransaction } from '../agent-guard/guard';
import type { DecisionLogEntry } from './fleet';

// Every guard transaction that landed while this server ran, told by the guard itself, so nothing that did not reach
// the chain gets in. The page's decision feed takes its transaction links and the owner's kills and resumes from it.
// Kept in memory; a restart starts it empty.

export interface LoggedTransaction extends LandedTransaction {
	/** When the server saw it land, in ms. */
	landedAt: number;
}

/** Sentinel steps at most every 10 s: 500 transactions keep over an hour of one agent. */
const DEFAULT_CAPACITY = 500;

export class OnchainLog {
	private readonly transactions: LoggedTransaction[] = [];

	constructor(
		private readonly now: () => number = Date.now,
		private readonly capacity = DEFAULT_CAPACITY
	) {}

	record(transaction: LandedTransaction): void {
		this.transactions.push({ ...transaction, landedAt: this.now() });
		if (this.transactions.length > this.capacity) this.transactions.shift();
	}

	/** The agent's transactions, oldest first. */
	ofAgent(agentId: string): LoggedTransaction[] {
		return this.transactions.filter((transaction) => transaction.agentId === agentId);
	}
}

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
			event !== 'StepRecorded' && counter >= oldestCounter ? [{ event, counter, signature, landedAt }] : []
		)
	};
}

/** With no decision shown, every kill and resume belongs. */
function oldestCounterOf(entries: DecisionLogEntry[]): number {
	return entries.length === 0 ? 0 : Math.min(...entries.map((entry) => entry.record.counter));
}
