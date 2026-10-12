// What setup still has to do for each agent, and how much SOL the payer needs for it. Pure, so a re-run can skip
// whatever an earlier run already did.
// Also which fleet to set up: the demo's, or the e2e tests' own (--e2e).

import type { RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import { DEMO_FLEET_DIR, E2E_FLEET_DIR } from '../src/lib/server/modules/fleet/fleet-dir';

/** ~0.15 SOL of rent locked by the registration, plus room for the agent's first steps (15,000 lamports each). */
export const LAMPORTS_PER_AGENT = 200_000_000n;
/** ~0.15 SOL of rent for the owner's 20.5 KB key account and its record. */
export const LAMPORTS_FOR_OWNER_KEY = 200_000_000n;

export interface AgentProgress {
	/** Its agent file exists: the on-chain account was created, or a registration is still in doubt. */
	readonly registered: boolean;
	/** Registered on chain but still `Pending`: an earlier run's activation failed. */
	readonly pending: boolean;
	/** Its fleet directory exists: the server runs it. */
	readonly imported: boolean;
	/** Its decision log has a seal (import seals; agents imported before that need `seal`). */
	readonly sealed: boolean;
	/** `onchain.json` is in the fleet entry, so the server can sign for this agent. */
	readonly identified: boolean;
}

/** `register` also activates the agent; `activate` retries only that. */
export type AgentStep = 'register' | 'activate' | 'import' | 'seal' | 'identify';

export function stepsFor({ registered, pending, imported, sealed, identified }: AgentProgress): AgentStep[] {
	const steps: AgentStep[] = pending ? ['activate'] : [];
	if (!imported) return registered ? [...steps, 'import'] : ['register', 'import'];
	if (!sealed) steps.push('seal');
	// An import that stopped after the fleet entry, or a fleet copied without the key file.
	if (!identified) steps.push('identify');
	return steps;
}

/** Only registration costs SOL; importing and sealing are local. The owner key is registered once, before any agent. */
export function lamportsNeeded(agents: readonly AgentProgress[], ownerKeyRegistered: boolean): bigint {
	const forAgents = BigInt(agents.filter((agent) => stepsFor(agent).includes('register')).length) * LAMPORTS_PER_AGENT;
	return ownerKeyRegistered ? forAgents : forAgents + LAMPORTS_FOR_OWNER_KEY;
}

/** Agents set up before the owner key existed were never activated by it: activation needs that key. */
export function predatesActivation(agents: readonly AgentProgress[], ownerKeyRegistered: boolean): boolean {
	return !ownerKeyRegistered && agents.some((agent) => agent.registered || agent.imported);
}

export interface SetupAgent {
	readonly id: string;
	readonly name: string;
	readonly risk: RiskLevel;
}

/** Which fleet setup builds: its directories, its agents and what to run once it is ready. */
export interface SetupProfile {
	readonly fleetDir: string;
	readonly agentsDir: string;
	readonly agents: readonly SetupAgent[];
	readonly nextStep: string;
}

export const E2E_FLAG = '--e2e';

/** The page's Simulate panel names sentinel-01, so the test fleet keeps the demo's ids in its own directory. */
export const E2E_SENTINEL: SetupAgent = { id: 'sentinel-01', name: 'E2E Sentinel', risk: 'MEDIUM' };
export const E2E_TICK: SetupAgent = { id: 'tick-01', name: 'E2E Tick', risk: 'LOW' };

export const DEMO_PROFILE: SetupProfile = {
	fleetDir: DEMO_FLEET_DIR,
	agentsDir: '.devnet/agents',
	agents: [
		{ id: 'sentinel-01', name: 'Oberek Sentinel Alpha — Treasury Rebalancer', risk: 'MEDIUM' },
		{ id: 'tick-01', name: 'Oberek Tick One — on-chain heartbeat', risk: 'LOW' },
		{ id: 'jito-01', name: 'JitoSOL Steward', risk: 'MEDIUM' }
	],
	nextStep: 'bun scripts/demo.ts'
};

export const E2E_PROFILE: SetupProfile = {
	fleetDir: E2E_FLEET_DIR,
	agentsDir: '.devnet/e2e-agents',
	agents: [E2E_SENTINEL, E2E_TICK],
	nextStep: 'bun run e2e'
};

export function profileFor(argv: readonly string[]): SetupProfile {
	return argv.includes(E2E_FLAG) ? E2E_PROFILE : DEMO_PROFILE;
}
