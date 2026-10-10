import { expect, test } from 'bun:test';
import { GuardError } from '../agent-guard/guard';
import { fleetErrorResponse } from './http-errors';
import { DecisionNotInLogError } from './latest-decision';
import { FleetNotConfiguredError } from './runtime';

async function answer(error: unknown): Promise<{ status: number; body: unknown }> {
	const response = fleetErrorResponse(error, 'test request');
	return { status: response.status, body: await response.json() };
}

test('answers a guard refusal with its status and code', async () => {
	expect(await answer(new GuardError('AgentKilled', 'agent x is killed'))).toEqual({
		status: 409,
		body: { error: 'AgentKilled', message: 'agent x is killed' }
	});
});

test('answers a log that disagrees with the chain with 409 DecisionNotInLog', async () => {
	expect(await answer(new DecisionNotInLogError('not in log'))).toEqual({
		status: 409,
		body: { error: 'DecisionNotInLog', message: 'not in log' }
	});
});

test('answers a fleet without configuration with 503', async () => {
	expect(await answer(new FleetNotConfiguredError('GUARD_PROGRAM_ID is not set'))).toEqual({
		status: 503,
		body: { error: 'FleetNotConfigured', message: 'GUARD_PROGRAM_ID is not set' }
	});
});

test('answers anything else as a guard without a verdict', async () => {
	expect(await answer(new Error('RPC timeout'))).toEqual({
		status: 502,
		body: { error: 'GuardUnavailable', message: 'RPC timeout' }
	});
});
