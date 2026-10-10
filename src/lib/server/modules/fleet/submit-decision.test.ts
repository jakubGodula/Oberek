import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, NO_DECISION, type AgentGuard, type GuardAccount } from '../agent-guard/guard';
import { Fleet } from './fleet';
import { RateLimitedError, StepThrottle } from './step-throttle';
import { parseSubmission, submitDecision, type FleetRuntime } from './submit-decision';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const AGENT = 'test-agent';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const SUBMISSION = { kind: 'tick', decision: { action: 'SELL', amountSol: 0.5 }, summary: 'SELL 0.5 SOL' };

let rootDir: string;
let runtime: FleetRuntime;

/** Stands in for the program: one account in memory, with the step and kill rules submitDecision depends on. */
class MemoryGuard implements AgentGuard {
	private account: GuardAccount = { owner: OWNER, status: 'Active', counter: 0, lastDecision: NO_DECISION };

	async readAgent(agentId: string): Promise<GuardAccount> {
		if (agentId !== AGENT) throw new GuardError('AgentNotFound', `no ${agentId}`);
		return this.account;
	}

	async recordStep(agentId: string, counter: number, decisionHash: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		if (account.status === 'Killed') throw new GuardError('AgentKilled', 'killed');
		if (counter !== account.counter + 1) throw new GuardError('CounterMismatch', 'stale counter');
		return (this.account = { ...account, counter, lastDecision: decisionHash });
	}

	async kill(agentId: string): Promise<GuardAccount> {
		return (this.account = { ...(await this.readAgent(agentId)), status: 'Killed' });
	}

	async resume(agentId: string): Promise<GuardAccount> {
		const account = await this.readAgent(agentId);
		return (this.account = { ...account, status: 'Active', counter: account.counter + 1 });
	}
}

beforeEach(async () => {
	rootDir = mkdtempSync(join(tmpdir(), 'fleet-'));
	const guard = new MemoryGuard();
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Test Agent', riskLevel: 'LOW', registeredAt: NOW.getTime() });
	runtime = { guard, fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('submitDecision', () => {
	test('records the step and logs the record whose hash the guard keeps', async () => {
		expect(await submitDecision(runtime, AGENT, SUBMISSION)).toEqual({ counter: 1 });

		const logged = runtime.fleet.lastDecision(AGENT)!;
		expect(logged.record).toEqual({ agent: AGENT, counter: 1, ...SUBMISSION, observedAt: NOW.toISOString() });
		const recomputed = createHash('sha256').update(JSON.stringify(logged.record)).digest('hex');
		expect(logged.decisionHash).toBe(recomputed);
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(recomputed);
	});

	test('refuses a decision while the agent is killed and logs nothing', async () => {
		await runtime.guard.kill(AGENT, OWNER);
		const error = await submitDecision(runtime, AGENT, SUBMISSION).catch((caught: unknown) => caught);
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(runtime.fleet.lastDecision(AGENT)).toBeUndefined();
	});

	test('logs the record as unconfirmed when the guard fails without a verdict, since the step may still land', async () => {
		const timingOut: AgentGuard = {
			...runtime.guard,
			readAgent: (agentId) => runtime.guard.readAgent(agentId),
			recordStep: async () => {
				throw new Error('confirmation timed out');
			}
		};
		const error = await submitDecision({ ...runtime, guard: timingOut }, AGENT, SUBMISSION).catch((caught) => caught);
		expect((error as Error).message).toBe('confirmation timed out');
		expect(runtime.fleet.lastDecision(AGENT)).toMatchObject({ record: { counter: 1 }, unconfirmed: true });
	});

	test('refuses a second decision inside the minimum interval before it reaches the guard', async () => {
		const throttled = { ...runtime, throttle: new StepThrottle(10_000) };
		await submitDecision(throttled, AGENT, SUBMISSION);
		const error = await submitDecision(throttled, AGENT, SUBMISSION).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(RateLimitedError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(1);
	});

	test('refuses an agent outside the fleet', async () => {
		const error = await submitDecision(runtime, 'stranger', SUBMISSION).catch((caught: unknown) => caught);
		expect((error as GuardError).code).toBe('AgentNotFound');
	});
});

describe('parseSubmission', () => {
	test('accepts kind, decision object and summary', () => {
		expect(parseSubmission(SUBMISSION)).toEqual(SUBMISSION);
	});

	test.each([
		['no body', null],
		['missing kind', { decision: {}, summary: 'x' }],
		['decision not an object', { kind: 'k', decision: [1], summary: 'x' }],
		['summary not a string', { kind: 'k', decision: {}, summary: 1 }]
	])('rejects %s', (_, body) => {
		expect(parseSubmission(body)).toBeNull();
	});
});
