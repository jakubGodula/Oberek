import { describe, expect, test } from 'bun:test';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { address, getBase16Encoder, type Signature, type TransactionSigner } from '@solana/kit';
import type { AgentFile } from './files';
import type { GuardClient } from './guard-client';
import { GUARD_ERROR_CODES } from './guard-errors';
import type { AgentState } from './instructions';
import { batchMessage, GUARD_CONTEXT, resumeMessage, stepMessage } from './message';
import type { SendResult } from './transaction';
import { GuardError, type LandedTransaction } from './guard';
import { OnchainGuard, type ChainCalls } from './onchain-guard';

const AGENT_ID = 'tick-01';
const OWNER = address('ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq');
const STRANGER = address('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
const AGENT = address('BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN');
const AGENT_KEY = address('CA61y1mTZQ6CSgv4iNAPYHHV16BoYAcdcb2xRBK72nqs');
const FEE_PAYER_ADDRESS = address('C6zgep8phi8fg4aA1wqS6ugzBAvh9UtXEyj3L8MyQnuJ');
const ONE_SOL = 1_000_000_000n;
const KEYS = ml_dsa44.keygen();
const DECISION_HASH = 'ab'.repeat(32);
const DECISION_HASH_BYTES = new Uint8Array(getBase16Encoder().encode(DECISION_HASH));
const ROOT = 'b7'.repeat(32);
const ROOT_BYTES = new Uint8Array(getBase16Encoder().encode(ROOT));
const PROGRAM_ERROR = (code: number) => ({ InstructionError: [0, { Custom: code }] });

const IDENTITY: AgentFile = { owner: OWNER, agentKey: AGENT_KEY, agent: AGENT, mldsaSecretKey: KEYS.secretKey };
const signer = (signerAddress: string) => ({ address: signerAddress }) as unknown as TransactionSigner;
const FEE_PAYER = signer(FEE_PAYER_ADDRESS);

/** The chain calls over one in-memory Agent account; records what would have been sent. Every account holds 1 SOL. */
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
	const balances = new Map<string, bigint>();
	const land = (action: string, input: Record<string, unknown>): SendResult => {
		sent.push({ action, input });
		return { signature: 'tx-signature' as Signature, err: landedError, computeUnits: 0n, transactionBytes: 0 };
	};
	const calls: ChainCalls = {
		fetchAgent: async () => state,
		fetchBalance: async (_, account) => balances.get(account) ?? ONE_SOL,
		recordStep: async (_, step) => land('recordStep', step),
		recordBatch: async (_, batch) => land('recordBatch', batch),
		killAgent: async (_, owner, agent) => land('kill', { owner, agent }),
		resumeAgent: async (_, resume) => land('resume', resume)
	};
	return {
		calls,
		sent,
		failOnChainWith: (err: unknown) => (landedError = err),
		/** Another sender's step lands first: the counter moves before this transaction is processed. */
		loseNextSendToAnotherSender: () => {
			const land = calls.recordStep;
			const landBatch = calls.recordBatch;
			calls.recordStep = async (client, step) => {
				state.counter += 1n;
				return land(client, step);
			};
			calls.recordBatch = async (client, batch) => {
				state.counter += 1n;
				return landBatch(client, batch);
			};
		},
		empty: (account: string) => balances.set(account, 0n)
	};
}

function guardOver(chain: ReturnType<typeof fakeChain>, serverOwner = signer(OWNER), landed: LandedTransaction[] = []) {
	return new OnchainGuard({
		client: {} as GuardClient,
		feePayer: FEE_PAYER,
		owner: serverOwner,
		identityOf: (agentId) => {
			if (agentId !== AGENT_ID) throw new GuardError('AgentNotFound', `no ${agentId}`);
			return IDENTITY;
		},
		chain: chain.calls,
		onLanded: (transaction) => landed.push(transaction)
	});
}

