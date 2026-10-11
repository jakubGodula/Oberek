// What setup still has to do for each agent, and how much SOL the payer needs for it. Pure, so a re-run can skip
// whatever an earlier run already did.

/** ~0.15 SOL of rent locked by the registration, plus room for the agent's first steps (15,000 lamports each). */
export const LAMPORTS_PER_AGENT = 200_000_000n;
/** ~0.15 SOL of rent for the owner's 20.5 KB key account and its record. */
export const LAMPORTS_FOR_OWNER_KEY = 200_000_000n;

export interface AgentProgress {
	/** Its agent file exists: the on-chain account was created. */
	readonly registered: boolean;
	/** Registered on chain but still `Pending`: an earlier run's activation failed. */
	readonly pending: boolean;
	/** Its fleet directory exists: the server runs it. */
	readonly imported: boolean;
	/** Its decision log has a seal (import seals; agents imported before that need `seal`). */
	readonly sealed: boolean;
}

/** `register` also activates the agent; `activate` retries only that. */
export type AgentStep = 'register' | 'activate' | 'import' | 'seal';

export function stepsFor({ registered, pending, imported, sealed }: AgentProgress): AgentStep[] {
	const activation: AgentStep[] = pending ? ['activate'] : [];
	if (imported) return sealed ? activation : [...activation, 'seal'];
	return registered ? [...activation, 'import'] : ['register', 'import'];
}

/** Only registration costs SOL; importing and sealing are local. The owner key is registered once, before any agent. */
export function lamportsNeeded(agents: readonly AgentProgress[], ownerKeyRegistered: boolean): bigint {
	const forAgents = BigInt(agents.filter((agent) => stepsFor(agent).includes('register')).length) * LAMPORTS_PER_AGENT;
	return ownerKeyRegistered ? forAgents : forAgents + LAMPORTS_FOR_OWNER_KEY;
}
