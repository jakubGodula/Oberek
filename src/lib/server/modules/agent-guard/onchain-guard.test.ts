import { describe, expect, test } from 'bun:test';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { address, getBase16Encoder, type Signature, type TransactionSigner } from '@solana/kit';
import type { AgentFile } from '../agent/files';
import type { GuardClient } from '../agent/guard-client';
import type { AgentState } from '../agent/instructions';
import { GUARD_CONTEXT, resumeMessage, stepMessage } from '../agent/message';
import type { SendResult } from '../agent/transaction';
import { GuardError } from './guard';
import { OnchainGuard, type ChainCalls } from './onchain-guard';

const AGENT_ID = 'tick-01';
const OWNER = address('ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq');
const STRANGER = address('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
const AGENT = address('BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN');
const AGENT_KEY = address('CA61y1mTZQ6CSgv4iNAPYHHV16BoYAcdcb2xRBK72nqs');
const KEYS = ml_dsa44.keygen();
const DECISION_HASH = 'ab'.repeat(32);
const DECISION_HASH_BYTES = new Uint8Array(getBase16Encoder().encode(DECISION_HASH));
const PROGRAM_ERROR = (code: number) => ({ InstructionError: [0, { Custom: code }] });

const IDENTITY: AgentFile = { owner: OWNER, agentKey: AGENT_KEY, agent: AGENT, mldsaSecretKey: KEYS.secretKey };
const signer = (signerAddress: string) => ({ address: signerAddress }) as unknown as TransactionSigner;
const FEE_PAYER = signer(OWNER);

/** The four chain calls over one in-memory Agent account; records what would have been sent. */
function fakeChain(initial: Partial<AgentState> = {}) {
	const state: AgentState = {
		owner: OWNER,
		agentKey: AGENT_KEY,
		status: 'Active',
		counter: 11n,
		lastDecision: new Uint8Array(32),
		bump: 255,
		...initial
	};
	const sent: { action: string; input: Record<string, unknown> }[] = [];
	let landedError: unknown = null;
	const land = (action: string, input: Record<string, unknown>): SendResult => {
		sent.push({ action, input });
		return { signature: 'tx-signature' as Signature, err: landedError, computeUnits: 0n, transactionBytes: 0 };
	};
	const calls: ChainCalls = {
		fetchAgent: async () => state,
		recordStep: async (_, step) => land('recordStep', step),
		killAgent: async (_, owner, agent) => land('kill', { owner, agent }),
		resumeAgent: async (_, resume) => land('resume', resume)
	};
	return { calls, sent, failOnChainWith: (err: unknown) => (landedError = err) };
}

function guardOver(chain: ReturnType<typeof fakeChain>, serverOwner = signer(OWNER)) {
	return new OnchainGuard({
		client: {} as GuardClient,
		feePayer: FEE_PAYER,
		owner: serverOwner,
		identityOf: (agentId) => {
			if (agentId !== AGENT_ID) throw new GuardError('AgentNotFound', `no ${agentId}`);
			return IDENTITY;
		},
		chain: chain.calls
	});
}

async function guardErrorCode(action: Promise<unknown>): Promise<string> {
	const error = await action.then(
		() => null,
		(caught: unknown) => caught
	);
	expect(error).toBeInstanceOf(GuardError);
	return (error as GuardError).code;
}

describe('readAgent', () => {
	test('maps the on-chain Agent account', async () => {
		const chain = fakeChain({ status: 'Killed', lastDecision: DECISION_HASH_BYTES });
		expect(await guardOver(chain).readAgent(AGENT_ID)).toEqual({
			owner: OWNER,
			status: 'Killed',
			counter: 11,
			lastDecision: DECISION_HASH
		});
	});

	test('reports an agent without an on-chain identity', async () => {
		expect(await guardErrorCode(guardOver(fakeChain()).readAgent('stranger'))).toBe('AgentNotFound');
	});
});

describe('recordStep', () => {
	test("signs the step message for the counter with the agent's key and sends it, paid by the fee payer", async () => {
		const chain = fakeChain();
		const account = await guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH);

		expect(account).toMatchObject({ status: 'Active', counter: 12, lastDecision: DECISION_HASH });
		const { action, input } = chain.sent[0];
		expect(action).toBe('recordStep');
		expect(input).toMatchObject({ feePayer: FEE_PAYER, agent: AGENT, agentKey: AGENT_KEY, decisionHash: DECISION_HASH_BYTES });
		const message = stepMessage(AGENT, 12n, DECISION_HASH_BYTES);
		expect(ml_dsa44.verify(input.signature as Uint8Array, message, KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
	});

	test('refuses without sending while the agent is killed', async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentKilled');
		expect(chain.sent).toEqual([]);
	});

	test('refuses without sending a step for any counter but the next one', async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 11, DECISION_HASH))).toBe('CounterMismatch');
		expect(chain.sent).toEqual([]);
	});

	test('reports a kill that landed between the read and the send as AgentKilled', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(6000));
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentKilled');
	});

	test('reports any other on-chain failure as a plain error naming the program error', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(6006));
		await expect(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH)).rejects.toThrow('VerifyFailed');
	});
});

describe('kill', () => {
	test("sends kill signed with the server's owner key", async () => {
		const chain = fakeChain();
		expect((await guardOver(chain).kill(AGENT_ID, OWNER)).status).toBe('Killed');
		expect(chain.sent[0]).toMatchObject({ action: 'kill', input: { agent: AGENT } });
		expect((chain.sent[0].input.owner as TransactionSigner).address).toBe(OWNER);
	});

	test('refuses without sending when the agent is already killed', async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardErrorCode(guardOver(chain).kill(AGENT_ID, OWNER))).toBe('AgentNotActive');
		expect(chain.sent).toEqual([]);
	});

	test("refuses without sending when the server's key does not own the agent", async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain, signer(STRANGER)).kill(AGENT_ID, OWNER))).toBe('NotOwner');
		expect(chain.sent).toEqual([]);
	});
});

describe('resume', () => {
	test("signs the resume for the next counter with the agent's key and sends it with the owner's key", async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardOver(chain).resume(AGENT_ID, OWNER)).toMatchObject({ status: 'Active', counter: 12 });

		const { action, input } = chain.sent[0];
		expect(action).toBe('resume');
		expect((input.owner as TransactionSigner).address).toBe(OWNER);
		const message = resumeMessage(AGENT, 12n);
		expect(ml_dsa44.verify(input.signature as Uint8Array, message, KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
	});

	test('refuses without signing or sending while the agent is active', async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).resume(AGENT_ID, OWNER))).toBe('AgentNotKilled');
		expect(chain.sent).toEqual([]);
	});
});
