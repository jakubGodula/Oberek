import { describe, expect, test } from 'bun:test';
import { keyboardFor, parseCallbackData, requestFor, resultLine } from './buttons';

describe('keyboardFor', () => {
	test('one row of labelled buttons; a verdict also carries the proposal it decides', () => {
		expect(keyboardFor('sentinel-01', ['accept', 'reject', 'kill'], 41)).toEqual([
			[
				{ text: '✅ Accept', callback_data: 'accept:sentinel-01:41' },
				{ text: '❌ Reject', callback_data: 'reject:sentinel-01:41' },
				{ text: '🛑 Kill', callback_data: 'kill:sentinel-01' }
			]
		]);
	});

	test('a verdict button without the proposal counter is a programming error', () => {
		expect(() => keyboardFor('sentinel-01', ['accept'])).toThrow('a verdict button needs the proposal counter');
	});

	test('is null when the callback data would pass 64 bytes', () => {
		expect(keyboardFor('a'.repeat(58), ['resume'])).toBeNull();
		expect(keyboardFor('a'.repeat(57), ['resume'])).not.toBeNull();
		expect(keyboardFor('a'.repeat(55), ['accept'], 41)).toBeNull();
		expect(keyboardFor('a'.repeat(54), ['accept'], 41)).not.toBeNull();
	});
});

describe('parseCallbackData', () => {
	test('reads back what keyboardFor wrote', () => {
		for (const action of ['kill', 'resume'] as const) {
			const data = keyboardFor('tick-01', [action])?.[0][0].callback_data ?? '';
			expect(parseCallbackData(data)).toEqual({ action, agentId: 'tick-01' });
		}
		for (const action of ['accept', 'reject'] as const) {
			const data = keyboardFor('tick-01', [action], 41)?.[0][0].callback_data ?? '';
			expect(parseCallbackData(data)).toEqual({ action, agentId: 'tick-01', proposalCounter: 41 });
		}
	});

	test('refuses anything else', () => {
		const refused = [
			'',
			'kill',
			'pause:tick-01',
			'kill:',
			'kill:../etc',
			'kill:tick 01',
			'kill:tick-01:41',
			'accept:tick-01',
			'accept:tick-01:',
			'accept:tick-01:0',
			'accept:tick-01:041',
			'accept:tick-01:-1',
			'accept:tick-01:4.1',
			'accept:tick-01:41:1'
		];
		for (const data of refused) expect(parseCallbackData(data)).toBeNull();
	});
});

describe('requestFor', () => {
	test('a verdict goes to the approval endpoint, naming the proposal', () => {
		expect(requestFor({ action: 'reject', agentId: 'sentinel-01', proposalCounter: 41 })).toEqual({
			path: '/api/agents/sentinel-01/approval',
			body: { verdict: 'reject', counter: 41 }
		});
	});

	test('kill and resume go to the control endpoint', () => {
		expect(requestFor({ action: 'kill', agentId: 'tick-01' })).toEqual({
			path: '/api/agents/tick-01/control',
			body: { action: 'kill' }
		});
	});
});

describe('resultLine', () => {
	test('names what was done and the step', () => {
		expect(resultLine('accept', { kind: 'answered', status: 200, body: { counter: 42 } })).toBe('✅ Approved · step 42');
		expect(resultLine('resume', { kind: 'answered', status: 200, body: { counter: 8 } })).toBe('▶ Resumed · step 8');
	});

	test('quotes the server on a refusal', () => {
		const answer = { kind: 'answered', status: 409, body: { message: 'no proposal waiting' } } as const;
		expect(resultLine('accept', answer)).toBe('Refused (409): no proposal waiting');
	});

	test('a refusal without a message still says refused', () => {
		expect(resultLine('kill', { kind: 'answered', status: 502, body: null })).toBe('Refused (502): no reason given');
	});

	test('reports an unreachable server', () => {
		expect(resultLine('kill', { kind: 'unreachable', reason: 'connection refused' })).toBe(
			'Server unreachable: connection refused'
		);
	});
});
