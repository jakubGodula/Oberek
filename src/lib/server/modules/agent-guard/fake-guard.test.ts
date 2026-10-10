import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FakeGuard } from './fake-guard';
import { GuardError, NO_DECISION } from './guard';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const STRANGER = '3mNQ1111111111111111111111111111111111111Pxz';
const AGENT = 'test-agent';
const DECISION_HASH = 'ab'.repeat(32);

let chainDir: string;
let guard: FakeGuard;

beforeEach(async () => {
	chainDir = mkdtempSync(join(tmpdir(), 'fake-chain-'));
	guard = new FakeGuard(chainDir);
	await guard.register(AGENT, OWNER);
});

afterEach(() => rmSync(chainDir, { recursive: true, force: true }));

async function expectGuardError(action: Promise<unknown>, code: string) {
	const error = await action.then(
		() => null,
		(caught: unknown) => caught
	);
	expect(error).toBeInstanceOf(GuardError);
	expect((error as GuardError).code).toBe(code);
}

describe('register', () => {
	test('creates an active account with counter 0 and no decision', async () => {
		expect(await guard.readAgent(AGENT)).toEqual({ owner: OWNER, status: 'Active', counter: 0, lastDecision: NO_DECISION });
	});

	test('refuses an agent that already exists', async () => {
		await expect(guard.register(AGENT, OWNER)).rejects.toThrow('already registered');
	});
});

describe('readAgent', () => {
	test('reports an unknown agent', async () => {
		await expectGuardError(guard.readAgent('nobody'), 'AgentNotFound');
	});

	test('rejects an id that could escape the chain directory', async () => {
		await expect(guard.readAgent('../etc')).rejects.toThrow('invalid agent id');
	});

	test('keeps the state across instances, like the chain across server restarts', async () => {
		await guard.kill(AGENT, OWNER);
		expect((await new FakeGuard(chainDir).readAgent(AGENT)).status).toBe('Killed');
	});
});

describe('recordStep', () => {
	test('counts the step and stores the decision hash', async () => {
		const account = await guard.recordStep(AGENT, 1, DECISION_HASH);
		expect(account.counter).toBe(1);
		expect(account.lastDecision).toBe(DECISION_HASH);
	});

	test('rejects a step while the agent is killed', async () => {
		await guard.kill(AGENT, OWNER);
		await expectGuardError(guard.recordStep(AGENT, 1, DECISION_HASH), 'AgentKilled');
		expect((await guard.readAgent(AGENT)).counter).toBe(0);
	});

	test('rejects a step built for any counter but the next one, like a signature over a stale counter', async () => {
		await guard.recordStep(AGENT, 1, DECISION_HASH);
		await expectGuardError(guard.recordStep(AGENT, 1, DECISION_HASH), 'CounterMismatch');
		await expectGuardError(guard.recordStep(AGENT, 3, DECISION_HASH), 'CounterMismatch');
		expect((await guard.readAgent(AGENT)).counter).toBe(1);
	});
});

describe('kill', () => {
	test('stops the agent when the owner asks', async () => {
		expect((await guard.kill(AGENT, OWNER)).status).toBe('Killed');
	});

	test('refuses anyone but the owner', async () => {
		await expectGuardError(guard.kill(AGENT, STRANGER), 'NotOwner');
		expect((await guard.readAgent(AGENT)).status).toBe('Active');
	});

	test('refuses an agent that is already killed', async () => {
		await guard.kill(AGENT, OWNER);
		await expectGuardError(guard.kill(AGENT, OWNER), 'AgentNotActive');
	});
});

describe('resume', () => {
	test('reactivates a killed agent and uses up one counter value', async () => {
		await guard.kill(AGENT, OWNER);
		const account = await guard.resume(AGENT, OWNER);
		expect(account.status).toBe('Active');
		expect(account.counter).toBe(1);
	});

	test('refuses an agent that is active', async () => {
		await expectGuardError(guard.resume(AGENT, OWNER), 'AgentNotKilled');
	});

	test('refuses anyone but the owner', async () => {
		await guard.kill(AGENT, OWNER);
		await expectGuardError(guard.resume(AGENT, STRANGER), 'NotOwner');
	});
});
