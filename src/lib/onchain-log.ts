// The page's on-chain log: the selected agent's guard transactions that landed, newest first.

import type { GuardEvent } from './server/modules/agent-guard/guard';

export interface OnchainLogItem {
	/** The transaction signature. */
	id: string;
	agentId: string;
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

/** About ten minutes of one agent stepping every 10 s. */
export const ONCHAIN_LOG_LIMIT = 50;

const EXPLORER_CLUSTER = 'devnet';

export function explorerTxUrl(signature: string): string {
	return `https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`;
}
