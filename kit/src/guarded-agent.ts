import { createHash } from 'node:crypto';
import { address, type TransactionSigner } from '@solana/kit';
import { loadAgentFile, loadKeypairSigner } from './files';
import type { AgentGuard, GuardAccount } from './guard';
import { OnchainGuard } from './onchain-guard';
import { connect } from './transaction';

// One agent behind onchain_agent_guard: each action runs only after the program has recorded the decision behind it.
// The agent and its owner hold different handles: the agent records steps, only the owner kills and resumes.

export interface GuardedStep<T> {
	/** The agent's counter after this step. */
	counter: number;
	/** Hex SHA-256 of the decision string, as recorded on chain. */
	decisionHash: string;
	/** What the action returned. */
	result: T;
}

/** The agent's handle: it can record steps, not kill or resume itself. */
export interface GuardedAgent {
	/**
	 * Records `decision` as the agent's next step, then runs `act`. A refused step throws GuardError and `act` does not
	 * run. If `act` throws, the step stays recorded: the record says the agent decided, not that the action succeeded.
	 */
	step<T>(decision: string, act: () => T | Promise<T>): Promise<GuardedStep<T>>;
	status(): Promise<GuardAccount>;
}

/** The owner's handle on one agent. */
export interface AgentOwner {
	status(): Promise<GuardAccount>;
	/** Every further step is refused until resume. */
	kill(): Promise<GuardAccount>;
	/** Signed with the owner's wallet and the agent's ML-DSA-44 key; uses up one counter value. */
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
		status: read
	};
}

export function createAgentOwner(guard: AgentGuard, agentId: string): AgentOwner {
	const read = () => guard.readAgent(agentId);
	return {
		status: read,
		// AgentGuard takes the owner the caller claims; OnchainGuard checks its own owner key against the account.
		kill: async () => guard.kill(agentId, (await read()).owner),
		resume: async () => guard.resume(agentId, (await read()).owner)
	};
}

export const DEVNET_PROGRAM_ID = address('BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs');
export const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
/** OnchainGuard looks agents up by id; a handle is for one agent, so a fixed id names it. */
const GUARDED_AGENT_ID = 'guarded-agent';

interface ConnectionOptions {
	/** The agent file `bun scripts/agent.ts register` wrote (AGENT_FILE): addresses and the ML-DSA-44 secret key. */
	agentFile: string;
	/** Default: devnet. */
	rpcUrl?: string;
	/** Default: derived from rpcUrl. A local validator serves it on another port (8900), so pass it there. */
	wsUrl?: string;
	/** Default: the devnet deploy. */
	programId?: string;
}

export interface GuardedAgentOptions extends ConnectionOptions {
	/**
	 * A Solana keypair file that pays the steps' fees. Not the owner's wallet: whoever takes the agent's process gets
	 * this key, and with the owner's they could resume a kill. Keep a small balance in it.
	 */
	payer: string;
}

export interface AgentOwnerOptions extends ConnectionOptions {
	/** The owner's Solana keypair file: signs and pays kill and resume. */
	owner: string;
}

/** The agent's handle, for the agent's own process. */
export async function openGuardedAgent(options: GuardedAgentOptions): Promise<GuardedAgent> {
	const payer = await loadKeypairSigner(options.payer);
	assertPayerIsNotOwner(payer.address, loadAgentFile(options.agentFile).owner);
	return createGuardedAgent(onchainGuard(options, { feePayer: payer }), GUARDED_AGENT_ID);
}

/** With the owner's wallet in its process, the agent's code could resume itself after a kill. */
export function assertPayerIsNotOwner(payer: string, owner: string): void {
	if (payer === owner) {
		throw new Error(`the agent's payer ${payer} is its owner's wallet; give the agent a wallet of its own`);
	}
}

/** The owner's handle, for a process the agent cannot reach. */
export async function openAgentOwner(options: AgentOwnerOptions): Promise<AgentOwner> {
	const owner = await loadKeypairSigner(options.owner);
	return createAgentOwner(onchainGuard(options, { feePayer: owner, owner }), GUARDED_AGENT_ID);
}

function onchainGuard(options: ConnectionOptions, signers: { feePayer: TransactionSigner; owner?: TransactionSigner }) {
	const rpcUrl = options.rpcUrl ?? DEVNET_RPC_URL;
	const identity = loadAgentFile(options.agentFile);
	return new OnchainGuard({
		client: {
			connection: connect(rpcUrl, options.wsUrl ?? subscriptionsUrlFor(rpcUrl)),
			programAddress: address(options.programId ?? DEVNET_PROGRAM_ID)
		},
		...signers,
		identityOf: () => identity
	});
}

/** Public RPCs serve subscriptions on the same host and port over WebSocket. */
export function subscriptionsUrlFor(rpcUrl: string): string {
	return rpcUrl.replace(/^http/, 'ws');
}
