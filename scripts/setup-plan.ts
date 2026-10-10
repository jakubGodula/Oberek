// What setup still has to do for each agent, and how much SOL the payer needs for it. Pure, so a re-run can skip
// whatever an earlier run already did.

/** ~0.15 SOL of rent locked by the registration, plus room for the agent's first steps (15,000 lamports each). */
export const LAMPORTS_PER_AGENT = 200_000_000n;

export interface AgentProgress {
	/** Its agent file exists: the on-chain account was created. */
	readonly registered: boolean;
	/** Its fleet directory exists: the server runs it. */
	readonly imported: boolean;
}

export type AgentStep = 'register' | 'import';

export function stepsFor({ registered, imported }: AgentProgress): AgentStep[] {
	if (imported) return [];
	return registered ? ['import'] : ['register', 'import'];
}

/** Only registration costs SOL; importing is local. */
export function lamportsNeeded(agents: readonly AgentProgress[]): bigint {
	return BigInt(agents.filter((agent) => stepsFor(agent).includes('register')).length) * LAMPORTS_PER_AGENT;
}
