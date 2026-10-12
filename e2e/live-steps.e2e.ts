import { E2E_TICK } from '../scripts/setup-plan';
import { CHAIN_POLL, readChain } from './chain';
import { expect, test } from './fixtures';

const NEW_STEPS = 2;
/** One step lands about every 10 s, batched or not; two of them, with devnet's slack. */
const STEPS_TIMEOUT_MS = 120_000;
/** A step every ~10 s and a page refresh every 5 s leave a few seconds in each step where both show the same counter. */
const AGREE_TIMEOUT_MS = 60_000;

test.use({ runningAgents: ['tick'] });

test('shows the steps of a running agent as they land on chain', async ({ dashboard }) => {
	await dashboard.select(E2E_TICK.name);
	const before = await dashboard.counterOf(E2E_TICK.name);

	await expect
		.poll(() => dashboard.counterOf(E2E_TICK.name), { timeout: STEPS_TIMEOUT_MS })
		.toBeGreaterThanOrEqual(before + NEW_STEPS);
	const shown = await dashboard.counterOf(E2E_TICK.name);
	await expect(dashboard.feedEntry(shown)).toBeVisible();

	// Tick keeps stepping, so page and chain agree between two steps: retried until a read of both matches.
	await expect(async () => {
		expect((await readChain(E2E_TICK.id)).counter).toBe(await dashboard.counterOf(E2E_TICK.name));
	}).toPass({ ...CHAIN_POLL, timeout: AGREE_TIMEOUT_MS });
});
