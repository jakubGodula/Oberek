import { E2E_SENTINEL } from '../scripts/setup-plan';
import { CHAIN_POLL, readChain } from './chain';
import { expect, test } from './fixtures';

/**
 * From its 50% target, a −3% price is a trade of ~0.75% of the treasury, above Sentinel's 0.25% approval share
 * (agents/sentinel/config.ts), so the shock always becomes a proposal. Sentinel claims it on its next cycle.
 */
const PROPOSAL_TIMEOUT_MS = 120_000;

const VERDICTS = [
	{ button: 'Approve', chip: 'APPROVED' },
	{ button: 'Reject', chip: 'REJECTED' }
] as const;

test.use({ runningAgents: ['sentinel'] });

for (const { button, chip } of VERDICTS) {
	test(`records the owner's ${chip} verdict on a proposal on chain`, async ({ dashboard }) => {
		await dashboard.select(E2E_SENTINEL.name);
		await dashboard.armPriceShock();
		await expect(dashboard.card(E2E_SENTINEL.name)).toContainText('AWAITING_APPROVAL', {
			timeout: PROPOSAL_TIMEOUT_MS
		});
		const proposal = await dashboard.pendingProposalCounter();

		await dashboard.verdictButton(button).click();
		await expect(dashboard.card(E2E_SENTINEL.name)).toContainText('ACTIVE');
		await expect.poll(async () => (await readChain(E2E_SENTINEL.id)).counter, CHAIN_POLL).toBeGreaterThan(proposal);
		await expect(dashboard.feedEntry(proposal + 1)).toContainText(chip);
	});
}