/** A guard in the agent's own process: it pays for steps but holds no owner key. */
function guardWithoutOwner(chain: ReturnType<typeof fakeChain>) {
	return new OnchainGuard({ client: {} as GuardClient, feePayer: FEE_PAYER, identityOf: () => IDENTITY, chain: chain.calls });
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
			agentKey: AGENT_KEY,
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

	test('reports the landed step with its signature', async () => {
		const landed: LandedTransaction[] = [];
		await guardOver(fakeChain(), signer(OWNER), landed).recordStep(AGENT_ID, 12, DECISION_HASH);
		expect(landed).toEqual([
			{ agentId: AGENT_ID, event: 'StepRecorded', counter: 12, signature: 'tx-signature', decisionHash: DECISION_HASH }
		]);
	});

	test('reports nothing when the step is refused or fails on chain', async () => {
		const landed: LandedTransaction[] = [];
		const killed = fakeChain({ status: 'Killed' });
		await guardErrorCode(guardOver(killed, signer(OWNER), landed).recordStep(AGENT_ID, 12, DECISION_HASH));
		const failing = fakeChain();
		failing.failOnChainWith(PROGRAM_ERROR(6006));
		await guardOver(failing, signer(OWNER), landed).recordStep(AGENT_ID, 12, DECISION_HASH).catch(() => {});
		expect(landed).toEqual([]);
	});

	test('refuses without sending while the agent is killed', async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentKilled');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a step without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 1, DECISION_HASH))).toBe('AgentPending');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a kill without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).kill(AGENT_ID))).toBe('AgentNotActive');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a resume without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).resume(AGENT_ID))).toBe('AgentNotKilled');
		expect(chain.sent).toEqual([]);
	});

	test('reports the program refusing a pending agent as AgentPending', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(GUARD_ERROR_CODES.AgentPending));
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentPending');
	});

	test('refuses without sending a step for any counter but the next one', async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 11, DECISION_HASH))).toBe('CounterMismatch');
		expect(chain.sent).toEqual([]);
	});

	test('refuses without sending when the fee payer cannot pay for the step', async () => {
		const chain = fakeChain();
		chain.empty(FEE_PAYER_ADDRESS);
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('PayerUnfunded');
		expect(chain.sent).toEqual([]);
	});

	test('reports a kill that landed between the read and the send as AgentKilled', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(6000));
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentKilled');
	});

	test('reports a step whose counter another sender took first as CounterMismatch', async () => {
		const chain = fakeChain();
		chain.loseNextSendToAnotherSender();
		chain.failOnChainWith(PROGRAM_ERROR(GUARD_ERROR_CODES.VerifyFailed));
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('CounterMismatch');
	});

	test('reports a batch whose counter another sender took first as CounterMismatch', async () => {
		const chain = fakeChain();
		chain.loseNextSendToAnotherSender();
		chain.failOnChainWith(PROGRAM_ERROR(GUARD_ERROR_CODES.VerifyFailed));
		expect(await guardErrorCode(guardOver(chain).recordBatch(AGENT_ID, 12, ROOT, 5))).toBe('CounterMismatch');
	});

	test('reports any other on-chain failure as a plain error naming the program error', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(6006));
		await expect(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH)).rejects.toThrow('VerifyFailed');
	});
});

describe('kill', () => {
	test('refuses without sending when it holds no owner key', async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardWithoutOwner(chain).kill(AGENT_ID))).toBe('NotOwner');
		expect(chain.sent).toEqual([]);
	});

	test("sends kill signed with the server's owner key", async () => {
		const chain = fakeChain();
		expect((await guardOver(chain).kill(AGENT_ID)).status).toBe('Killed');
		expect(chain.sent[0]).toMatchObject({ action: 'kill', input: { agent: AGENT } });
		expect((chain.sent[0].input.owner as TransactionSigner).address).toBe(OWNER);
	});

	test('reports the landed kill with the unchanged counter', async () => {
		const landed: LandedTransaction[] = [];
		await guardOver(fakeChain(), signer(OWNER), landed).kill(AGENT_ID);
		expect(landed).toEqual([{ agentId: AGENT_ID, event: 'AgentKilled', counter: 11, signature: 'tx-signature' }]);
	});

	test('refuses without sending when the agent is already killed', async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardErrorCode(guardOver(chain).kill(AGENT_ID))).toBe('AgentNotActive');
		expect(chain.sent).toEqual([]);
	});

	test('refuses without sending when the owner cannot pay for the kill', async () => {
		const chain = fakeChain();
		chain.empty(OWNER);
		expect(await guardErrorCode(guardOver(chain).kill(AGENT_ID))).toBe('PayerUnfunded');
		expect(chain.sent).toEqual([]);
	});

	test('does not need the fee payer, which pays only for steps', async () => {
		const chain = fakeChain();
		chain.empty(FEE_PAYER_ADDRESS);
		expect((await guardOver(chain).kill(AGENT_ID)).status).toBe('Killed');
	});

	test("refuses without sending when the server's key does not own the agent", async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain, signer(STRANGER)).kill(AGENT_ID))).toBe('NotOwner');
		expect(chain.sent).toEqual([]);
	});
});

