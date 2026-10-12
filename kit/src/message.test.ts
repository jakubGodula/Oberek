import { describe, expect, it } from 'bun:test';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getAddressDecoder, getBase16Encoder } from '@solana/kit';
import vector from '../../onchain/fixtures/message-vector.json';
import { activateMessage, batchMessage, GUARD_CONTEXT, resumeMessage, signGuardMessage, stepMessage } from './message';

const bytes = (hex: string) => new Uint8Array(getBase16Encoder().encode(hex));
const agent = getAddressDecoder().decode(bytes(vector.agent));
const counter = BigInt(vector.counter);

describe('guard messages', () => {
	it('uses the shared context string', () => {
		expect(new TextDecoder().decode(GUARD_CONTEXT)).toBe(vector.context);
	});

	it('builds the step message of the shared vector', () => {
		expect(stepMessage(agent, counter, bytes(vector.decisionHash))).toEqual(bytes(vector.stepMessage));
	});

	it('builds the resume message of the shared vector', () => {
		expect(resumeMessage(agent, counter)).toEqual(bytes(vector.resumeMessage));
	});

	it('builds the batch message of the shared vector', () => {
		expect(batchMessage(agent, counter, bytes(vector.batchRoot), vector.batchSize)).toEqual(bytes(vector.batchMessage));
	});

	it('rejects a batch root that is not 32 bytes', () => {
		expect(() => batchMessage(agent, counter, new Uint8Array(31), 1)).toThrow(RangeError);
	});

	it('builds the activate message of the shared vector, always for counter 0', () => {
		expect(activateMessage(agent)).toEqual(bytes(vector.activateMessage));
	});

	it('rejects a decision hash that is not 32 bytes', () => {
		expect(() => stepMessage(agent, counter, new Uint8Array(31))).toThrow(RangeError);
	});

	it('signs with the guard context', () => {
		const keys = ml_dsa44.keygen();
		const message = resumeMessage(agent, counter);
		const signature = signGuardMessage(message, keys.secretKey);
		expect(ml_dsa44.verify(signature, message, keys.publicKey, { context: GUARD_CONTEXT })).toBe(true);
		expect(ml_dsa44.verify(signature, message, keys.publicKey)).toBe(false);
	});
});
