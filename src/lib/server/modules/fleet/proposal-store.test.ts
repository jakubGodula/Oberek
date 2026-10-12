import { describe, expect, test } from 'bun:test';
import { parseProposalReading, ProposalStore } from './proposal-store';

describe('ProposalStore', () => {
	test('has nothing armed at first', () => {
		const store = new ProposalStore();
		expect(store.direction('jito-01')).toBeNull();
		expect(store.claim('jito-01')).toBeNull();
	});

	test('hands an armed proposal out once', () => {
		const store = new ProposalStore();
		store.arm('jito-01', 'positive');
		expect(store.direction('jito-01')).toBe('positive');
		expect(store.claim('jito-01')).toBe('positive');
		expect(store.direction('jito-01')).toBeNull();
		expect(store.claim('jito-01')).toBeNull();
	});

	test('replaces a proposal armed earlier', () => {
		const store = new ProposalStore();
		store.arm('jito-01', 'positive');
		store.arm('jito-01', 'negative');
		expect(store.claim('jito-01')).toBe('negative');
	});

	test('keeps each agent apart', () => {
		const store = new ProposalStore();
		store.arm('jito-01', 'positive');
		expect(store.claim('sentinel-01')).toBeNull();
		expect(store.claim('jito-01')).toBe('positive');
	});
});

describe('parseProposalReading', () => {
	test.each(['positive', 'negative'] as const)('accepts %s', (direction) => {
		expect(parseProposalReading({ direction })).toBe(direction);
	});

	test.each([
		['another word', { direction: 'hold' }],
		['a number', { direction: 1 }],
		['no direction', {}],
		['no body', null]
	])('rejects %s', (_, body) => {
		expect(parseProposalReading(body)).toBeNull();
	});
});
