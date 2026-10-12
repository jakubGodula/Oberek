// What setup still has to do for each agent, and how much SOL the payer needs for it. Pure, so a re-run can skip
// whatever an earlier run already did.

/** ~0.15 SOL of rent locked by the registration, plus room for the agent's first steps (15,000 lamports each). */
export const LAMPORTS_PER_AGENT = 200_000_000n;

export interface AgentProgress {
	/** Its agent file exists: the on-chain account was created, or a registration is still in doubt. */
	readonly registered: boolean;
	/** Its fleet directory exists: the server runs it. */
	readonly imported: boolean;
	/** Its decision log has a seal (import seals; agents imported before that need `seal`). */
	readonly sealed: boolean;
	/** `onchain.json` is in the fleet entry, so the server can sign for this agent. */
	readonly identified: boolean;
}

export type AgentStep = 'register' | 'import' | 'seal' | 'identify';

export function stepsFor({ registered, imported, sealed, identified }: AgentProgress): AgentStep[] {
	if (!imported) return registered ? ['import'] : ['register', 'import'];
	const steps: AgentStep[] = [];
	if (!sealed) steps.push('seal');
	// An import that stopped after the fleet entry, or a fleet copied without the key file.
	if (!identified) steps.push('identify');
	return steps;
}

/** Only registration costs SOL; importing and sealing are local. */
export function lamportsNeeded(agents: readonly AgentProgress[]): bigint {
	return BigInt(agents.filter((agent) => stepsFor(agent).includes('register')).length) * LAMPORTS_PER_AGENT;
}
