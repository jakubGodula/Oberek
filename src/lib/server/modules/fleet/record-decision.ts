import { createHash } from 'crypto';
import { GuardError, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, DecisionRecord } from './fleet';
import { AwaitingApprovalError, proposalAwaiting } from './approval';
import { merkleProof, merkleRoot } from './merkle';
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
	submission: DecisionSubmission,
	observedAt = runtime.now().toISOString()
): Promise<DecisionLogEntry> {
	const record: DecisionRecord = {
		agent: agentId,
		counter: account.counter + 1,
		...submission,
		observedAt
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

/** A decision a batched agent submitted, waiting in the buffer for the next flush. */
export interface QueuedDecision {
	submission: DecisionSubmission;
	observedAt: string;
}

/**
 * Records the buffered decisions as the agent's next step: one signature over their Merkle root (a lone decision goes
 * as a single step). Logs each record with
 * its proof, so anyone can check a single decision against the root on-chain without the rest of the batch.
 */
export async function flushBatch(
	runtime: FleetRuntime,
	agentId: string,
	queued: readonly QueuedDecision[]
): Promise<DecisionLogEntry[]> {
	if (queued.length === 0) return [];
	const account = await runtime.guard.readAgent(agentId);
	// A batch landing after a proposal would bury it: the agent would go on without the owner's verdict.
	if (proposalAwaiting(runtime.fleet, agentId, account)) {
		throw new AwaitingApprovalError(`agent ${agentId} is waiting for the owner's verdict; batch of ${queued.length} dropped`);
	}
	// A tree over one decision adds nothing: it goes as a single step, as without batching.
	if (queued.length === 1) {
		const [{ submission, observedAt }] = queued;
		return [await recordDecision(runtime, agentId, account, submission, observedAt)];
	}
	runtime.fleet.assertSealed(agentId);
	const counter = account.counter + 1;
	const records: DecisionRecord[] = queued.map(({ submission, observedAt }, index) => ({
		agent: agentId,
		counter,
		index,
		...submission,
		observedAt
	}));
	const hashes = records.map(hashDecisionRecord);
	const root = merkleRoot(hashes);
	const entries = records.map((record, index) => ({
		record,
		decisionHash: hashes[index],
		batch: { root, size: records.length, proof: merkleProof(hashes, index) }
	}));
	try {
		await runtime.guard.recordBatch(agentId, counter, root, records.length);
	} catch (error) {
		// As for a single step: a refusal recorded nothing; any other failure may still end with the batch on-chain.
		if (!(error instanceof GuardError)) {
			for (const entry of entries) runtime.fleet.appendDecision(agentId, { ...entry, unconfirmed: true });
		}
		throw error;
	}
	for (const entry of entries) runtime.fleet.appendDecision(agentId, entry);
	return entries;
}
