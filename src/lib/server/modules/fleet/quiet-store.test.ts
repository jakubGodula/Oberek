import { describe, expect, test } from 'bun:test';
import { QuietStore, quietSummary } from './quiet-store';

describe('QuietStore', () => {
	test('starts at one and keeps counting', () => {
		const store = new QuietStore();
		expect(store.note('jito-01', 1_000)).toEqual({ count: 1, at: 1_000 });
		expect(store.note('jito-01', 2_000)).toEqual({ count: 2, at: 2_000 });
		expect(store.get('jito-01')).toEqual({ count: 2, at: 2_000 });
	});

	test('a recorded decision starts the next run at one', () => {
		const store = new QuietStore();
		store.note('jito-01', 1_000);
		store.clear('jito-01');
		expect(store.get('jito-01')).toBeNull();
		expect(store.note('jito-01', 3_000).count).toBe(1);
	});

	test('keeps each agent apart', () => {
		const store = new QuietStore();
		store.note('jito-01', 1_000);
		expect(store.get('sentinel-01')).toBeNull();
		expect(store.get('jito-01')?.count).toBe(1);
	});
});

test('the page line names the run', () => {
	expect(quietSummary(3)).toBe('No new proposals detected ×3');
});
