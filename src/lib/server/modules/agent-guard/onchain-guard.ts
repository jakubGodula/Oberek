import { getBase16Decoder, getBase16Encoder, type Address, type TransactionSigner } from '@solana/kit';
import type { AgentFile } from '../agent/files';
import { fetchAgent, killAgent, recordStep, resumeAgent, type GuardClient } from '../agent/guard-client';
import { customErrorCode, describeTransactionError, GUARD_ERROR_CODES } from '../agent/guard-errors';
import type { AgentState } from '../agent/instructions';
import { signGuardMessage, stepMessage } from '../agent/message';
import { signResume } from '../agent/resume';
import type { SendResult } from '../agent/transaction';
import { GuardError, type AgentGuard, type GuardAccount, type GuardErrorCode } from './guard';

/** The program calls the guard makes; injected so tests run without a network. */
export interface ChainCalls {
	fetchAgent(client: GuardClient, agent: Address): Promise<AgentState>;
	recordStep: typeof recordStep;
	killAgent: typeof killAgent;
	resumeAgent: typeof resumeAgent;
}

const PROGRAM_CHAIN_CALLS: ChainCalls = { fetchAgent, recordStep, killAgent, resumeAgent };

export interface OnchainGuardDeps {
	client: GuardClient;
	/** Pays for the agents' steps. */
	feePayer: TransactionSigner;
	/**
	 * The owner's key, held by the server so it can sign kill and resume (the page has no wallet yet). Whoever reaches
	 * the server can therefore kill and resume; the owner address a caller claims is not used.
	 */
	owner: TransactionSigner;
	/** The agent's on-chain addresses and ML-DSA-44 secret key; throws AgentNotFound for an unknown agent. */
	identityOf(agentId: string): AgentFile;
	chain?: ChainCalls;
}

const GUARD_ERROR_BY_PROGRAM_CODE = new Map<number, GuardErrorCode>([
	[GUARD_ERROR_CODES.AgentKilled, 'AgentKilled'],
	[GUARD_ERROR_CODES.AgentNotKilled, 'AgentNotKilled'],
	[GUARD_ERROR_CODES.AgentNotActive, 'AgentNotActive']
]);

/** The guard on Solana: the onchain_agent_guard program. Checks each rule before sending, so a refusal costs no fee. */
export class OnchainGuard implements AgentGuard {
	private readonly chain: ChainCalls;

	constructor(private readonly deps: OnchainGuardDeps) {
		this.chain = deps.chain ?? PROGRAM_CHAIN_CALLS;
	}

	async readAgent(agentId: string): Promise<GuardAccount> {
		return toGuardAccount(await this.readState(agentId));
	}

	async recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount> {
		const identity = this.deps.identityOf(agentId);
		const state = await this.readState(agentId);
		if (state.status === 'Killed') throw new GuardError('AgentKilled', `agent ${agentId} is killed`);
		if (BigInt(counter) !== state.counter + 1n) {
			throw new GuardError('CounterMismatch', `agent ${agentId} is at step ${state.counter}, not ${counter - 1}`);
		}
		const hash = new Uint8Array(getBase16Encoder().encode(decisionHash));
		const signature = signGuardMessage(stepMessage(identity.agent, BigInt(counter), hash), identity.mldsaSecretKey);
		const step = {
			feePayer: this.deps.feePayer,
			agent: identity.agent,
			agentKey: identity.agentKey,
			decisionHash: hash,
			signature
		};
		assertLanded(await this.chain.recordStep(this.deps.client, step), 'record_step');
		return { ...toGuardAccount(state), counter, lastDecision: decisionHash };
	}

	async kill(agentId: string): Promise<GuardAccount> {
		const state = await this.readOwnedState(agentId);
		if (state.status === 'Killed') throw new GuardError('AgentNotActive', `agent ${agentId} is already killed`);
		const { agent } = this.deps.identityOf(agentId);
		assertLanded(await this.chain.killAgent(this.deps.client, this.deps.owner, agent), 'kill');
		return { ...toGuardAccount(state), status: 'Killed' };
	}

	async resume(agentId: string): Promise<GuardAccount> {
		const state = await this.readOwnedState(agentId);
		if (state.status === 'Active') throw new GuardError('AgentNotKilled', `agent ${agentId} is not killed`);
		const { agent, agentKey, mldsaSecretKey } = this.deps.identityOf(agentId);
		const signature = signResume(agent, state, mldsaSecretKey);
		const resume = { owner: this.deps.owner, agent, agentKey, signature };
		assertLanded(await this.chain.resumeAgent(this.deps.client, resume), 'resume');
		return { ...toGuardAccount(state), status: 'Active', counter: Number(state.counter + 1n) };
	}

	private readState(agentId: string): Promise<AgentState> {
		return this.chain.fetchAgent(this.deps.client, this.deps.identityOf(agentId).agent);
	}

	private async readOwnedState(agentId: string): Promise<AgentState> {
		const state = await this.readState(agentId);
		if (state.owner !== this.deps.owner.address) {
			throw new GuardError('NotOwner', `the server's owner key ${this.deps.owner.address} does not own agent ${agentId}`);
		}
		return state;
	}
}

function toGuardAccount(state: AgentState): GuardAccount {
	return {
		owner: state.owner,
		status: state.status,
		counter: Number(state.counter),
		lastDecision: getBase16Decoder().decode(state.lastDecision)
	};
}

/** A transaction that landed but failed: the program's own refusals become GuardErrors, anything else an Error. */
function assertLanded(result: SendResult, instruction: string): void {
	if (result.err === null) return;
	const message = `${instruction} failed on-chain: ${describeTransactionError(result.err)} (${result.signature})`;
	const code = GUARD_ERROR_BY_PROGRAM_CODE.get(customErrorCode(result.err) ?? Number.NaN);
	throw code ? new GuardError(code, message) : new Error(message);
}
