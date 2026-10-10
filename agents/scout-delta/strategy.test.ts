import { describe, expect, test } from 'bun:test';
import { decide, summarize, TRADE_SIZE_SOL } from './strategy';

describe('decide', () => {
	test('buys after a drop of at least the threshold', () => {
		expect(decide(100, 98)).toEqual({ action: 'BUY', amountSol: TRADE_SIZE_SOL, priceUsd: 98, changePercent: -2 });
	});

	test('sells after a rise of at least the threshold', () => {
		expect(decide(100, 101.5).action).toBe('SELL');
	});

	test('holds on a small move and trades nothing', () => {
		expect(decide(100, 100.4)).toEqual({ action: 'HOLD', amountSol: 0, priceUsd: 100.4, changePercent: 0.4 });
	});
});

describe('summarize', () => {
	test('describes a trade with its signed change', () => {
		expect(summarize(decide(100, 98))).toBe('BUY 0.5 SOL at 98.00 USD (-2.00%)');
	});

	test('describes a hold', () => {
		expect(summarize(decide(100, 100.4))).toBe('HOLD at 100.40 USD (+0.40%)');
	});
});
