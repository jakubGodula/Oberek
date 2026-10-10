import { expect, test } from 'bun:test';
import { nextPrice } from './market';

test('moves the price by at most 3% either way', () => {
	expect(nextPrice(100, () => 0)).toBeCloseTo(97);
	expect(nextPrice(100, () => 0.5)).toBeCloseTo(100);
	expect(nextPrice(100, () => 0.999999)).toBeCloseTo(103);
});
