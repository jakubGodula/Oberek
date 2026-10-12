import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuardError } from 'pq-agent-guard';
import { controlAgent, parseControlAction } from './control';
import { Fleet } from './fleet';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';
import { MemoryGuard } from 'pq-agent-guard/testing';
import { TEST_SEAL } from './testing/test-seal';

const OWNER = 'ftbMowner1111111111111111111111111111111111';
const AGENT = 'sentinel-01';
const NOW = new Date('2026-10-12T10:00:00.000Z');

let rootDir: string;
let guard: MemoryGuard;
let runtime: FleetRuntime;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'control-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Sentinel', riskLevel: 'MEDIUM', registeredAt: NOW.getTime() }, TEST_SEAL);
	guard = new MemoryGuard(AGENT, OWNER);
	runtime = { guard, fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('parseControlAction', () => {
	test('reads kill and resume', () => {
		expect(parseControlAction({ action: 'kill' })).toBe('kill');
		expect(parseControlAction({ action: 'resume' })).toBe('resume');
	});

	test('refuses anything else', () => {
		for (const body of [null, 'kill', {}, { action: 'pause' }, { action: 1 }]) {
			expect(parseControlAction(body)).toBeNull();
		}
	});
});

describe('controlAgent', () => {
	test('kill stops the agent, signed as its owner', async () => {
		const kill = spyOn(guard, 'kill');
		const account = await controlAgent(runtime, AGENT, 'kill');
		expect(account.status).toBe('Killed');
		expect(kill).toHaveBeenCalledWith(AGENT, OWNER);
	});

	test('resume lets a killed agent run again, using up one counter value', async () => {
		await controlAgent(runtime, AGENT, 'kill');
		const resume = spyOn(guard, 'resume');
		const account = await controlAgent(runtime, AGENT, 'resume');
		expect(account.status).toBe('Active');
		expect(account.counter).toBe(1);
		expect(resume).toHaveBeenCalledWith(AGENT, OWNER);
	});

	test('refuses an agent outside the fleet', async () => {
		const error = (await controlAgent(runtime, 'tick-99', 'kill').catch((caught: unknown) => caught)) as GuardError;
		expect(error.code).toBe('AgentNotFound');
	});
});
