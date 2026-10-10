import { createHash } from 'crypto';
import { GuardError, type AgentGuard } from '../agent-guard/guard';
import type { DecisionRecord, Fleet } from './fleet';
import type { StepThrottle } from './step-throttle';

/** What an agent process sends: its own kind, its decision and one line describing it. */
export interface DecisionSubmission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
}

export interface FleetRuntime {
	guard: AgentGuard;
	fleet: Fleet;
	throttle: StepThrottle;
	now(): Date;
}

/**
 * Hashes the agent's decision and records the step with the guard, which refuses it while the agent is killed. The
 * log keeps the full record, so anyone can recompute the hash the guard holds.
 */
export async function submitDecision(
	runtime: FleetRuntime,
	agentId: string,
	submission: DecisionSubmission
): Promise<{ counter: number }> {
	if (!runtime.fleet.get(agentId)) throw new GuardError('AgentNotFound', `agent ${agentId} is not in the fleet`);
	runtime.throttle.claim(agentId, runtime.now().getTime());
	const account = await runtime.guard.readAgent(agentId);
	const record: DecisionRecord = {
		agent: agentId,
		counter: account.counter + 1,
		...submission,
		observedAt: runtime.now().toISOString()
	};
	const decisionHash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
	let recorded;
	try {
		recorded = await runtime.guard.recordStep(agentId, record.counter, decisionHash);
	} catch (error) {
		// A refusal is a verdict: nothing was recorded. Any other failure (e.g. a confirmation timeout on the chain) may
		// still end with the step recorded, and the log is the only way to recompute its hash.
		if (!(error instanceof GuardError)) runtime.fleet.appendDecision(agentId, { record, decisionHash, unconfirmed: true });
		throw error;
	}
	runtime.fleet.appendDecision(agentId, { record, decisionHash });
	return { counter: recorded.counter };
}

/** Returns the submission with exactly its three fields, or null when the body does not have that shape. */
export function parseSubmission(body: unknown): DecisionSubmission | null {
	if (!isPlainObject(body)) return null;
	const { kind, decision, summary } = body;
	if (typeof kind !== 'string' || kind === '' || typeof summary !== 'string' || !isPlainObject(decision)) return null;
	return { kind, decision, summary };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
