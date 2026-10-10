import { describe, expect, test } from 'bun:test';
import { ActionHistory, memoText, type HistoryEvent } from './action-history';

const ROOT = 'ab'.repeat(32);
const event = (decision: HistoryEvent['decision'], agentId = 'sentinel-01', timestamp = 1): HistoryEvent => ({
	agentId,
	agentName: 'Sentinel',
	decision,
	userAccount: 'ftbM1111111111111111111111111111111111111xyz',
	newRoot: ROOT,
	newStatus: 'ACTIVE',
	timestamp
});

describe('ActionHistory', () => {
	test('records an event with a short operator and its memo', () => {
		const history = new ActionHistory();
		history.record(event('accept'));
		expect(history.recent(10)).toEqual([
			{
				id: 'hist-1',
				agentId: 'sentinel-01',
				agentName: 'Sentinel',
				decision: 'accept',
				operator: 'ftbM...xyz',
				newRoot: ROOT,
				newStatus: 'ACTIVE',
				timestamp: 1,
				memoHash: `AEGIS_PQC_DMS:sentinel-01:ACCEPT:${ROOT.slice(0, 16)}`
			}
		]);
	});

	test('lists the newest first, at most the limit, optionally of one agent', () => {
		const history = new ActionHistory();
		history.record(event('pause', 'sentinel-01', 1));
		history.record(event('resume', 'tick-01', 2));
		history.record(event('reject', 'sentinel-01', 3));
		expect(history.recent(2).map((entry) => entry.decision)).toEqual(['reject', 'resume']);
		expect(history.recent(10, 'sentinel-01').map((entry) => entry.decision)).toEqual(['reject', 'pause']);
	});

	test('gives every entry its own id, even at the same time', () => {
		const history = new ActionHistory();
		history.record(event('accept'));
		history.record(event('reject'));
		expect(history.recent(10).map((entry) => entry.id)).toEqual(['hist-2', 'hist-1']);
	});
});

test('memoText names the agent, the decision and the root prefix', () => {
	expect(memoText('tick-01', 'resume', ROOT)).toBe(`AEGIS_PQC_DMS:tick-01:RESUME:${ROOT.slice(0, 16)}`);
});
