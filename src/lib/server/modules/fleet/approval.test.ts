import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GuardError } from '../agent-guard/guard';
import { NoPendingProposalError, parseVerdict, proposalAwaiting, recordVerdict } from './approval';
import { Fleet } from './fleet';
import { StepThrottle } from './step-throttle';
import { submitDecision, type FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';

const OWNER = 'ftbMowner1111111111111111111111111111111111';
const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-10T15:00:00.000Z');
const PROPOSAL = {
	kind: 'sentinel',
	decision: { action: 'REBALANCE', approval: 'required' },
	summary: 'PROPOSE (drift, needs approval): buy 14.798 SOL @ $106.15 (SOL 49.24% → 50.00%)',
	requiresApproval: true as const
};
const HOLD = { kind: 'sentinel', decision: { action: 'HOLD' }, summary: 'HOLD' };

let rootDir: string;
let runtime: FleetRuntime;

const pending = async () => proposalAwaiting(runtime.fleet, AGENT, await runtime.guard.readAgent(AGENT));
const failure = (promise: Promise<unknown>) => promise.then(() => undefined, (caught: unknown) => caught);

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'approval-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() });
	runtime = { guard: new MemoryGuard(AGENT, OWNER), fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('proposalAwaiting', () => {
	test('is null before any step', async () => {
		expect(await pending()).toBeNull();
	});

	test('is null when the latest decision is not a proposal', async () => {
		await submitDecision(runtime, AGENT, HOLD);
		expect(await pending()).toBeNull();
	});

	test('is the latest decision when it is a proposal', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		expect((await pending())?.record.counter).toBe(1);
	});

	test('survives a kill and a resume, which do not change the latest decision', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await runtime.guard.kill(AGENT, OWNER);
		await runtime.guard.resume(AGENT, OWNER);
		expect((await pending())?.record.counter).toBe(1);
	});
});

describe('recordVerdict', () => {
	test('records an accept as the next step, carrying the proposal and the owner', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const proposalHash = runtime.fleet.lastDecision(AGENT)!.decisionHash;

		const { record, decisionHash } = await recordVerdict(runtime, AGENT, 'accept');

		expect(record).toEqual({
			agent: AGENT,
			counter: 2,
			kind: 'approval',
			decision: {
				verdict: 'accept',
				proposal: {
					counter: 1,
					decisionHash: proposalHash,
					kind: PROPOSAL.kind,
					decision: PROPOSAL.decision,
					summary: PROPOSAL.summary
				},
				decidedBy: OWNER
			},
			summary: `APPROVED: ${PROPOSAL.summary}`,
			observedAt: NOW.toISOString()
		});
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(decisionHash);
		expect(await pending()).toBeNull();
	});

	test('records a reject with its own summary', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const { record } = await recordVerdict(runtime, AGENT, 'reject');
		expect(record.summary).toBe(`REJECTED: ${PROPOSAL.summary}`);
		expect(record.decision.verdict).toBe('reject');
	});

	test('refuses a verdict when no proposal waits', async () => {
		await submitDecision(runtime, AGENT, HOLD);
		expect(await failure(recordVerdict(runtime, AGENT, 'accept'))).toBeInstanceOf(NoPendingProposalError);
	});

	test('refuses a second verdict on the same proposal (double click)', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await recordVerdict(runtime, AGENT, 'accept');
		expect(await failure(recordVerdict(runtime, AGENT, 'accept'))).toBeInstanceOf(NoPendingProposalError);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(2);
	});

	test('records one of two verdicts sent at once and refuses the other as already decided', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		const outcomes = await Promise.allSettled([
			recordVerdict(runtime, AGENT, 'accept'),
			recordVerdict(runtime, AGENT, 'reject')
		]);
		expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
		expect((outcomes[1] as PromiseRejectedResult).reason).toBeInstanceOf(NoPendingProposalError);
		expect(runtime.fleet.recentDecisions(AGENT, 10).map((entry) => entry.record.counter)).toEqual([2, 1]);
	});

	test('is refused by the guard while the agent is killed, logging nothing', async () => {
		await submitDecision(runtime, AGENT, PROPOSAL);
		await runtime.guard.kill(AGENT, OWNER);
		const error = await failure(recordVerdict(runtime, AGENT, 'accept'));
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(runtime.fleet.lastDecision(AGENT)!.record.counter).toBe(1);
	});

	test('is not throttled: it is the owner acting, like kill and resume', async () => {
		const throttled = { ...runtime, throttle: new StepThrottle(10_000) };
		await submitDecision(throttled, AGENT, PROPOSAL);
		expect((await recordVerdict(throttled, AGENT, 'reject')).record.counter).toBe(2);
	});

	test('refuses an agent outside the fleet', async () => {
		const error = await failure(recordVerdict(runtime, 'stranger', 'accept'));
		expect((error as GuardError).code).toBe('AgentNotFound');
	});
});

describe('parseVerdict', () => {
	test.each(['accept', 'reject'])('accepts %s', (verdict) => {
		expect(parseVerdict({ verdict })).toBe(verdict as 'accept' | 'reject');
	});

	test.each([['no body', null], ['another word', { verdict: 'approve' }], ['no verdict', {}]])('rejects %s', (_, body) => {
		expect(parseVerdict(body)).toBeNull();
	});
});
