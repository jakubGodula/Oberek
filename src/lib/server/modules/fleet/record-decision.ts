import { createHash } from 'crypto';
import { GuardError, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, DecisionRecord } from './fleet';
import type { DecisionSubmission, FleetRuntime } from './submit-decision';

export function assertInFleet(runtime: FleetRuntime, agentId: string): void {
	if (!runtime.fleet.get(agentId)) throw new GuardError('AgentNotFound', `agent ${agentId} is not in the fleet`);
}

/** SHA-256 (hex) of the record as JSON, keys in the order the log keeps them. */
export function hashDecisionRecord(record: DecisionRecord): string {
	return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

/**
 * Hashes the decision as the agent's next step after `account`, records it with the guard and logs it. The log keeps
 * the full record, so anyone can recompute the hash the guard holds.
 */
export async function recordDecision(
	runtime: FleetRuntime,
	agentId: string,
	account: GuardAccount,
	submission: DecisionSubmission
): Promise<DecisionLogEntry> {
	const record: DecisionRecord = {
		agent: agentId,
		counter: account.counter + 1,
		...submission,
		observedAt: runtime.now().toISOString()
	};
	const decisionHash = hashDecisionRecord(record);
	// Before anything goes on-chain: a step whose record cannot be logged could never be backed.
	runtime.fleet.assertSealed(agentId);
	try {
		await runtime.guard.recordStep(agentId, record.counter, decisionHash);
	} catch (error) {
		// A refusal is a verdict: nothing was recorded. Any other failure (e.g. a confirmation timeout on the chain) may
		// still end with the step recorded, and the log is the only way to recompute its hash.
		if (!(error instanceof GuardError)) runtime.fleet.appendDecision(agentId, { record, decisionHash, unconfirmed: true });
		throw error;
	}
	const entry = { record, decisionHash };
	runtime.fleet.appendDecision(agentId, entry);
	return entry;
}
