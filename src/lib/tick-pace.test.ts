import { describe, expect, test } from 'bun:test';
import { acceptsPace, describePace, paceLabel, paceStepsFor } from './tick-pace';

describe('paceStepsFor', () => {
	test('a batched agent may tick from every 0.5 s to every 30 s', () => {
		expect(paceStepsFor(true)).toEqual([500, 1000, 2000, 5000, 10_000, 30_000]);
	});

	test('an agent without batching starts at 10 s, the server step limit', () => {
		expect(paceStepsFor(false)).toEqual([10_000, 30_000]);
	});
});

describe('describePace', () => {
	test.each([
		[500, '1 tick / 0.5 s'],
		[2000, '1 tick / 2 s'],
		[30_000, '1 tick / 30 s']
	])('%i ms reads as %s', (ms, text) => {
		expect(describePace(ms)).toBe(text);
	});
});

describe('acceptsPace', () => {
	test('only Tick reads the speed wheel', () => {
		expect(acceptsPace('tick')).toBe(true);
		expect(acceptsPace('sentinel')).toBe(false);
		expect(acceptsPace(null)).toBe(false);
	});
});

describe('paceLabel', () => {
	test('names a notch of the wheel in seconds', () => {
		expect(paceStepsFor(true).map(paceLabel)).toEqual(['0.5 s', '1 s', '2 s', '5 s', '10 s', '30 s']);
	});
});
