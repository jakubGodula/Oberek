import { describe, expect, it } from 'bun:test';
import { GUARD_ERROR_CODES, customErrorCode, describeTransactionError } from './guard-errors';

describe('guard errors', () => {
	it('reads the custom code of an instruction error', () => {
		expect(customErrorCode({ InstructionError: [0, { Custom: 6000 }] })).toBe(GUARD_ERROR_CODES.AgentKilled);
		expect(customErrorCode({ InstructionError: [0, { Custom: 6006n }] })).toBe(GUARD_ERROR_CODES.VerifyFailed);
	});

	it('returns null when there is no custom code', () => {
		expect(customErrorCode(null)).toBeNull();
		expect(customErrorCode({ InstructionError: [0, 'MissingRequiredSignature'] })).toBeNull();
	});

	it('names guard errors and prints others as JSON, bigints included', () => {
		expect(describeTransactionError({ InstructionError: [0, { Custom: 6006n }] })).toBe('VerifyFailed');
		expect(describeTransactionError({ InstructionError: [1, { Custom: 2001n }] })).toBe(
			'{"InstructionError":[1,{"Custom":2001}]}'
		);
	});
});
