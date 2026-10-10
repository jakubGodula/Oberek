import { GuardError, NO_DECISION } from '../agent-guard/guard';
import type { DecisionLogEntry } from './fleet';
import type { FleetRuntime } from './submit-decision';

/** The chain holds a decision hash that no entry of the agent's log has: the log and the chain disagree. */
export class DecisionNotInLogError extends Error {}

/**
 * The agent's last decision recorded on chain: the log entry whose hash the guard holds, so an entry edited in the log
 * cannot pass for it. Null before the agent's first step.
 */
export async function latestDecision(runtime: FleetRuntime, agentId: string): Promise<DecisionLogEntry | null> {
	if (!runtime.fleet.get(agentId)) throw new GuardError('AgentNotFound', `agent ${agentId} is not in the fleet`);
	const { lastDecision } = await runtime.guard.readAgent(agentId);
	if (lastDecision === NO_DECISION) return null;
	const entry = runtime.fleet.findDecision(agentId, lastDecision);
	if (!entry) {
		throw new DecisionNotInLogError(`agent ${agentId}: the decision ${lastDecision} recorded on chain is not in its log`);
	}
	return entry;
}
