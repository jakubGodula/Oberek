// How the page shows the on-chain log: every guard transaction that landed, newest first. An agent's consecutive
// steps fold into one group; the operator's actions (kill, resume, a verdict) always keep a row of their own.

import type { GuardEvent } from './server/modules/agent-guard/guard';

export interface OnchainLogItem {
	/** The transaction signature. */
	id: string;
	agentId: string;
	agentName: string;
	event: GuardEvent;
	counter: number;
	signature: string;
	/** When the server saw the transaction land, in ms. */
	landedAt: number;
	/** Steps only. */
	decisionHash?: string;
	/** Steps only, from the decision log; absent when the log does not hold the hash. */
	summary?: string;
	/** Set on a step that records the owner's verdict on a proposal. */
	verdict?: 'accept' | 'reject';
}

export type OnchainLogRow =
	| { type: 'action'; item: OnchainLogItem }
	/** `key` follows the oldest step, which stays put while newer steps join the group. */
	| { type: 'steps'; key: string; agentId: string; agentName: string; items: OnchainLogItem[] };

/** Enough transactions for a few groups of steps around the operator's actions. */
export const ONCHAIN_LOG_LIMIT = 100;

const EXPLORER_CLUSTER = 'devnet';

export function explorerTxUrl(signature: string): string {
	return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}

/** The agent's own decision, as opposed to what the operator did. */
export function isAgentStep(item: OnchainLogItem): boolean {
	return item.event === 'StepRecorded' && item.verdict === undefined;
}

/** Groups the newest-first items into rows, keeping their order. */
export function groupOnchainLog(items: OnchainLogItem[]): OnchainLogRow[] {
	const runs: OnchainLogItem[][] = [];
	for (const item of items) {
		const run = runs.at(-1);
		if (run && isAgentStep(item) && isAgentStep(run[0]) && run[0].agentId === item.agentId) run.push(item);
		else runs.push([item]);
	}
	return runs.map(toRow);
}

/** A run is one operator action or one agent's consecutive steps. */
function toRow(run: OnchainLogItem[]): OnchainLogRow {
	const [first] = run;
	if (!isAgentStep(first)) return { type: 'action', item: first };
	const key = `${first.agentId}:${run.at(-1)!.counter}`;
	return { type: 'steps', key, agentId: first.agentId, agentName: first.agentName, items: run };
}
