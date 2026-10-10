// The text of the Memo instruction in the Blink's transaction, which the user's wallet signs and sends.

export type BlinkDecision = 'approve' | 'pause';

export function memoText(agentId: string, decision: BlinkDecision, root: string): string {
  return `AEGIS_PQC_DMS:${agentId}:${decision.toUpperCase()}:${root.slice(0, 16)}`;
}
