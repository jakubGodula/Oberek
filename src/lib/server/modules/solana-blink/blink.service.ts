import { pqcCrypto } from '../zk-pqc/pqc-crypto.service';
import { GuardError, NO_DECISION, type GuardStatus } from '../agent-guard/guard';
import { proposalAwaiting, recordVerdict, type VerdictRequest } from '../fleet/approval';
import { findFleetRuntime, getFleetRuntime, paceStore, shockStore } from '../fleet/app-runtime';
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
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE' | 'AWAITING_APPROVAL';
  currentTask: string;
  /** Address of the account holding the agent's ML-DSA-44 public key; null when the guard could not be read. */
  pqcKeyAccount: string | null;
  lastCommitmentRoot: string;
  /** Decisions under the Merkle root `lastCommitmentRoot` holds; null when it is a single decision's hash. */
  lastBatchSize: number | null;
  lastUpdated: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionsExecuted: number;
  /** Only on fleet agents. */
  fleet?: FleetDetails;
}

export interface FleetDetails {
  pendingProposal: { counter: number; summary: string; decision: Record<string, unknown> } | null;
  shockArmed: boolean;
  /** The kind of the agent's newest logged decision (e.g. "sentinel"); null before its first. */
  lastDecisionKind: string | null;
  /** Decisions waiting in the server's buffer for the next batch. */
  queued: number;
  /** Its decisions go on-chain in batches (BATCHED_AGENT_IDS). */
  batched: boolean;
  /** The pause between ticks picked on the speed wheel; null while the agent keeps its own. */
  paceMs: number | null;
}

function genPqcHash(): string {
  return Buffer.from(pqcCrypto.computePubkeyHash(pqcCrypto.generateDsaKeys().publicKey)).toString('hex');
}

function genRoot(payload: Record<string, unknown>): string {
  return pqcCrypto.computeStateCommitment(payload).hexRoot;
}

// In-memory store: the two mock agents not yet replaced by fleet agents
const agentsStore: Map<string, AgentStatusRecord> = new Map([
  [
    'arbiter-02',
    {
      id: 'arbiter-02',
      name: 'Arbiter Beta — DeFi Optimizer',
      status: 'ACTIVE',
      currentTask: 'Cross-DEX arbitrage: Raydium ↔ Orca, spread 0.34%',
      pqcKeyAccount: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'arbiter-02', task: 'ARB_SCAN', timestamp: Date.now() }),
      lastBatchSize: null,
      lastUpdated: Date.now() - 30_000,
      riskLevel: 'HIGH',
      actionsExecuted: 182
    }
  ],
  [
    'guardian-03',
    {
      id: 'guardian-03',
      name: 'Guardian Gamma — Risk Monitor',
      status: 'IDLE',
      currentTask: 'Portfolio exposure monitoring, no active alerts',
      pqcKeyAccount: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'guardian-03', task: 'MONITOR', timestamp: Date.now() }),
      lastBatchSize: null,
      lastUpdated: Date.now() - 120_000,
      riskLevel: 'LOW',
      actionsExecuted: 9
    }
  ]
]);

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
  const card = {
    id: entry.id,
    name: entry.name,
    currentTask: last?.record.summary ?? NO_DECISION_YET,
    lastUpdated: last ? Date.parse(last.record.observedAt) : entry.registeredAt,
    riskLevel: entry.riskLevel
  };
  const fleet = {
    shockArmed: shockStore.isArmed(entry.id),
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
    return runtime && fleetEntry ? toAgentStatusRecord(runtime, fleetEntry) : agentsStore.get(agentId);
  }

  async listAgents(): Promise<AgentStatusRecord[]> {
    const runtime = await findFleetRuntime();
    if (!runtime) return [...agentsStore.values()];
    const fleetAgents = await Promise.all(runtime.fleet.list().map((entry) => toAgentStatusRecord(runtime, entry)));
    // Real agents first; the mocks follow until Arbiter and Guardian replace them.
    return [...fleetAgents, ...agentsStore.values()];
  }

  /**
   * The owner's verdict on a fleet agent's proposal: recorded on chain as the agent's next step and in its log. A
   * verdict naming another proposal than the waiting one is refused.
   */
  async decideProposal(agentId: string, { verdict, counter }: VerdictRequest): Promise<{ counter: number }> {
    const { record } = await recordVerdict(await getFleetRuntime(), agentId, verdict, counter);
    return { counter: record.counter };
  }

  /** The owner's kill switch. A fleet agent goes through the guard; a mock agent only changes its card. */
  async controlAgent(agentId: string, action: ControlAction): Promise<{ counter: number }> {
    const runtime = await findFleetRuntime();
    if (runtime?.fleet.get(agentId)) return { counter: (await controlFleetAgent(runtime, agentId, action)).counter };
    return { counter: this.controlMockAgent(agentId, action) };
  }

  /** Arbiter and Guardian: kill pauses the card, resume activates it and counts one more step. */
  private controlMockAgent(agentId: string, action: ControlAction): number {
    const agent = agentsStore.get(agentId);
    if (!agent) throw new GuardError('AgentNotFound', `no agent ${agentId}`);
    agent.status = action === 'kill' ? 'PAUSED' : 'ACTIVE';
    if (action === 'resume') agent.actionsExecuted += 1;
    agent.lastUpdated = Date.now();
    agent.lastCommitmentRoot = pqcCrypto.computeStateCommitment({
      agentId,
      action,
      status: agent.status,
      timestamp: agent.lastUpdated
    }).hexRoot;
    return agent.actionsExecuted;
  }
}

export const blinkService = new BlinkService();

