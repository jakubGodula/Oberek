import { describe, expect, test } from 'bun:test';
import { agentsAnswer, changeNotices } from './notices';
import type { AgentView } from './oberek-api';

const SUMMARY = 'PROPOSE (drift, needs approval): sell 1.234 SOL @ $152.10 (SOL 62.0% → 50.0%) [simulated shock -3%]';

function agent(overrides: Partial<AgentView> = {}): AgentView {
	return {
		id: 'sentinel-01',
		name: 'Oberek Sentinel Alpha',
		status: 'ACTIVE',
		currentTask: 'HOLD @ $152.10',
		actionsExecuted: 40,
		fleet: { pendingProposal: null },
		...overrides
	};
}

const awaiting = (counter = 41, summary = SUMMARY) =>
	agent({ status: 'AWAITING_APPROVAL', actionsExecuted: counter, fleet: { pendingProposal: { counter, summary } } });
const paused = () => agent({ status: 'PAUSED' });
const mock = () => agent({ id: 'arbiter-02', name: 'Arbiter Beta', status: 'PAUSED', fleet: undefined });
const buttons = (notice: { keyboard?: { text: string }[][] }) => notice.keyboard?.[0].map((button) => button.text);

const PROPOSAL_TEXT = [
	'⚠️ Oberek Sentinel Alpha waits for your verdict · step #41',
	SUMMARY,
	'',
	'Accept: the verdict goes on-chain and the agent executes the trade in its next cycle.',
	'Reject: the verdict goes on-chain and the treasury stays unchanged.'
].join('\n');

describe('changeNotices', () => {
	test('a new proposal: what to accept, with Accept, Reject and Kill', () => {
		const [notice] = changeNotices([agent()], [awaiting()]);
		expect(notice.text).toBe(PROPOSAL_TEXT);
		expect(buttons(notice)).toEqual(['✅ Accept', '❌ Reject', '🛑 Kill']);
	});

	test('a killed agent, with Resume', () => {
		const notices = changeNotices([agent()], [paused()]);
		expect(notices).toHaveLength(1);
		expect(notices[0].text).toBe('⏸ Oberek Sentinel Alpha is killed · step 40');
		expect(buttons(notices[0])).toEqual(['▶ Resume']);
	});

	test('a resumed agent, with Kill', () => {
		const notices = changeNotices([paused()], [agent()]);
		expect(notices[0].text).toBe('▶ Oberek Sentinel Alpha is running again · step 40');
		expect(buttons(notices[0])).toEqual(['🛑 Kill']);
	});

	test('nothing when nothing changed', () => {
		expect(changeNotices([agent(), awaiting()], [agent(), awaiting()])).toEqual([]);
	});

	test('nothing when a proposal is decided and the agent runs on', () => {
		expect(changeNotices([awaiting()], [agent()])).toEqual([]);
	});

	test('a second proposal within one poll gets its own message', () => {
		const notices = changeNotices([awaiting(41)], [awaiting(43, 'PROPOSE: buy 2.000 SOL')]);
		expect(notices).toHaveLength(1);
		expect(notices[0].text).toContain('step #43');
		expect(notices[0].text).toContain('PROPOSE: buy 2.000 SOL');
	});

	test('the first read only reports proposals already waiting', () => {
		const notices = changeNotices(null, [paused(), awaiting()]);
		expect(notices.map((notice) => notice.text)).toEqual([PROPOSAL_TEXT]);
	});

	test('mock agents are ignored', () => {
		expect(changeNotices([], [mock()])).toEqual([]);
	});

	test('an agent whose buttons cannot fit gets a pointer to the page', () => {
		const [notice] = changeNotices([agent({ id: 'a'.repeat(64) })], [{ ...paused(), id: 'a'.repeat(64) }]);
		expect(notice.keyboard).toBeUndefined();
		expect(notice.text).toEndWith('Its id is too long for Telegram buttons: use the page.');
	});
});

describe('agentsAnswer', () => {
	test('one message per fleet agent, with the buttons its state allows', () => {
		const unavailable = agent({ id: 'tick-01', name: 'Oberek Tick One', status: 'UNAVAILABLE', currentTask: 'Unavailable: RPC down' });
		const notices = agentsAnswer([agent(), paused(), awaiting(), unavailable, mock()]);
		expect(notices.map((notice) => notice.text)).toEqual([
			'▶ Oberek Sentinel Alpha · running · step 40\nHOLD @ $152.10',
			'⏸ Oberek Sentinel Alpha · killed · step 40',
			PROPOSAL_TEXT,
			'Oberek Tick One · Unavailable: RPC down'
		]);
		expect(notices.map(buttons)).toEqual([['🛑 Kill'], ['▶ Resume'], ['✅ Accept', '❌ Reject', '🛑 Kill'], undefined]);
	});

	test('says so when the fleet is empty', () => {
		expect(agentsAnswer([mock()])).toEqual([{ text: 'No fleet agents on the server.' }]);
	});
});
