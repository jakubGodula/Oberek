import { describe, expect, test } from 'bun:test';
import { decide, summarize } from './policy';
import { NEGATIVE_PROPOSAL, POSITIVE_PROPOSAL } from './proposals';

describe('decide', () => {
	test('accepts a proposal it reads as positive for JitoSOL holders', () => {
		const decision = decide(POSITIVE_PROPOSAL);
		expect(decision).toEqual({ action: 'FOR', answer: 'positive', proposal: POSITIVE_PROPOSAL });
		expect(summarize(decision)).toBe('FOR upcoming proposal · positive for JitoSOL holders');
	});

	test('rejects a proposal it reads as negative for JitoSOL holders', () => {
		const decision = decide(NEGATIVE_PROPOSAL);
		expect(decision).toEqual({ action: 'AGAINST', answer: 'negative', proposal: NEGATIVE_PROPOSAL });
		expect(summarize(decision)).toBe('AGAINST upcoming proposal · negative for JitoSOL holders');
	});
});
