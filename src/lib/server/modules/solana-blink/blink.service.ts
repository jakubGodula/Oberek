import {
  type ActionGetResponse,
  type ActionPostResponse,
  createPostResponse,
  createActionHeaders
} from '@solana/actions';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  Connection,
  clusterApiUrl
} from '@solana/web3.js';
import { pqcCrypto } from '../zk-pqc/pqc-crypto.service';
import { NO_DECISION, type GuardStatus } from '../agent-guard/guard';
import { proposalAwaiting, recordVerdict, type Verdict } from '../fleet/approval';
import { findFleetRuntime, getFleetRuntime, shockStore } from '../fleet/app-runtime';
import type { FleetEntry } from '../fleet/fleet';
import type { FleetRuntime } from '../fleet/submit-decision';
import { memoText } from './memo';

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
      currentTask: 'Arbitraż cross-DEX: Raydium ↔ Orca, spread 0.34%',
      pqcKeyAccount: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'arbiter-02', task: 'ARB_SCAN', timestamp: Date.now() }),
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
      currentTask: 'Monitoring ekspozycji portfela — brak aktywnych alertów',
      pqcKeyAccount: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'guardian-03', task: 'MONITOR', timestamp: Date.now() }),
      lastUpdated: Date.now() - 120_000,
      riskLevel: 'LOW',
      actionsExecuted: 9
    }
  ]
]);

// Agents registered in the fleet (scripts/fleet.ts) run as their own processes; their state comes from the guard.
/** A killed agent shows as PAUSED even with a proposal waiting; the proposal shows again after resume. */
function cardStatus(guardStatus: GuardStatus, awaitingApproval: boolean): AgentStatusRecord['status'] {
  if (guardStatus === 'Killed') return 'PAUSED';
  return awaitingApproval ? 'AWAITING_APPROVAL' : 'ACTIVE';
}
const NO_DECISION_YET = 'Brak decyzji: agent jeszcze nie działał';

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
  const fleet = { shockArmed: shockStore.isArmed(entry.id), lastDecisionKind: last?.record.kind ?? null };
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
      actionsExecuted: account.counter,
      fleet: { ...fleet, pendingProposal }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...card,
      status: 'UNAVAILABLE',
      currentTask: `Niedostępny: ${reason}`,
      pqcKeyAccount: null,
      lastCommitmentRoot: NO_DECISION,
      actionsExecuted: 0,
      fleet: { ...fleet, pendingProposal: null }
    };
  }
}

export class BlinkService {
  private connection: Connection;
  private readonly defaultProgramId: PublicKey;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.defaultProgramId = new PublicKey(
      process.env.AEGIS_PROGRAM_ID || 'Aeg1s11111111111111111111111111111111111111'
    );
  }

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

  async getActionMetadata(agentId: string, origin: string): Promise<ActionGetResponse> {
    const agent = (await this.getAgent(agentId)) || {
      id: agentId,
      name: `Agent #${agentId}`,
      status: 'ACTIVE' as const,
      currentTask: 'Oczekiwanie na dyspozycję operatora',
      pqcKeyAccount: null,
      lastCommitmentRoot: '00'.repeat(32),
      lastUpdated: Date.now(),
      riskLevel: 'LOW' as const,
      actionsExecuted: 0
    };

    return {
      type: 'action',
      icon: `${origin}/shield-logo.svg`,
      title: `🛡️ Aegis Sentinel: ${agent.name}`,
      description:
        `Status: [${agent.status}] | Zadanie: ${agent.currentTask}\n` +
        `Konto klucza ML-DSA-44: ${agent.pqcKeyAccount ?? 'nieznane'}\n` +
        `Quantum-Safe State Root: ${agent.lastCommitmentRoot.slice(0, 16)}...`,
      label: 'Autoryzacja Agenta',
      links: {
        actions: [
          {
            label: '✅ Autoryzuj kolejny krok',
            href: `${origin}/api/actions/agent-action?agentId=${agentId}&decision=approve`
          },
          {
            label: '🛑 Emergency Kill-Switch',
            href: `${origin}/api/actions/agent-action?agentId=${agentId}&decision=pause`
          }
        ]
      }
    };
  }

  async createDecisionTransaction(
    userAccount: string,
    agentId: string,
    decision: 'approve' | 'pause'
  ): Promise<ActionPostResponse> {
    const userPubkey = new PublicKey(userAccount);
    const runtime = await findFleetRuntime();
    const newRoot = runtime?.fleet.get(agentId)
      ? await this.applyGuardedDecision(runtime, userAccount, agentId, decision)
      : this.applyMockDecision(userAccount, agentId, decision);

    const memoData = Buffer.from(memoText(agentId, decision, newRoot), 'utf-8');

    const instruction = new TransactionInstruction({
      keys: [{ pubkey: userPubkey, isSigner: true, isWritable: true }],
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: memoData
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = userPubkey;

    try {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
    } catch {
      tx.recentBlockhash = '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM';
    }

    return await createPostResponse({
      fields: {
        transaction: tx,
        message:
          decision === 'approve'
            ? `✅ Decyzja zatwierdzona! PQC State Root zaktualizowany.`
            : `🛑 AWARYJNY KILL-SWITCH AKTYWOWANY! Agent ${agentId} został wstrzymany.`
      }
    });
  }

  /** The owner's verdict on a fleet agent's proposal: recorded on chain as the agent's next step and in its log. */
  async decideProposal(agentId: string, verdict: Verdict): Promise<{ counter: number }> {
    const { record } = await recordVerdict(await getFleetRuntime(), agentId, verdict);
    return { counter: record.counter };
  }

  /** Fleet agents: the guard decides; a refusal (not the owner, wrong state) reaches the caller as a GuardError. */
  private async applyGuardedDecision(
    runtime: FleetRuntime,
    userAccount: string,
    agentId: string,
    decision: 'approve' | 'pause'
  ): Promise<string> {
    const { guard } = runtime;
    const account =
      decision === 'pause' ? await guard.kill(agentId, userAccount) : await guard.resume(agentId, userAccount);
    return account.lastDecision;
  }

  /** The three built-in mock agents: the decision only changes their in-memory card. */
  private applyMockDecision(userAccount: string, agentId: string, decision: 'approve' | 'pause'): string {
    const agent = agentsStore.get(agentId);
    if (!agent) return '00'.repeat(32);
    if (decision === 'pause') {
      agent.status = 'PAUSED';
    } else {
      agent.status = 'ACTIVE';
      agent.actionsExecuted += 1;
    }
    agent.lastUpdated = Date.now();
    agent.lastCommitmentRoot = pqcCrypto.computeStateCommitment({
      agentId,
      decision,
      status: agent.status,
      timestamp: agent.lastUpdated
    }).hexRoot;
    return agent.lastCommitmentRoot;
  }
}

export const blinkService = new BlinkService();

