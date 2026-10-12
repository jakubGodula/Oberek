import { E2E_TICK } from '../scripts/setup-plan';
import { CHAIN_POLL, readChain } from './chain';
import { expect, test } from './fixtures';

const NEW_STEPS = 2;
/** One step lands about every 10 s, batched or not; two of them, with devnet's slack. */
const STEPS_TIMEOUT_MS = 120_000;

test.use({ runningAgents: ['tick'] });

test('shows the steps of a running agent as they land on chain', async ({ dashboard }) => {
	await dashboard.select(E2E_TICK.name);
	const before = await dashboard.counterOf(E2E_TICK.name);

	await expect
		.poll(() => dashboard.counterOf(E2E_TICK.name), { timeout: STEPS_TIMEOUT_MS })
		.toBeGreaterThanOrEqual(before + NEW_STEPS);
	await expect(dashboard.feed()).toContainText('TICK');

	const shown = await dashboard.counterOf(E2E_TICK.name);
	await expect.poll(async () => (await readChain(E2E_TICK.id)).counter, CHAIN_POLL).toBeGreaterThanOrEqual(shown);
});
