import { describe, expect, test } from 'bun:test';
import { explorerTxUrl, groupOnchainLog, type OnchainLogItem } from './onchain-log';

let nextCounter = 100;

function item(agentId: string, event: OnchainLogItem['event'], extra: Partial<OnchainLogItem> = {}): OnchainLogItem {
	const counter = nextCounter--;
	return {
		id: `sig-${agentId}-${counter}`,
		agentId,
		agentName: agentId,
		event,
		counter,
		signature: `sig-${agentId}-${counter}`,
		landedAt: counter,
		...extra
	};
}

const step = (agentId: string) => item(agentId, 'StepRecorded', { summary: 'HOLD' });

describe('groupOnchainLog', () => {
	test("gathers one agent's consecutive steps into one group, newest first", () => {
		const steps = [step('sentinel-01'), step('sentinel-01'), step('sentinel-01')];
		expect(groupOnchainLog(steps)).toEqual([
			{ type: 'steps', key: `sentinel-01:${steps[2].counter}`, agentId: 'sentinel-01', agentName: 'sentinel-01', items: steps }
		]);
	});

	test('keeps each operator action on its own row, splitting the steps around it', () => {
		const [newer, kill, older] = [step('sentinel-01'), item('sentinel-01', 'AgentKilled'), step('sentinel-01')];
		expect(groupOnchainLog([newer, kill, older]).map((row) => row.type)).toEqual(['steps', 'action', 'steps']);
		expect(groupOnchainLog([kill])).toEqual([{ type: 'action', item: kill }]);
	});

	test("counts the owner's verdict as an operator action, not an agent step", () => {
		const verdict = item('sentinel-01', 'StepRecorded', { verdict: 'accept' });
		expect(groupOnchainLog([step('sentinel-01'), verdict]).map((row) => row.type)).toEqual(['steps', 'action']);
	});

	test("starts a new group at another agent's step", () => {
		const rows = groupOnchainLog([step('sentinel-01'), step('tick-01'), step('tick-01'), step('sentinel-01')]);
		expect(rows.map((row) => (row.type === 'steps' ? `${row.agentId}x${row.items.length}` : row.type))).toEqual([
			'sentinel-01x1',
			'tick-01x2',
			'sentinel-01x1'
		]);
	});

	test("keys a group by its oldest step, which stays put as newer steps join it", () => {
		const older = step('sentinel-01');
		const before = groupOnchainLog([older]);
		const after = groupOnchainLog([step('sentinel-01'), older]);
		expect(after[0].type === 'steps' && after[0].key).toBe(before[0].type === 'steps' && before[0].key);
	});
});

test('links a transaction to the devnet explorer', () => {
	expect(explorerTxUrl('5Kx3abc')).toBe('https://explorer.solana.com/tx/5Kx3abc?cluster=devnet');
});
