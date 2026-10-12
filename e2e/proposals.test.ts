import { expect, test } from 'bun:test';
import { towardShockProposal } from './proposals';

const SHOCKED_PRICE = { usd: 104.34, simulatedShock: { pct: -3, realUsd: 107.57 } };
const REAL_PRICE = { usd: 107.57 };

test('waits while no proposal waits', () => {
	expect(towardShockProposal(null)).toEqual({ kind: 'wait' });
});

test("takes the proposal made at the shocked price as the shock's", () => {
	expect(towardShockProposal({ counter: 6, decision: { price: SHOCKED_PRICE } })).toEqual({ kind: 'shock', counter: 6 });
});

test('approves a proposal made at the real price, so the shock comes next', () => {
	expect(towardShockProposal({ counter: 8, decision: { price: REAL_PRICE } })).toEqual({ kind: 'approve', counter: 8 });
});
