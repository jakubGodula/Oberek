import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FakeGuard } from '../agent-guard/fake-guard';
import { GuardError } from '../agent-guard/guard';
import { Fleet } from './fleet';
import { parseSubmission, submitDecision, type FleetRuntime } from './submit-decision';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const AGENT = 'test-agent';
const NOW = new Date('2026-10-10T12:00:00.000Z');
const SUBMISSION = { kind: 'market-scout', decision: { action: 'SELL', amountSol: 0.5 }, summary: 'SELL 0.5 SOL' };

let rootDir: string;
let runtime: FleetRuntime;

beforeEach(async () => {
	rootDir = mkdtempSync(join(tmpdir(), 'fleet-'));
	const guard = new FakeGuard(join(rootDir, 'chain'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	await guard.register(AGENT, OWNER);
	fleet.register({ id: AGENT, name: 'Test Agent', riskLevel: 'LOW', registeredAt: NOW.getTime() });
	runtime = { guard, fleet, now: () => NOW };
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
