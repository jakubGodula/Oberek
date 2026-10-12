import { NO_DECISION, type GuardStatus } from '../agent-guard/guard';
import { proposalAwaiting, recordVerdict, type VerdictRequest } from '../fleet/approval';
import { findFleetRuntime, getFleetRuntime, paceStore, proposalStore, quietStore, shockStore } from '../fleet/app-runtime';
import { quietSummary } from '../fleet/quiet-store';
import type { FleetEntry } from '../fleet/fleet';
import { controlAgent as controlFleetAgent, type ControlAction } from '../fleet/control';
import { batchSizeOf } from '../fleet/latest-decision';
import type { FleetRuntime } from '../fleet/submit-decision';

export interface AgentStatusRecord {
  id: string;
  name: string;
  /**
   * UNAVAILABLE: a fleet agent whose guard account could not be read (e.g. the Solana RPC failed).
   * AWAITING_APPROVAL: a fleet agent stopped on its own proposal until the owner's verdict.
   */
  status: 'ACTIVE' | 'PAUSED' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
  currentTask: string;
  /** Address of the account holding the agent's ML-DSA-44 public key; null when the guard could not be read. */
  pqcKeyAccount: string | null;
  lastCommitmentRoot: string;
  /** Decisions under the Merkle root `lastCommitmentRoot` holds; null when it is a single decision's hash. */
  lastBatchSize: number | null;
  lastUpdated: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionsExecuted: number;
  fleet: FleetDetails;
}

export interface FleetDetails {
  pendingProposal: { counter: number; summary: string; decision: Record<string, unknown> } | null;
  shockArmed: boolean;
  /** The simulated Jito proposal waiting for the agent's next cycle; null when none is armed. */
  proposalArmed: 'positive' | 'negative' | null;
  /** Quiet cycles since the last recorded decision; null when the agent has just voted or has not reported one. */
  quiet: { count: number; at: number } | null;
  /** The kind of the agent's newest logged decision (e.g. "sentinel"); null before its first. */
  lastDecisionKind: string | null;
  /** Decisions waiting in the server's buffer for the next batch. */
  queued: number;
  /** Its decisions go on-chain in batches (BATCHED_AGENT_IDS). */
  batched: boolean;
  /** The pause between ticks picked on the speed wheel; null while the agent keeps its own. */
  paceMs: number | null;
}

// Agents registered in the fleet (scripts/fleet.ts) run as their own processes; their state comes from the guard.
/**
 * A killed or not yet activated agent shows as PAUSED even with a proposal waiting; the proposal shows again once it
 * is active.
 */
function cardStatus(guardStatus: GuardStatus, awaitingApproval: boolean): AgentStatusRecord['status'] {
  if (guardStatus !== 'Active') return 'PAUSED';
  return awaitingApproval ? 'AWAITING_APPROVAL' : 'ACTIVE';
}
const NO_DECISION_YET = 'No decisions yet: the agent has not run';

/** One unreadable agent shows as UNAVAILABLE instead of failing the whole list. */
async function toAgentStatusRecord(runtime: FleetRuntime, entry: FleetEntry): Promise<AgentStatusRecord> {
  const last = runtime.fleet.lastDecision(entry.id);
  const quiet = quietStore.get(entry.id);
  const card = {
    id: entry.id,
    name: entry.name,
    currentTask: quiet ? quietSummary(quiet.count) : (last?.record.summary ?? NO_DECISION_YET),
    lastUpdated: quiet?.at ?? (last ? Date.parse(last.record.observedAt) : entry.registeredAt),
    riskLevel: entry.riskLevel
  };
  const fleet = {
    shockArmed: shockStore.isArmed(entry.id),
    proposalArmed: proposalStore.direction(entry.id),
    quiet,
    lastDecisionKind: last?.record.kind ?? null,
    queued: runtime.batcher?.queued(entry.id) ?? 0,
    batched: runtime.batcher?.batches(entry.id) ?? false,
    paceMs: paceStore.get(entry.id)
  };
  try {
    const account = await runtime.guard.readAgent(entry.id);
    const proposal = proposalAwaiting(runtime.fleet, entry.id, account);
    const pendingProposal = proposal && {
      counter: proposal.record.counter,
      summary: proposal.record.summary,
      decision: proposal.record.decision
    };
    return {
      ...card,
      status: cardStatus(account.status, proposal !== null),
      pqcKeyAccount: account.agentKey,
      lastCommitmentRoot: account.lastDecision,
      lastBatchSize: batchSizeOf(runtime.fleet, entry.id, account.lastDecision),
      actionsExecuted: account.counter,
      fleet: { ...fleet, pendingProposal }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...card,
      status: 'UNAVAILABLE',
      currentTask: `Unavailable: ${reason}`,
      pqcKeyAccount: null,
      lastCommitmentRoot: NO_DECISION,
      lastBatchSize: null,
      actionsExecuted: 0,
      fleet: { ...fleet, pendingProposal: null }
    };
  }
}

export class BlinkService {
  async getAgent(agentId: string): Promise<AgentStatusRecord | undefined> {
    const runtime = await findFleetRuntime();
    const fleetEntry = runtime?.fleet.get(agentId);
    return runtime && fleetEntry ? toAgentStatusRecord(runtime, fleetEntry) : undefined;
  }

  async listAgents(): Promise<AgentStatusRecord[]> {
    const runtime = await findFleetRuntime();
    if (!runtime) return [];
    return Promise.all(runtime.fleet.list().map((entry) => toAgentStatusRecord(runtime, entry)));
  }

  /**
   * The owner's verdict on a fleet agent's proposal: recorded on chain as the agent's next step and in its log. A
   * verdict naming another proposal than the waiting one is refused.
   */
  async decideProposal(agentId: string, { verdict, counter }: VerdictRequest): Promise<{ counter: number }> {
    const { record } = await recordVerdict(await getFleetRuntime(), agentId, verdict, counter);
    return { counter: record.counter };
  }

  /** The owner's kill switch, through the guard. */
  async controlAgent(agentId: string, action: ControlAction): Promise<{ counter: number }> {
    return { counter: (await controlFleetAgent(await getFleetRuntime(), agentId, action)).counter };
  }
}

export const blinkService = new BlinkService();