describe('resume', () => {
	test('refuses without sending when it holds no owner key', async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardErrorCode(guardWithoutOwner(chain).resume(AGENT_ID))).toBe('NotOwner');
		expect(chain.sent).toEqual([]);
	});

	test("signs the resume for the next counter with the agent's key and sends it with the owner's key", async () => {
		const chain = fakeChain({ status: 'Killed' });
		expect(await guardOver(chain).resume(AGENT_ID)).toMatchObject({ status: 'Active', counter: 12 });

		const { action, input } = chain.sent[0];
		expect(action).toBe('resume');
		expect((input.owner as TransactionSigner).address).toBe(OWNER);
		const message = resumeMessage(AGENT, 12n);
		expect(ml_dsa44.verify(input.signature as Uint8Array, message, KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
	});

	test('reports the landed resume with the counter it used up', async () => {
		const landed: LandedTransaction[] = [];
		await guardOver(fakeChain({ status: 'Killed' }), signer(OWNER), landed).resume(AGENT_ID);
		expect(landed).toEqual([{ agentId: AGENT_ID, event: 'AgentResumed', counter: 12, signature: 'tx-signature' }]);
	});

	test('refuses without sending when the owner cannot pay for the resume', async () => {
		const chain = fakeChain({ status: 'Killed' });
		chain.empty(OWNER);
		expect(await guardErrorCode(guardOver(chain).resume(AGENT_ID))).toBe('PayerUnfunded');
		expect(chain.sent).toEqual([]);
	});

	test('refuses without signing or sending while the agent is active', async () => {
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).resume(AGENT_ID))).toBe('AgentNotKilled');
		expect(chain.sent).toEqual([]);
	});
});

describe('recordBatch', () => {
	test("signs the batch message for the counter with the agent's key and reports the landed batch", async () => {
		const chain = fakeChain();
		const landed: LandedTransaction[] = [];
		const account = await guardOver(chain, signer(OWNER), landed).recordBatch(AGENT_ID, 12, ROOT, 5);

		expect(account).toMatchObject({ counter: 12, lastDecision: ROOT });
		const { action, input } = chain.sent[0];
		expect(action).toBe('recordBatch');
		expect(input).toMatchObject({ feePayer: FEE_PAYER, agent: AGENT, agentKey: AGENT_KEY, root: ROOT_BYTES, size: 5 });
		const signed = batchMessage(AGENT, 12n, ROOT_BYTES, 5);
		expect(ml_dsa44.verify(input.signature as Uint8Array, signed, KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
		expect(landed).toEqual([{ agentId: AGENT_ID, event: 'BatchRecorded', counter: 12, signature: 'tx-signature', root: ROOT, size: 5 }]);
	});

	test('refuses a killed agent and a stale counter without sending', async () => {
		expect(await guardErrorCode(guardOver(fakeChain({ status: 'Killed' })).recordBatch(AGENT_ID, 12, ROOT, 5))).toBe('AgentKilled');
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).recordBatch(AGENT_ID, 11, ROOT, 5))).toBe('CounterMismatch');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a batch without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).recordBatch(AGENT_ID, 1, ROOT, 5))).toBe('AgentPending');
		expect(chain.sent).toEqual([]);
	});
});
