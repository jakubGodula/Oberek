import { E2E_SENTINEL, E2E_TICK } from '../scripts/setup-plan';
import { readChain } from './chain';
import { expect, test } from './fixtures';

test('shows the test fleet as the chain has it', async ({ dashboard, page }) => {
	await expect(dashboard.cards()).toHaveCount(2);
	for (const agent of [E2E_SENTINEL, E2E_TICK]) await expect(dashboard.card(agent.name)).toContainText('ACTIVE');

	const chain = await readChain(E2E_TICK.id);
	await dashboard.select(E2E_TICK.name);
	await expect(dashboard.card(E2E_TICK.name)).toContainText(`${chain.counter} tx`);
	await expect(page.getByText(chain.agentKey, { exact: true })).toBeVisible();
	await expect(page.getByText(chain.lastDecision, { exact: true })).toBeVisible();
	await expect(dashboard.feed()).toContainText(E2E_TICK.id);
	await expect(dashboard.feed()).toContainText(/#\d+|No decisions yet/);
});
