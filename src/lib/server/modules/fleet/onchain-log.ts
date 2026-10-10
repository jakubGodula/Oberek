import type { OnchainLogItem } from '../../../onchain-log';
import type { LandedTransaction } from '../agent-guard/guard';
import { APPROVAL_KIND, type Verdict } from './approval';
import type { DecisionLogEntry, Fleet } from './fleet';

// The page's on-chain log: every guard transaction that landed while this server ran, told by the guard itself, so
// nothing that did not reach the chain gets in. Kept in memory; a restart starts it empty.

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

	/** The newest transactions first, at most `limit`, optionally of one agent. */
	recent(limit: number, agentId?: string): LoggedTransaction[] {
		const transactions = agentId
			? this.transactions.filter((transaction) => transaction.agentId === agentId)
			: this.transactions;
		return transactions.slice(-limit).reverse();
	}
}

/** Adds what the chain does not hold: the agent's name and, for a step, its summary from the decision log. */
export function describeTransactions(transactions: LoggedTransaction[], fleet: Fleet): OnchainLogItem[] {
	const findDecision = decisionLookup(fleet);
	return transactions.map((transaction) => {
		const { agentId, decisionHash } = transaction;
		const item: OnchainLogItem = {
			...transaction,
			id: transaction.signature,
			agentName: fleet.get(agentId)?.name ?? agentId
		};
		const entry = decisionHash ? findDecision(agentId, decisionHash) : undefined;
		return entry ? { ...item, summary: entry.record.summary, ...verdictOf(entry) } : item;
	});
}

/** Reads each agent's decision log once, not once per step. */
function decisionLookup(fleet: Fleet): (agentId: string, decisionHash: string) => DecisionLogEntry | undefined {
	const byAgent = new Map<string, Map<string, DecisionLogEntry>>();
	return (agentId, decisionHash) => {
		if (!byAgent.has(agentId)) {
			byAgent.set(agentId, new Map(fleet.decisions(agentId).map((entry) => [entry.decisionHash, entry])));
		}
		return byAgent.get(agentId)!.get(decisionHash);
	};
}

function verdictOf(entry: DecisionLogEntry): { verdict?: Verdict } {
	const verdict = entry.record.decision.verdict;
	const isVerdict = entry.record.kind === APPROVAL_KIND && (verdict === 'accept' || verdict === 'reject');
	return isVerdict ? { verdict } : {};
}
