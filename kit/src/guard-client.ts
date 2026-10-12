import { fetchEncodedAccount, type Address, type Signature, type TransactionSigner } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
	activateAgentInstruction,
	AGENT_KEY_ACCOUNT_SIZE,
	decodeAgent,
	killInstruction,
	recordBatchInstruction,
	OWNER_KEY_ACCOUNT_SIZE,
	recordStepInstruction,
	registerAgentInstruction,
	registerOwnerInstruction,
	resumeInstruction,
	type AgentState
} from './instructions';
import { parseGuardEvents, type GuardEvent } from './events';
import { sendV1, type SendResult, type SolanaConnection } from './transaction';

/** Preparing a 1,312 B key (agent or owner) costs ~1.09M CU. */
const REGISTER_COMPUTE_UNIT_LIMIT = 1_400_000;
/** ML-DSA-44 verification ~260k CU plus Anchor (Mollusk: step 271,861, resume 262,233). */
const SIGNED_COMPUTE_UNIT_LIMIT = 400_000;
const KILL_COMPUTE_UNIT_LIMIT = 50_000;
/** The most getSignaturesForAddress returns at once. */
const SIGNATURES_PAGE_LIMIT = 1000;

export interface GuardClient {
	connection: SolanaConnection;
	programAddress: Address;
}

export async function fetchBalance(client: GuardClient, account: Address): Promise<bigint> {
	const { value } = await client.connection.rpc.getBalance(account).send();
	return value;
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
 * The guard events in the transaction history of `account`, oldest first. One getTransaction per transaction: on the
 * free-tier devnet RPC (10 per window) a few hundred steps take minutes. `onProgress` gets (fetched, total).
 */
export async function fetchGuardEvents(
	client: GuardClient,
	account: Address,
	onProgress?: (fetched: number, total: number) => void
): Promise<GuardEvent[]> {
	const signatures = await fetchSuccessfulSignatures(client, account);
	const events: GuardEvent[] = [];
	for (const [index, signature] of signatures.entries()) {
		const transaction = await client.connection.rpc
			.getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 1 })
			.send();
		const logs = transaction?.meta?.logMessages;
		if (!logs) throw new Error(`transaction ${signature} or its logs are not available from this RPC (pruned?)`);
		events.push(...parseGuardEvents(logs, client.programAddress));
		onProgress?.(index + 1, signatures.length);
	}
	return events;
}

/** Failed transactions change nothing and emit no events. */
async function fetchSuccessfulSignatures(client: GuardClient, account: Address): Promise<Signature[]> {
	const signatures: Signature[] = [];
	let before: Signature | undefined;
	for (;;) {
		const page = await client.connection.rpc
			.getSignaturesForAddress(account, { commitment: 'confirmed', limit: SIGNATURES_PAGE_LIMIT, ...(before && { before }) })
			.send();
		signatures.push(...page.filter((entry) => entry.err === null).map((entry) => entry.signature));
		if (page.length < SIGNATURES_PAGE_LIMIT) return signatures.reverse();
		before = page[page.length - 1].signature;
	}
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
	const instructions = [
		await createKeyAccountInstruction(client, owner, agentKey, AGENT_KEY_ACCOUNT_SIZE),
		registerAgentInstruction({ programAddress: client.programAddress, owner, agentKey: agentKey.address, agent, publicKey })
	];
	return sendV1(client.connection, owner, instructions, REGISTER_COMPUTE_UNIT_LIMIT);
}

/** Creates the owner's key account and its permanent record in one transaction; once per owner wallet. */
export async function registerOwner(
	client: GuardClient,
	registration: { owner: TransactionSigner; ownerKey: TransactionSigner; ownerRecord: Address; publicKey: Uint8Array }
): Promise<SendResult> {
	const { owner, ownerKey, ownerRecord, publicKey } = registration;
	const instructions = [
		await createKeyAccountInstruction(client, owner, ownerKey, OWNER_KEY_ACCOUNT_SIZE),
		registerOwnerInstruction({ programAddress: client.programAddress, owner, ownerKey: ownerKey.address, ownerRecord, publicKey })
	];
	return sendV1(client.connection, owner, instructions, REGISTER_COMPUTE_UNIT_LIMIT);
}

export function activateAgent(
	client: GuardClient,
	activation: { feePayer: TransactionSigner; agent: Address; ownerRecord: Address; ownerKey: Address; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = activateAgentInstruction({ programAddress: client.programAddress, ...activation });
	return sendV1(client.connection, activation.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}

/** Creates a key account owned by the program; the payer pays its rent. */
async function createKeyAccountInstruction(
	client: GuardClient,
	payer: TransactionSigner,
	account: TransactionSigner,
	space: bigint
) {
	const lamports = await client.connection.rpc.getMinimumBalanceForRentExemption(space).send();
	return getCreateAccountInstruction({ payer, newAccount: account, lamports, space, programAddress: client.programAddress });
}

export function recordStep(
	client: GuardClient,
	step: { feePayer: TransactionSigner; agent: Address; agentKey: Address; decisionHash: Uint8Array; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = recordStepInstruction({ programAddress: client.programAddress, ...step });
	return sendV1(client.connection, step.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}

export function recordBatch(
	client: GuardClient,
	batch: { feePayer: TransactionSigner; agent: Address; agentKey: Address; root: Uint8Array; size: number; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = recordBatchInstruction({ programAddress: client.programAddress, ...batch });
	return sendV1(client.connection, batch.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
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
