import { describe, expect, it } from 'bun:test';
import { address } from '@solana/kit';
import { loadConfig } from './config';

const PROGRAM_ID = address('11111111111111111111111111111111');
const REQUIRED = { GUARD_PROGRAM_ID: PROGRAM_ID, FEE_PAYER_KEYPAIR: 'payer.json' };

describe('loadConfig', () => {
	it('reads the owner ML-KEM key file from OWNER_MLKEM_FILE', () => {
		expect(loadConfig({ ...REQUIRED, OWNER_MLKEM_FILE: '/keys/owner.json' }).ownerKemPath).toBe('/keys/owner.json');
	});

	it('applies defaults for devnet', () => {
		expect(loadConfig(REQUIRED)).toEqual({
			programAddress: PROGRAM_ID,
			rpcUrl: 'https://api.devnet.solana.com',
			rpcSubscriptionsUrl: 'wss://api.devnet.solana.com',
			tickMs: 30_000,
			agentFilePath: '.devnet/agent.json',
			decisionLogPath: '.devnet/decisions.jsonl',
			feePayerPath: 'payer.json',
			ownerPath: undefined,
			ownerKemPath: '.devnet/owner-mlkem.json'
		});
	});

	it('names a missing required variable', () => {
		expect(() => loadConfig({ FEE_PAYER_KEYPAIR: 'payer.json' })).toThrow('GUARD_PROGRAM_ID');
		expect(() => loadConfig({ GUARD_PROGRAM_ID: PROGRAM_ID })).toThrow('FEE_PAYER_KEYPAIR');
	});

	it('rejects a tick that is not a positive integer', () => {
		expect(() => loadConfig({ ...REQUIRED, AGENT_TICK_MS: '0' })).toThrow('AGENT_TICK_MS');
		expect(() => loadConfig({ ...REQUIRED, AGENT_TICK_MS: 'soon' })).toThrow('AGENT_TICK_MS');
	});
});
