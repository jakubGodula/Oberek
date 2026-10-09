import { describe, expect, it } from 'bun:test';
import { address, getBase16Decoder } from '@solana/kit';
import { hashDecision, tickDecision } from './decision';

const AGENT = address('11111111111111111111111111111111');
const OBSERVED_AT = new Date('2026-10-10T12:00:00.000Z');

describe('tick decision', () => {
	it('records the agent, the new counter and the time', () => {
		expect(tickDecision(AGENT, 1n, OBSERVED_AT)).toEqual({
			agent: AGENT,
			counter: 1,
			decision: 'TICK',
			observedAt: '2026-10-10T12:00:00.000Z'
		});
	});

	it('hashes the canonical JSON with SHA-256', () => {
		// sha256('{"agent":"11111111111111111111111111111111","counter":1,"decision":"TICK","observedAt":"2026-10-10T12:00:00.000Z"}')
		expect(getBase16Decoder().decode(hashDecision(tickDecision(AGENT, 1n, OBSERVED_AT)))).toBe(
			'822fb48cf7c564846470f7af54e8756a6ea74e67ebb8c2c552c411a53b21e64a'
		);
	});

	it('hashes the same regardless of key order in the record object', () => {
		const reordered = { observedAt: '2026-10-10T12:00:00.000Z', decision: 'TICK' as const, counter: 1, agent: AGENT };
		expect(hashDecision(reordered)).toEqual(hashDecision(tickDecision(AGENT, 1n, OBSERVED_AT)));
	});
});
