import { NO_DECISION, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, Fleet } from './fleet';

// Approvals: an agent marks a decision as a proposal and stops; the owner accepts or rejects it. The server is the gate,
// since agents reach the chain only through it.

/** The agent submitted a decision while its proposal waits for the owner's verdict. */
export class AwaitingApprovalError extends Error {}

/**
 * The proposal waiting for a verdict: the decision recorded on chain last, when it requires approval. A hash the log
 * does not hold counts as none here; `latestDecision` reports that disagreement.
 */
export function proposalAwaiting(fleet: Fleet, agentId: string, account: GuardAccount): DecisionLogEntry | null {
	if (account.lastDecision === NO_DECISION) return null;
	const entry = fleet.findDecision(agentId, account.lastDecision);
	return entry?.record.requiresApproval ? entry : null;
}
