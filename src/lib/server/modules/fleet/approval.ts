import { NO_DECISION, type GuardAccount } from '../agent-guard/guard';
import type { DecisionLogEntry, Fleet } from './fleet';
import { assertInFleet, recordDecision } from './record-decision';
import type { FleetRuntime } from './submit-decision';

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

export type Verdict = 'accept' | 'reject';

export const APPROVAL_KIND = 'approval';
const VERDICT_LABELS: Record<Verdict, string> = { accept: 'APPROVED', reject: 'REJECTED' };

/**
 * Agents whose verdict is being recorded. A second verdict meanwhile (a double click, two tabs) is refused here: on
 * chain it would only fail after paying for its transaction.
 */
const verdictsInFlight = new Set<string>();

/** A verdict arrived while no proposal waits (none was made, or it was already decided). */
export class NoPendingProposalError extends Error {}

/**
 * Records the owner's verdict on the waiting proposal as the agent's next step. Not throttled: like kill and resume it
 * is the owner acting. The guard refuses it while the agent is killed.
 */
export async function recordVerdict(
	runtime: FleetRuntime,
	agentId: string,
	verdict: Verdict
): Promise<DecisionLogEntry> {
	assertInFleet(runtime, agentId);
	if (verdictsInFlight.has(agentId)) {
		throw new NoPendingProposalError(`agent ${agentId}: a verdict on its proposal is already being recorded`);
	}
	verdictsInFlight.add(agentId);
	try {
		return await recordVerdictOnChain(runtime, agentId, verdict);
	} finally {
		verdictsInFlight.delete(agentId);
	}
}

async function recordVerdictOnChain(runtime: FleetRuntime, agentId: string, verdict: Verdict): Promise<DecisionLogEntry> {
	const account = await runtime.guard.readAgent(agentId);
	const proposal = proposalAwaiting(runtime.fleet, agentId, account);
	if (!proposal) throw new NoPendingProposalError(`agent ${agentId} has no proposal waiting for a verdict`);
	const { counter, kind, decision, summary } = proposal.record;
	return recordDecision(runtime, agentId, account, {
		kind: APPROVAL_KIND,
		decision: {
			verdict,
			proposal: { counter, decisionHash: proposal.decisionHash, kind, decision, summary },
			decidedBy: account.owner
		},
		summary: `${VERDICT_LABELS[verdict]}: ${summary}`
	});
}

export function parseVerdict(body: unknown): Verdict | null {
	const verdict = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).verdict : undefined;
	return verdict === 'accept' || verdict === 'reject' ? verdict : null;
}
