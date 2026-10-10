import { expect, test } from 'bun:test';
import { createFleetRuntime } from './runtime';

test('needs the program and keys', async () => {
	await expect(createFleetRuntime({})).rejects.toThrow('GUARD_PROGRAM_ID is not set');
});
