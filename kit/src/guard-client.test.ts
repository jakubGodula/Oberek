import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import { GuardError } from './guard';
import { fetchAgent, type GuardClient } from './guard-client';
import type { SolanaConnection } from './transaction';

const PROGRAM = address('BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs');
const OTHER_PROGRAM = address('11111111111111111111111111111111');
const AGENT = address('BF8MdAhmX8f8myq1p84sN2RZHsRZsfK9LAw6ihYMkPgN');

/** A client whose RPC answers getAccountInfo with `value` (null: no such account). */
function clientAnswering(value: unknown): GuardClient {
	const rpc = { getAccountInfo: () => ({ send: async () => ({ context: { slot: 1n }, value }) }) };
	return { connection: { rpc } as unknown as SolanaConnection, programAddress: PROGRAM };
}

async function guardErrorCode(call: Promise<unknown>): Promise<string> {
	const error = await call.then(
		() => null,
		(caught: unknown) => caught
	);
	expect(error).toBeInstanceOf(GuardError);
	return (error as GuardError).code;
}

describe('fetchAgent', () => {
	test('reports an account that does not exist as AgentNotFound', async () => {
		expect(await guardErrorCode(fetchAgent(clientAnswering(null), AGENT))).toBe('AgentNotFound');
	});

	test("reports an account another program owns as AgentNotFound", async () => {
		const account = { data: ['', 'base64'], executable: false, lamports: 1n, owner: OTHER_PROGRAM, rentEpoch: 0n, space: 0n };
		expect(await guardErrorCode(fetchAgent(clientAnswering(account), AGENT))).toBe('AgentNotFound');
	});
});
