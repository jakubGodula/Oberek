import { describe, expect, test } from 'bun:test';
import { keyboardFor, parseCallbackData, requestFor, resultLine } from './buttons';

describe('keyboardFor', () => {
	test('one row of labelled buttons carrying action and agent', () => {
		expect(keyboardFor('sentinel-01', ['accept', 'reject', 'kill'])).toEqual([
			[
				{ text: '✅ Accept', callback_data: 'accept:sentinel-01' },
				{ text: '❌ Reject', callback_data: 'reject:sentinel-01' },
				{ text: '🛑 Kill', callback_data: 'kill:sentinel-01' }
			]
		]);
	});

	test('is null when the callback data would pass 64 bytes', () => {
		expect(keyboardFor('a'.repeat(58), ['resume'])).toBeNull();
		expect(keyboardFor('a'.repeat(57), ['resume'])).not.toBeNull();
	});
});

describe('parseCallbackData', () => {
	test('reads back what keyboardFor wrote', () => {
		for (const action of ['accept', 'reject', 'kill', 'resume'] as const) {
			const data = keyboardFor('tick-01', [action])?.[0][0].callback_data ?? '';
			expect(parseCallbackData(data)).toEqual({ action, agentId: 'tick-01' });
		}
	});

	test('refuses anything else', () => {
		for (const data of ['', 'kill', 'pause:tick-01', 'kill:', 'kill:../etc', 'kill:tick 01']) {
			expect(parseCallbackData(data)).toBeNull();
		}
	});
});

describe('requestFor', () => {
	test('a verdict goes to the approval endpoint', () => {
		expect(requestFor({ action: 'reject', agentId: 'sentinel-01' })).toEqual({
			path: '/api/agents/sentinel-01/approval',
			body: { verdict: 'reject' }
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
