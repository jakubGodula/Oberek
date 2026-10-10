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
import { getFleetRuntime } from '../fleet/app-runtime';
import type { FleetEntry } from '../fleet/fleet';
import type { AppRuntime } from '../fleet/runtime';

export interface AgentStatusRecord {
  id: string;
  name: string;
  /** UNAVAILABLE: a fleet agent whose guard account could not be read (e.g. the Solana RPC failed). */
  status: 'ACTIVE' | 'PAUSED' | 'IDLE' | 'UNAVAILABLE';
  currentTask: string;
  pqcPubkeyHash: string;
  lastCommitmentRoot: string;
  lastUpdated: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionsExecuted: number;
}

export interface ActionHistoryEntry {
  id: string;
  agentId: string;
  agentName: string;
  decision: 'approve' | 'pause' | 'system';
  operator: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
  memoHash: string;
}

// Globalna historia akcji (observability log)
const actionHistory: ActionHistoryEntry[] = [];

function genPqcHash(): string {
  return Buffer.from(pqcCrypto.computePubkeyHash(pqcCrypto.generateDsaKeys().publicKey)).toString('hex');
}

function genRoot(payload: Record<string, unknown>): string {
  return pqcCrypto.computeStateCommitment(payload).hexRoot;
}

// In-memory store z 3 wstępnie zdefiniowanymi agentami
const agentsStore: Map<string, AgentStatusRecord> = new Map([
  [
    'sentinel-01',
    {
      id: 'sentinel-01',
      name: 'Aegis Sentinel Alpha',
      status: 'ACTIVE',
      currentTask: 'Rebalansowanie skarbca SOL/USDC — próg płynności 94.2%',
      pqcPubkeyHash: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'sentinel-01', task: 'INITIAL_STATE', timestamp: Date.now() }),
      lastUpdated: Date.now(),
      riskLevel: 'MEDIUM',
      actionsExecuted: 47
    }
  ],
  [
    'arbiter-02',
    {
      id: 'arbiter-02',
      name: 'Arbiter Beta — DeFi Optimizer',
      status: 'ACTIVE',
      currentTask: 'Arbitraż cross-DEX: Raydium ↔ Orca, spread 0.34%',
      pqcPubkeyHash: genPqcHash(),
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
      pqcPubkeyHash: genPqcHash(),
      lastCommitmentRoot: genRoot({ agentId: 'guardian-03', task: 'MONITOR', timestamp: Date.now() }),
      lastUpdated: Date.now() - 120_000,
      riskLevel: 'LOW',
      actionsExecuted: 9
    }
  ]
]);

// Agents registered in the fleet (scripts/fleet.ts) run as their own processes; their state comes from the guard.
const CARD_STATUS_BY_GUARD_STATUS: Record<GuardStatus, AgentStatusRecord['status']> = {
  Active: 'ACTIVE',
  Killed: 'PAUSED'
};
/** Fleet cards do not show the agent's PQ key yet. */
const NO_PQC_KEY = '00'.repeat(32);
const NO_DECISION_YET = 'Brak decyzji: agent jeszcze nie działał';

/** One unreadable agent shows as UNAVAILABLE instead of failing the whole list. */
async function toAgentStatusRecord(runtime: AppRuntime, entry: FleetEntry): Promise<AgentStatusRecord> {
  const last = runtime.fleet.lastDecision(entry.id);
  const card = {
    id: entry.id,
    name: entry.name,
    currentTask: last?.record.summary ?? NO_DECISION_YET,
    pqcPubkeyHash: NO_PQC_KEY,
    lastUpdated: last ? Date.parse(last.record.observedAt) : entry.registeredAt,
    riskLevel: entry.riskLevel
  };
  try {
    const account = await runtime.guard.readAgent(entry.id);
    return {
      ...card,
      status: CARD_STATUS_BY_GUARD_STATUS[account.status],
      lastCommitmentRoot: account.lastDecision,
      actionsExecuted: account.counter
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...card,
      status: 'UNAVAILABLE',
      currentTask: `Niedostępny: ${reason}`,
      lastCommitmentRoot: NO_DECISION,
      actionsExecuted: 0
    };
  }
}

function memoText(agentId: string, decision: 'approve' | 'pause', newRoot: string): string {
  return `AEGIS_PQC_DMS:${agentId}:${decision.toUpperCase()}:${newRoot.slice(0, 16)}`;
}

