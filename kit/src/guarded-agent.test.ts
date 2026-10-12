import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { assertPayerIsNotOwner, createAgentOwner, createGuardedAgent, subscriptionsUrlFor } from './guarded-agent';
import { GuardError, type GuardAccount, type GuardStatus } from './guard';
import { MemoryGuard } from './testing/memory-guard';

const AGENT_ID = 'kit-test';
const OWNER = 'owner-address';
const sha256Hex = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

function agentWith(status: GuardStatus = 'Active') {
	const guard = new MemoryGuard(AGENT_ID, OWNER, status);
	return { guard, agent: createGuardedAgent(guard, AGENT_ID) };
}

/** The GuardError code a refused call throws; fails the test if it does not throw one. */
async function refusalCode(call: Promise<unknown>): Promise<string> {
	try {
		await call;
	} catch (error) {
		if (error instanceof GuardError) return error.code;
		throw error;
	}
	throw new Error('expected a GuardError');
}

/** Another process took the next counter first. */
class RacedGuard extends MemoryGuard {
	override async recordStep(): Promise<GuardAccount> {
		throw new GuardError('CounterMismatch', 'another step took this counter');
	}
}

describe('createGuardedAgent step', () => {
	it('records the decision, then runs the action and returns its result', async () => {
		const { guard, agent } = agentWith();
		const decision = '{"action":"transfer","lamports":1000}';

		const step = await agent.step(decision, () => 42);

		expect(step).toEqual({ counter: 1, decisionHash: sha256Hex(decision), result: 42 });
		expect((await guard.readAgent(AGENT_ID)).lastDecision).toBe(sha256Hex(decision));
	});

	it('awaits an async action and returns its value', async () => {
		const { agent } = agentWith();

		const step = await agent.step('x', async () => 'done');

		expect(step.result).toBe('done');
	});

	it('hashes the UTF-8 bytes of a non-ASCII decision', async () => {
		const { agent } = agentWith();

		const step = await agent.step('zł → 1 SOL', () => undefined);

		expect(step.decisionHash).toBe(sha256Hex('zł → 1 SOL'));
	});

	it('records consecutive steps at counters 1, 2, 3', async () => {
		const { agent } = agentWith();

		const counters: number[] = [];
		for (const decision of ['a', 'b', 'c']) counters.push((await agent.step(decision, () => undefined)).counter);

		expect(counters).toEqual([1, 2, 3]);
	});

	it.each([
		['Killed', 'AgentKilled'],
		['Pending', 'AgentPending']
	] as const)('does not run the action for a %s agent', async (status, code) => {
		const { agent } = agentWith(status);
		let ran = false;

		expect(await refusalCode(agent.step('x', () => (ran = true)))).toBe(code);
		expect(ran).toBe(false);
	});

	it('does not run the action when the guard refuses the step', async () => {
		const agent = createGuardedAgent(new RacedGuard(AGENT_ID, OWNER), AGENT_ID);
		let ran = false;

		expect(await refusalCode(agent.step('x', () => (ran = true)))).toBe('CounterMismatch');
		expect(ran).toBe(false);
	});

	it('takes concurrent steps one after another, at consecutive counters', async () => {
		const { agent } = agentWith();

		const steps = await Promise.all([agent.step('a', () => 'first'), agent.step('b', () => 'second')]);

		expect(steps.map((step) => [step.counter, step.result])).toEqual([
			[1, 'first'],
			[2, 'second']
		]);
	});

	it('keeps the step recorded when the action throws', async () => {
		const { agent } = agentWith();

		await expect(
			agent.step('x', () => {
				throw new Error('transfer failed');
			})
		).rejects.toThrow('transfer failed');

		expect((await agent.status()).counter).toBe(1);
	});
});

describe('createGuardedAgent status', () => {
	it('reports the status of a fresh agent', async () => {
		const { agent } = agentWith();

		const account = await agent.status();

		expect(account.status).toBe('Active');
		expect(account.counter).toBe(0);
	});

	it('gives the agent no way to kill or resume itself', () => {
		const { agent } = agentWith();

		expect(Object.keys(agent).sort()).toEqual(['status', 'step']);
	});
});

describe('createAgentOwner', () => {
	it("stops the agent's steps with kill and lets them go on after resume, at the counter after the resume", async () => {
		const { guard, agent } = agentWith();
		const owner = createAgentOwner(guard, AGENT_ID);
		await agent.step('before', () => undefined);

		await owner.kill();
		expect(await refusalCode(agent.step('while killed', () => undefined))).toBe('AgentKilled');

		await owner.resume();
		const step = await agent.step('after', () => undefined);

		expect(step.counter).toBe(3);
	});
});

describe('subscriptionsUrlFor', () => {
	it.each([
		['https://api.devnet.solana.com', 'wss://api.devnet.solana.com'],
		['http://my-rpc.example:8899', 'ws://my-rpc.example:8899']
	])('derives the WebSocket URL of %s', (rpcUrl, wsUrl) => {
		expect(subscriptionsUrlFor(rpcUrl)).toBe(wsUrl);
	});
});

describe('assertPayerIsNotOwner', () => {
	const OWNER_ADDRESS = 'ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq';
	const AGENT_PAYER = 'C6zgep8phi8fg4aA1wqS6ugzBAvh9UtXEyj3L8MyQnuJ';

	it("refuses the owner's wallet as the agent's payer", () => {
		expect(() => assertPayerIsNotOwner(OWNER_ADDRESS, OWNER_ADDRESS)).toThrow('owner');
	});

	it('accepts any other payer', () => {
		expect(() => assertPayerIsNotOwner(AGENT_PAYER, OWNER_ADDRESS)).not.toThrow();
	});
});
