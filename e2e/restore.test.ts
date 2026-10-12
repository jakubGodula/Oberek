import { expect, test } from 'bun:test';
import { queuedAgents, restoreRequests, unavailable, type FleetCard } from './restore';

function card(id: string, status: FleetCard['status'], pendingCounter: number | null = null, queued = 0): FleetCard {
	return {
		id,
		status,
		currentTask: 'TICK',
		fleet: { pendingProposal: pendingCounter === null ? null : { counter: pendingCounter, decision: {} }, queued }
	};
}

test('asks for nothing when every agent is active with nothing waiting', () => {
	expect(restoreRequests([card('tick-01', 'ACTIVE'), card('sentinel-01', 'ACTIVE')])).toEqual([]);
});

test('resumes a killed agent', () => {
	expect(restoreRequests([card('tick-01', 'PAUSED')])).toEqual([
		{ path: '/api/agents/tick-01/control', body: { action: 'resume' } }
	]);
});

test('rejects a waiting proposal by its counter', () => {
	expect(restoreRequests([card('sentinel-01', 'AWAITING_APPROVAL', 41)])).toEqual([
		{ path: '/api/agents/sentinel-01/approval', body: { verdict: 'reject', counter: 41 } }
	]);
});

test('resumes a killed agent before rejecting its waiting proposal', () => {
	expect(restoreRequests([card('sentinel-01', 'PAUSED', 7)]).map((request) => request.path)).toEqual([
		'/api/agents/sentinel-01/control',
		'/api/agents/sentinel-01/approval'
	]);
});

test('names the agents the server could not read, with the reason', () => {
	const unreadable = { ...card('tick-01', 'UNAVAILABLE'), currentTask: 'Unavailable: fetch failed' };
	expect(unavailable([unreadable, card('sentinel-01', 'ACTIVE')])).toEqual(['tick-01 (Unavailable: fetch failed)']);
});

test('names the agents whose decisions still wait in the server for their batch', () => {
	expect(queuedAgents([card('tick-01', 'ACTIVE', null, 3), card('sentinel-01', 'ACTIVE')])).toEqual(['tick-01']);
});
