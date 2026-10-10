import { expect, test } from 'bun:test';
import { createFleetRuntime, FleetNotConfiguredError } from './runtime';

const PROGRAM_ID = 'BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs';

async function setupError(env: Record<string, string>): Promise<unknown> {
	return createFleetRuntime(env).then(
		() => null,
		(caught: unknown) => caught
	);
}

test('reports a missing variable as a fleet that is not configured', async () => {
	const error = await setupError({});
	expect(error).toBeInstanceOf(FleetNotConfiguredError);
	expect((error as Error).message).toContain('GUARD_PROGRAM_ID is not set');
});

test('reports a missing keypair file as a fleet that is not configured', async () => {
	const missing = 'no-such-dir/payer.json';
	const error = await setupError({ GUARD_PROGRAM_ID: PROGRAM_ID, FEE_PAYER_KEYPAIR: missing, OWNER_KEYPAIR: missing });
	expect(error).toBeInstanceOf(FleetNotConfiguredError);
	expect((error as Error).message).toContain(missing);
});
