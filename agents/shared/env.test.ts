import { expect, test } from 'bun:test';
import { positiveNumber } from './env';

test('takes the fallback when the variable is unset', () => {
	expect(positiveNumber({}, 'X', 15)).toBe(15);
});

test('reads a positive number', () => {
	expect(positiveNumber({ X: '0.05' }, 'X', 1)).toBe(0.05);
});

test.each(['', '0', '-1', 'abc', '0.02pp', 'Infinity'])('refuses %p, naming the variable', (raw) => {
	expect(() => positiveNumber({ X: raw }, 'X', 1)).toThrow('X must be a positive number');
});

test('refuses a fraction where a whole number is required', () => {
	expect(() => positiveNumber({ X: '1.5' }, 'X', 1, { integer: true })).toThrow('X must be a positive whole number');
});
