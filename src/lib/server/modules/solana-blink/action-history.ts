// The page's observability log: what people did to agents (approve and kill on the mocks; kill, resume and verdicts
// on fleet agents). Kept in memory.

export type HistoryDecision = 'approve' | 'pause' | 'resume' | 'accept' | 'reject' | 'system';

export interface ActionHistoryEntry {
  id: string;
  agentId: string;
  agentName: string;
  decision: HistoryDecision;
  operator: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
  memoHash: string;
}

export interface HistoryEvent {
  agentId: string;
  agentName: string;
  decision: HistoryDecision;
  userAccount: string;
  newRoot: string;
  newStatus: string;
  timestamp: number;
}

export class ActionHistory {
  private readonly entries: ActionHistoryEntry[] = [];

  record({ userAccount, ...event }: HistoryEvent): void {
    this.entries.push({
      ...event,
      id: `hist-${this.entries.length + 1}`,
      operator: shortAddress(userAccount),
      memoHash: memoText(event.agentId, event.decision, event.newRoot)
    });
  }

  /** The newest entries first, at most `limit`, optionally of one agent. */
  recent(limit: number, agentId?: string): ActionHistoryEntry[] {
    const entries = agentId ? this.entries.filter((entry) => entry.agentId === agentId) : this.entries;
    return entries.slice(-limit).reverse();
  }
}

export function memoText(agentId: string, decision: HistoryDecision, root: string): string {
  return `AEGIS_PQC_DMS:${agentId}:${decision.toUpperCase()}:${root.slice(0, 16)}`;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}
