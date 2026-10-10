import { createHash } from 'crypto';
import {
	AccountRole,
	address,
	fixDecoderSize,
	getAddressDecoder,
	getAddressEncoder,
	getBytesDecoder,
	getProgramDerivedAddress,
	getStructDecoder,
	getU32Encoder,
	getU64Decoder,
	getU8Decoder,
	type Address,
	type TransactionSigner
} from '@solana/kit';
import { DECISION_HASH_LENGTH } from './message';

// Client side of onchain/programs/onchain_agent_guard: hand-written Anchor encoding (8 B discriminator + Borsh).
// idl.test.ts checks the discriminators and error codes against the IDL from `anchor build`.

/** 8 B Anchor discriminator + 20,544 B prepared ML-DSA-44 key (AgentKey in state.rs). */
export const AGENT_KEY_ACCOUNT_SIZE = 20_552n;
export const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');
const AGENT_SEED = new TextEncoder().encode('agent');
const DISCRIMINATOR_LENGTH = 8;

export function anchorDiscriminator(namespace: 'global' | 'account', name: string): Uint8Array {
	return new Uint8Array(createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, DISCRIMINATOR_LENGTH));
}

export const DISCRIMINATORS = {
	registerAgent: anchorDiscriminator('global', 'register_agent'),
	recordStep: anchorDiscriminator('global', 'record_step'),
	kill: anchorDiscriminator('global', 'kill'),
	resume: anchorDiscriminator('global', 'resume'),
	agent: anchorDiscriminator('account', 'Agent')
};

const AGENT_STATUSES = ['Active', 'Killed'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentState {
	owner: Address;
	agentKey: Address;
	status: AgentStatus;
	counter: bigint;
	lastDecision: Uint8Array;
	bump: number;
}

const agentDecoder = getStructDecoder([
	['owner', getAddressDecoder()],
	['agentKey', getAddressDecoder()],
	['status', getU8Decoder()],
	['counter', getU64Decoder()],
	['lastDecision', fixDecoderSize(getBytesDecoder(), DECISION_HASH_LENGTH)],
	['bump', getU8Decoder()]
]);

export function decodeAgent(data: Uint8Array): AgentState {
	if (!equalBytes(data.subarray(0, DISCRIMINATOR_LENGTH), DISCRIMINATORS.agent)) {
		throw new Error('account is not an onchain_agent_guard Agent');
	}
	const raw = agentDecoder.decode(data, DISCRIMINATOR_LENGTH);
	const status = AGENT_STATUSES[raw.status];
	if (status === undefined) throw new Error(`unknown agent status ${raw.status}`);
	return { ...raw, status, lastDecision: new Uint8Array(raw.lastDecision) };
}

export async function findAgentAddress(programAddress: Address, owner: Address, agentKey: Address): Promise<Address> {
	const encoder = getAddressEncoder();
	const [agent] = await getProgramDerivedAddress({
		programAddress,
		seeds: [AGENT_SEED, encoder.encode(owner), encoder.encode(agentKey)]
	});
	return agent;
}

export function registerAgentInstruction(input: {
	programAddress: Address;
	owner: TransactionSigner;
	agentKey: Address;
	agent: Address;
	publicKey: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.WRITABLE_SIGNER, signer: input.owner },
			{ address: input.agentKey, role: AccountRole.WRITABLE },
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.registerAgent, borshBytes(input.publicKey))
	};
}

export function recordStepInstruction(input: {
	programAddress: Address;
	agent: Address;
	agentKey: Address;
	decisionHash: Uint8Array;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.agentKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.recordStep, input.decisionHash, borshBytes(input.signature))
	};
}

export function killInstruction(input: { programAddress: Address; owner: TransactionSigner; agent: Address }) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.READONLY_SIGNER, signer: input.owner },
			{ address: input.agent, role: AccountRole.WRITABLE }
		],
		data: DISCRIMINATORS.kill
	};
}

export function resumeInstruction(input: {
	programAddress: Address;
	owner: TransactionSigner;
	agent: Address;
	agentKey: Address;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.READONLY_SIGNER, signer: input.owner },
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.agentKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.resume, borshBytes(input.signature))
	};
}

/** Borsh `Vec<u8>`: u32 LE length, then the bytes. */
function borshBytes(bytes: Uint8Array): Uint8Array {
	return concatBytes(getU32Encoder().encode(bytes.length), bytes);
}

function concatBytes(...parts: ArrayLike<number>[]): Uint8Array {
	return Uint8Array.from(parts.flatMap((part) => Array.from(part)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
