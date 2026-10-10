import { createHash } from 'crypto';
import type { Address } from '@solana/kit';

// The agent's fixed rule: every cycle records a TICK. A real rule replaces tickDecision; the program only sees the
// 32-byte hash, so it does not change.

export interface DecisionRecord {
	agent: Address;
	counter: number;
	decision: 'TICK';
	observedAt: string;
}

export function tickDecision(agent: Address, counter: bigint, observedAt: Date): DecisionRecord {
	return { agent, counter: Number(counter), decision: 'TICK', observedAt: observedAt.toISOString() };
}

/** SHA-256 of the record as JSON with a fixed key order and no whitespace, so anyone can recompute it from the log. */
export function hashDecision(record: DecisionRecord): Uint8Array {
	const canonical = JSON.stringify({
		agent: record.agent,
		counter: record.counter,
		decision: record.decision,
		observedAt: record.observedAt
	});
	return new Uint8Array(createHash('sha256').update(canonical).digest());
}
