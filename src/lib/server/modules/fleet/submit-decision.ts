import type { AgentGuard } from '../agent-guard/guard';
import { AwaitingApprovalError, proposalAwaiting } from './approval';
import type { Fleet } from './fleet';
import { assertInFleet, recordDecision } from './record-decision';
import type { StepThrottle } from './step-throttle';

/** What an agent process sends: its own kind, its decision, one line describing it and whether it must wait. */
export interface DecisionSubmission {
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
	/** The agent stops after this decision until the owner accepts or rejects it. */
	requiresApproval?: true;
}

export interface FleetRuntime {
	guard: AgentGuard;
	fleet: Fleet;
	throttle: StepThrottle;
	now(): Date;
}

/**
 * Records the agent's decision as its next step. Refused while its proposal waits for a verdict (before the throttle,
 * so a waiting agent spends nothing) and, by the guard, while the agent is killed.
 */
export async function submitDecision(
	runtime: FleetRuntime,
	agentId: string,
	submission: DecisionSubmission
): Promise<{ counter: number }> {
	assertInFleet(runtime, agentId);
	const account = await runtime.guard.readAgent(agentId);
	if (proposalAwaiting(runtime.fleet, agentId, account)) {
		throw new AwaitingApprovalError(`agent ${agentId} is waiting for the owner's verdict on its proposal`);
	}
	runtime.throttle.claim(agentId, runtime.now().getTime());
	const { record } = await recordDecision(runtime, agentId, account, submission);
	return { counter: record.counter };
}

/** Returns the submission with exactly its fields, or null when the body does not have that shape. */
export function parseSubmission(body: unknown): DecisionSubmission | null {
	if (!isPlainObject(body)) return null;
	const { kind, decision, summary, requiresApproval } = body;
	if (typeof kind !== 'string' || kind === '' || typeof summary !== 'string' || !isPlainObject(decision)) return null;
	if (requiresApproval === undefined) return { kind, decision, summary };
	return requiresApproval === true ? { kind, decision, summary, requiresApproval } : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
