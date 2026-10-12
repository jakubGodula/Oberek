import { createHash } from 'node:crypto';
import { address } from '@solana/kit';
import { loadAgentFile, loadKeypairSigner } from './files';
import type { AgentGuard, GuardAccount } from './guard';
import { OnchainGuard } from './onchain-guard';
import { connect } from './transaction';

// One agent behind onchain_agent_guard: each action runs only after the program has recorded the decision behind it.

export interface GuardedStep<T> {
	/** The agent's counter after this step. */
	counter: number;
	/** Hex SHA-256 of the decision string, as recorded on chain. */
	decisionHash: string;
	/** What the action returned. */
	result: T;
}

export interface GuardedAgent {
	/**
	 * Records `decision` as the agent's next step, then runs `act`. A refused step throws GuardError and `act` does not
	 * run. If `act` throws, the step stays recorded: the record says the agent decided, not that the action succeeded.
	 */
	step<T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>>;
	status(): Promise<GuardAccount>;
	/** Owner only: every further step is refused until resume. */
	kill(): Promise<GuardAccount>;
	/** Owner only: signed with the agent's ML-DSA-44 key; uses up one counter value. */
	resume(): Promise<GuardAccount>;
}

/** SHA-256 of the decision's UTF-8 bytes, hex: anyone holding the string can recompute what is on chain. */
export function hashDecision(decision: string): string {
	return createHash('sha256').update(Buffer.from(decision, 'utf8')).digest('hex');
}

export function createGuardedAgent(guard: AgentGuard, agentId: string): GuardedAgent {
	const read = () => guard.readAgent(agentId);
	const recordThenAct = async <T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>> => {
		const decisionHash = hashDecision(decision);
		const { counter } = await guard.recordStep(agentId, (await read()).counter + 1, decisionHash);
		return { counter, decisionHash, result: await act() };
	};
	// Steps run one at a time: two at once would both sign the same next counter, and one would be refused.
	let previousStep: Promise<unknown> = Promise.resolve();
	return {
		step<T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>> {
			const step = previousStep.then(() => recordThenAct(decision, act));
			previousStep = step.catch(() => undefined);
			return step;
		},
		status: read,
		// AgentGuard takes the owner the caller claims; OnchainGuard checks its own owner key against the account.
		kill: async () => guard.kill(agentId, (await read()).owner),
		resume: async () => guard.resume(agentId, (await read()).owner)
	};
}

export const DEVNET_PROGRAM_ID = address('BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs');
export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
/** OnchainGuard looks agents up by id; a guarded agent is one agent, so a fixed id names it. */
const GUARDED_AGENT_ID = 'guarded-agent';

export interface GuardedAgentOptions {
	/** The agent file `bun scripts/agent.ts register` wrote (AGENT_FILE): addresses and the ML-DSA-44 secret key. */
	agentFile: string;
	/** The owner's Solana keypair file: pays every fee and signs kill and resume. */
	wallet: string;
	/** Default: devnet. */
	rpcUrl?: string;
	/** Default: derived from rpcUrl. A local validator serves it on another port (8900), so pass it there. */
	wsUrl?: string;
	/** Default: the devnet deploy. */
	programId?: string;
}

/** The agent from `options.agentFile`, guarded by the program on chain. */
export async function openGuardedAgent(options: GuardedAgentOptions): Promise<GuardedAgent> {
	const rpcUrl = options.rpcUrl ?? DEVNET_RPC_URL;
	const identity = loadAgentFile(options.agentFile);
	const wallet = await loadKeypairSigner(options.wallet);
	const guard = new OnchainGuard({
		client: {
			connection: connect(rpcUrl, options.wsUrl ?? subscriptionsUrlFor(rpcUrl)),
			programAddress: address(options.programId ?? DEVNET_PROGRAM_ID)
		},
		feePayer: wallet,
		owner: wallet,
		identityOf: () => identity
	});
	return createGuardedAgent(guard, GUARDED_AGENT_ID);
}

/** Public RPCs serve subscriptions on the same host and port over WebSocket. */
export function subscriptionsUrlFor(rpcUrl: string): string {
	return rpcUrl.replace(/^http/, 'ws');
}
