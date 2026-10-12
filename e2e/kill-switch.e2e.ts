import { E2E_TICK } from '../scripts/setup-plan';
import { CHAIN_POLL, readChain } from './chain';
import { expect, test } from './fixtures';

async function chainStatus(agentId: string) {
	return (await readChain(agentId)).status;
}

test('kills and resumes an agent on chain from the page', async ({ dashboard }) => {
	await dashboard.select(E2E_TICK.name);

	await dashboard.killSwitch().click();
	await expect(dashboard.card(E2E_TICK.name)).toContainText('PAUSED');
	await expect.poll(() => chainStatus(E2E_TICK.id), CHAIN_POLL).toBe('Killed');

	await dashboard.resumeButton().click();
	await expect(dashboard.card(E2E_TICK.name)).toContainText('ACTIVE');
	await expect.poll(() => chainStatus(E2E_TICK.id), CHAIN_POLL).toBe('Active');
});
