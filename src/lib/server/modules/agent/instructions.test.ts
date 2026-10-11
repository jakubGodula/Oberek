import { describe, expect, it } from 'bun:test';
import { AccountRole, generateKeyPairSigner, getAddressDecoder, getU64Encoder } from '@solana/kit';
import {
	anchorDiscriminator,
	DISCRIMINATORS,
	decodeAgent,
	findAgentAddress,
	killInstruction,
	recordBatchInstruction,
	recordStepInstruction,
	registerAgentInstruction
} from './instructions';

const filled = (length: number, value: number) => new Uint8Array(length).fill(value);
const addressOf = (value: number) => getAddressDecoder().decode(filled(32, value));
const PROGRAM = addressOf(9);
const AGENT = addressOf(7);
const AGENT_KEY = addressOf(3);
const ML_DSA_44_PUBLIC_KEY_LENGTH = 1312;
const ML_DSA_44_SIGNATURE_LENGTH = 2420;

describe('discriminators', () => {
	it('are the first 8 bytes of sha256 over the Anchor names', () => {
		expect(Array.from(DISCRIMINATORS.registerAgent)).toEqual([135, 157, 66, 195, 2, 113, 175, 30]);
		expect(Array.from(DISCRIMINATORS.recordStep)).toEqual([73, 169, 197, 19, 10, 159, 58, 199]);
		expect(Array.from(DISCRIMINATORS.kill)).toEqual([46, 229, 132, 89, 87, 194, 20, 217]);
		expect(Array.from(DISCRIMINATORS.resume)).toEqual([1, 166, 51, 170, 127, 32, 141, 206]);
		expect(Array.from(DISCRIMINATORS.agent)).toEqual([47, 166, 112, 147, 155, 197, 86, 7]);
	});
});

describe('record_batch discriminators', () => {
	it('name record_batch and BatchRecorded like Anchor', () => {
		expect(DISCRIMINATORS.recordBatch).toEqual(anchorDiscriminator('global', 'record_batch'));
		expect(DISCRIMINATORS.batchRecorded).toEqual(anchorDiscriminator('event', 'BatchRecorded'));
	});
});

describe('recordBatchInstruction', () => {
	it('encodes root, u32 LE size and the Borsh signature after the discriminator', () => {
		const signature = filled(ML_DSA_44_SIGNATURE_LENGTH, 6);
		const root = filled(32, 0xb7);
		const instruction = recordBatchInstruction({ programAddress: PROGRAM, agent: AGENT, agentKey: AGENT_KEY, root, size: 5, signature });
		expect(instruction.accounts.map((account) => account.role)).toEqual([AccountRole.WRITABLE, AccountRole.READONLY]);
		const signatureLength = [0x74, 0x09, 0, 0];
		expect(instruction.data).toEqual(Uint8Array.from([...DISCRIMINATORS.recordBatch, ...root, 5, 0, 0, 0, ...signatureLength, ...signature]));
	});
});

describe('findAgentAddress', () => {
	it('derives one address per owner and key', async () => {
		const first = await findAgentAddress(PROGRAM, addressOf(2), AGENT_KEY);
		expect(await findAgentAddress(PROGRAM, addressOf(2), AGENT_KEY)).toBe(first);
		expect(await findAgentAddress(PROGRAM, addressOf(4), AGENT_KEY)).not.toBe(first);
	});
});

describe('decodeAgent', () => {
	it('decodes the Anchor account layout', () => {
		const data = Uint8Array.from([
			...DISCRIMINATORS.agent,
			...filled(32, 1),
			...filled(32, 2),
			1,
			...getU64Encoder().encode(5n),
			...filled(32, 9),
			254
		]);
		expect(decodeAgent(data)).toEqual({
			owner: addressOf(1),
			agentKey: addressOf(2),
			status: 'Killed',
			counter: 5n,
			lastDecision: filled(32, 9),
			bump: 254
		});
	});

	it('rejects an account that is not an Agent', () => {
		expect(() => decodeAgent(filled(8 + 106, 0))).toThrow('not an onchain_agent_guard Agent');
	});
});

describe('instruction builders', () => {
	it('lays out register_agent', async () => {
		const owner = await generateKeyPairSigner();
		const instruction = registerAgentInstruction({
			programAddress: PROGRAM,
			owner,
			agentKey: AGENT_KEY,
			agent: AGENT,
			publicKey: filled(ML_DSA_44_PUBLIC_KEY_LENGTH, 5)
		});
		expect(instruction.data.length).toBe(8 + 4 + ML_DSA_44_PUBLIC_KEY_LENGTH);
		expect(instruction.accounts.map((account) => account.role)).toEqual([
			AccountRole.WRITABLE_SIGNER,
			AccountRole.WRITABLE,
			AccountRole.WRITABLE,
			AccountRole.READONLY
		]);
	});

	it('lays out record_step: discriminator, hash, u32 LE length, signature', () => {
		const instruction = recordStepInstruction({
			programAddress: PROGRAM,
			agent: AGENT,
			agentKey: AGENT_KEY,
			decisionHash: filled(32, 9),
			signature: filled(ML_DSA_44_SIGNATURE_LENGTH, 5)
		});
		expect(instruction.data.length).toBe(8 + 32 + 4 + ML_DSA_44_SIGNATURE_LENGTH);
		expect(Array.from(instruction.data.subarray(0, 8))).toEqual(Array.from(DISCRIMINATORS.recordStep));
		expect(Array.from(instruction.data.subarray(40, 44))).toEqual([0x74, 0x09, 0, 0]);
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[AGENT, AccountRole.WRITABLE],
			[AGENT_KEY, AccountRole.READONLY]
		]);
	});

	it('makes the owner sign kill', async () => {
		const owner = await generateKeyPairSigner();
		const instruction = killInstruction({ programAddress: PROGRAM, owner, agent: AGENT });
		expect(Array.from(instruction.data)).toEqual(Array.from(DISCRIMINATORS.kill));
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[owner.address, AccountRole.READONLY_SIGNER],
			[AGENT, AccountRole.WRITABLE]
		]);
	});
});
