import { describe, expect, it } from 'bun:test';
import idl from './onchain_agent_guard.idl.json';
import { GUARD_ERROR_CODES } from './guard-errors';
import { DISCRIMINATORS } from './instructions';

// onchain/run-tests.sh copies the IDL from `anchor build`; this keeps the hand-written client in step with it.
const instructionDiscriminator = (name: string) =>
	idl.instructions.find((instruction) => instruction.name === name)?.discriminator;

describe('client matches the program IDL', () => {
	it('uses the IDL instruction discriminators', () => {
		expect(Array.from(DISCRIMINATORS.registerAgent)).toEqual(instructionDiscriminator('register_agent')!);
		expect(Array.from(DISCRIMINATORS.recordStep)).toEqual(instructionDiscriminator('record_step')!);
		expect(Array.from(DISCRIMINATORS.recordBatch)).toEqual(instructionDiscriminator('record_batch')!);
		expect(Array.from(DISCRIMINATORS.kill)).toEqual(instructionDiscriminator('kill')!);
		expect(Array.from(DISCRIMINATORS.resume)).toEqual(instructionDiscriminator('resume')!);
		expect(Array.from(DISCRIMINATORS.registerOwner)).toEqual(instructionDiscriminator('register_owner')!);
		expect(Array.from(DISCRIMINATORS.activateAgent)).toEqual(instructionDiscriminator('activate_agent')!);
	});

	it('uses the IDL Agent account discriminator', () => {
		expect(Array.from(DISCRIMINATORS.agent)).toEqual(idl.accounts.find((account) => account.name === 'Agent')!.discriminator);
	});

	it('uses the IDL event discriminators', () => {
		const eventDiscriminator = (name: string) => idl.events.find((event) => event.name === name)?.discriminator;
		expect(Array.from(DISCRIMINATORS.stepRecorded)).toEqual(eventDiscriminator('StepRecorded')!);
		expect(Array.from(DISCRIMINATORS.batchRecorded)).toEqual(eventDiscriminator('BatchRecorded')!);
		expect(Array.from(DISCRIMINATORS.agentKilled)).toEqual(eventDiscriminator('AgentKilled')!);
		expect(Array.from(DISCRIMINATORS.agentResumed)).toEqual(eventDiscriminator('AgentResumed')!);
		expect(Array.from(DISCRIMINATORS.agentActivated)).toEqual(eventDiscriminator('AgentActivated')!);
	});

	it('uses the IDL error codes', () => {
		expect(Object.fromEntries(idl.errors.map((error) => [error.name, error.code]))).toEqual(GUARD_ERROR_CODES);
	});
});