// Seed historii demonstracyjnej
const _seedHistory = () => {
  const entries: Omit<ActionHistoryEntry, 'id'>[] = [
    {
      agentId: 'arbiter-02',
      agentName: 'Arbiter Beta — DeFi Optimizer',
      decision: 'approve',
      operator: '7xKX...AsU',
      newRoot: genRoot({ seed: 'h1' }),
      newStatus: 'ACTIVE',
      timestamp: Date.now() - 600_000,
      memoHash: 'AEGIS_PQC_DMS:arbiter-02:APPROVE:' + 'a1b2c3d4'.padEnd(16, '0')
    },
    {
      agentId: 'sentinel-01',
      agentName: 'Aegis Sentinel Alpha',
      decision: 'pause',
      operator: '3mNQ...Pxz',
      newRoot: genRoot({ seed: 'h2' }),
      newStatus: 'PAUSED',
      timestamp: Date.now() - 300_000,
      memoHash: 'AEGIS_PQC_DMS:sentinel-01:PAUSE:' + 'e5f6a7b8'.padEnd(16, '0')
    },
    {
      agentId: 'sentinel-01',
      agentName: 'Aegis Sentinel Alpha',
      decision: 'approve',
      operator: '3mNQ...Pxz',
      newRoot: genRoot({ seed: 'h3' }),
      newStatus: 'ACTIVE',
      timestamp: Date.now() - 120_000,
      memoHash: 'AEGIS_PQC_DMS:sentinel-01:APPROVE:' + 'c9d0e1f2'.padEnd(16, '0')
    }
  ];
  entries.forEach((e, i) => {
    actionHistory.push({ ...e, id: `hist-${i + 1}` });
  });
};
_seedHistory();

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
    const runtime = await getFleetRuntime();
    const fleetEntry = runtime.fleet.get(agentId);
    return fleetEntry ? toAgentStatusRecord(runtime, fleetEntry) : agentsStore.get(agentId);
  }

  async listAgents(): Promise<AgentStatusRecord[]> {
    const runtime = await getFleetRuntime();
    const fleetAgents = await Promise.all(runtime.fleet.list().map((entry) => toAgentStatusRecord(runtime, entry)));
    return [...agentsStore.values(), ...fleetAgents];
  }

  getActionHistory(limit = 20, agentId?: string): ActionHistoryEntry[] {
    const filtered = agentId
      ? actionHistory.filter((e) => e.agentId === agentId)
      : actionHistory;
    return filtered.slice(-limit).reverse();
  }

  async getActionMetadata(agentId: string, origin: string): Promise<ActionGetResponse> {
    const agent = (await this.getAgent(agentId)) || {
      id: agentId,
      name: `Agent #${agentId}`,
      status: 'ACTIVE' as const,
      currentTask: 'Oczekiwanie na dyspozycję operatora',
      pqcPubkeyHash: '00'.repeat(32),
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
        `PQC Key Hash (ML-DSA-44): ${agent.pqcPubkeyHash.slice(0, 10)}...${agent.pqcPubkeyHash.slice(-6)}\n` +
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
    const runtime = await getFleetRuntime();
    const newRoot = runtime.fleet.get(agentId)
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
            ? `✅ Decyzja zatwierdzona! PQC State Root zaktualizowany. Historia obserwacji zaktualizowana.`
            : `🛑 AWARYJNY KILL-SWITCH AKTYWOWANY! Agent ${agentId} został wstrzymany.`
      }
    });
  }

  /** Fleet agents: the guard decides; a refusal (not the owner, wrong state) reaches the caller as a GuardError. */
  private async applyGuardedDecision(
    runtime: AppRuntime,
    userAccount: string,
    agentId: string,
    decision: 'approve' | 'pause'
  ): Promise<string> {
    const { guard, fleet } = runtime;
    const account =
      decision === 'pause' ? await guard.kill(agentId, userAccount) : await guard.resume(agentId, userAccount);
    recordHistory({
      agentId,
      agentName: fleet.get(agentId)!.name,
      decision,
      userAccount,
      newRoot: account.lastDecision,
      newStatus: CARD_STATUS_BY_GUARD_STATUS[account.status],
      timestamp: Date.now()
    });
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
    recordHistory({
      agentId,
      agentName: agent.name,
      decision,
      userAccount,
      newRoot: agent.lastCommitmentRoot,
      newStatus: agent.status,
      timestamp: agent.lastUpdated
    });
    return agent.lastCommitmentRoot;
  }
}

// Zapisz do historii observability
function recordHistory(entry: {
  agentId: string;
  agentName: string;
  decision: 'approve' | 'pause';
  userAccount: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
}): void {
  const { agentId, agentName, decision, userAccount, newRoot, newStatus, timestamp } = entry;
  actionHistory.push({
    id: `hist-${timestamp}`,
    agentId,
    agentName,
    decision,
    operator: `${userAccount.slice(0, 4)}...${userAccount.slice(-3)}`,
    newRoot,
    newStatus,
    timestamp,
    memoHash: memoText(agentId, decision, newRoot)
  });
}

export const blinkService = new BlinkService();

