import { fetchEncodedAccount, type Address, type TransactionSigner } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
	AGENT_KEY_ACCOUNT_SIZE,
	decodeAgent,
	killInstruction,
	recordStepInstruction,
	registerAgentInstruction,
	resumeInstruction,
	type AgentState
} from './instructions';
import { sendV1, type SendResult, type SolanaConnection } from './transaction';

/** Preparing the 1,312 B key costs ~1.09M CU. */
const REGISTER_COMPUTE_UNIT_LIMIT = 1_400_000;
/** ML-DSA-44 verification ~260k CU plus Anchor (Mollusk: step 271,861, resume 262,233). */
const SIGNED_COMPUTE_UNIT_LIMIT = 400_000;
const KILL_COMPUTE_UNIT_LIMIT = 50_000;

export interface GuardClient {
	connection: SolanaConnection;
	programAddress: Address;
}

export async function fetchAgent(client: GuardClient, agent: Address): Promise<AgentState> {
	const account = await fetchEncodedAccount(client.connection.rpc, agent);
	if (!account.exists) throw new Error(`agent account ${agent} not found (not registered, or wrong cluster)`);
	if (account.programAddress !== client.programAddress) {
		throw new Error(`account ${agent} belongs to ${account.programAddress}, not to GUARD_PROGRAM_ID ${client.programAddress}`);
	}
	return decodeAgent(new Uint8Array(account.data));
}

/**
 * Creates the 20,552 B key account and registers the agent in one transaction; the owner pays. The caller generates
 * the key account signer and derives `agent` (findAgentAddress) first, so it can save the agent file before sending.
 */
export async function registerAgent(
	client: GuardClient,
	registration: { owner: TransactionSigner; agentKey: TransactionSigner; agent: Address; publicKey: Uint8Array }
): Promise<SendResult> {
	const { owner, agentKey, agent, publicKey } = registration;
	const lamports = await client.connection.rpc.getMinimumBalanceForRentExemption(AGENT_KEY_ACCOUNT_SIZE).send();
	const instructions = [
		getCreateAccountInstruction({
			payer: owner,
			newAccount: agentKey,
			lamports,
			space: AGENT_KEY_ACCOUNT_SIZE,
			programAddress: client.programAddress
		}),
		registerAgentInstruction({ programAddress: client.programAddress, owner, agentKey: agentKey.address, agent, publicKey })
	];
	return sendV1(client.connection, owner, instructions, REGISTER_COMPUTE_UNIT_LIMIT);
}

export function recordStep(
	client: GuardClient,
	step: { feePayer: TransactionSigner; agent: Address; agentKey: Address; decisionHash: Uint8Array; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = recordStepInstruction({ programAddress: client.programAddress, ...step });
	return sendV1(client.connection, step.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}

export function killAgent(client: GuardClient, owner: TransactionSigner, agent: Address): Promise<SendResult> {
	const instruction = killInstruction({ programAddress: client.programAddress, owner, agent });
	return sendV1(client.connection, owner, [instruction], KILL_COMPUTE_UNIT_LIMIT);
}

export function resumeAgent(
	client: GuardClient,
	resume: { owner: TransactionSigner; agent: Address; agentKey: Address; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = resumeInstruction({ programAddress: client.programAddress, ...resume });
	return sendV1(client.connection, resume.owner, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}
