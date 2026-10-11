import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, type AgentGuard } from '../agent-guard/guard';
import { AwaitingApprovalError } from './approval';
import { Fleet } from './fleet';
import { RateLimitedError, StepThrottle } from './step-throttle';
import { parseSubmission, submitDecision, type FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const AGENT = 'test-agent';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const SUBMISSION = { kind: 'tick', decision: { action: 'SELL', amountSol: 0.5 }, summary: 'SELL 0.5 SOL' };
const PROPOSAL = { ...SUBMISSION, requiresApproval: true as const };

let rootDir: string;
let runtime: FleetRuntime;

beforeEach(async () => {
	rootDir = mkdtempSync(join(tmpdir(), 'fleet-'));
	const guard = new MemoryGuard(AGENT, OWNER);
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

describe('proposals', () => {
	test('records the approval flag in the record whose hash the guard keeps', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const logged = runtime.fleet.lastDecision(AGENT)!;
		expect(logged.record.requiresApproval).toBe(true);
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(logged.decisionHash);
	});

	test('refuses the next decision while the proposal waits, before the throttle and the guard', async () => {
		const throttled = { ...runtime, throttle: new StepThrottle(10_000) };
		await submitDecision(runtime, AGENT, PROPOSAL);
		const error = await submitDecision(throttled, AGENT, SUBMISSION).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(AwaitingApprovalError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(1);
		expect(() => throttled.throttle.claim(AGENT, NOW.getTime())).not.toThrow();
	});

	test('accepts the next decision when the latest one is not a proposal', async () => {
		await submitDecision(runtime, AGENT, SUBMISSION);
		expect(await submitDecision(runtime, AGENT, SUBMISSION)).toEqual({ counter: 2 });
	});
});

describe('parseSubmission', () => {
	test('accepts a submission that requires approval', () => {
		expect(parseSubmission(PROPOSAL)).toEqual(PROPOSAL);
	});

	test.each([
		['false', false],
		['a string', 'yes'],
		['null', null]
	])('rejects requiresApproval set to %s', (_, requiresApproval) => {
		expect(parseSubmission({ ...SUBMISSION, requiresApproval })).toBeNull();
	});

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
