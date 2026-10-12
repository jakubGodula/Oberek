import type { APIRequestContext } from '@playwright/test';
import { E2E_SENTINEL } from '../scripts/setup-plan';
import { CHAIN_POLL, readChain } from './chain';
import { expect, fleetCards, test } from './fixtures';
import { towardShockProposal, type TowardShock } from './proposals';

/**
 * From its 50% target, a −3% price is a trade of ~0.75% of the treasury, above Sentinel's 0.25% approval share
 * (agents/sentinel/config.ts), so the shock becomes a proposal on the first cycle Sentinel is not waiting for a verdict.
 */
const PROPOSAL_TIMEOUT_MS = 120_000;
/** Proposals at the real price approved before the shock's: an earlier shock's rebound, then room for one more. */
const MAX_PROPOSALS_BEFORE_SHOCK = 2;

const VERDICTS = [
	{ button: 'Approve', chip: 'APPROVED' },
	{ button: 'Reject', chip: 'REJECTED' }
] as const;

async function sentinelTowardShock(request: APIRequestContext): Promise<TowardShock> {
	const sentinel = (await fleetCards(request)).find((card) => card.id === E2E_SENTINEL.id);
	return towardShockProposal(sentinel?.fleet.pendingProposal ?? null);
}

/** Waits until a proposal waits, and says what to do with it. */
async function nextProposal(request: APIRequestContext): Promise<TowardShock> {
	let step: TowardShock = { kind: 'wait' };
	const waiting = async () => {
		step = await sentinelTowardShock(request);
		return step.kind;
	};
	await expect.poll(waiting, { timeout: PROPOSAL_TIMEOUT_MS }).not.toBe('wait');
	return step;
}

/** The counter of the proposal the armed shock caused; any proposal at the real price before it is approved by API. */
async function shockProposal(request: APIRequestContext): Promise<number> {
	for (let approved = 0; approved <= MAX_PROPOSALS_BEFORE_SHOCK; approved++) {
		const step = await nextProposal(request);
		if (step.kind === 'shock') return step.counter;
		if (step.kind === 'approve') {
			const verdict = { verdict: 'accept', counter: step.counter };
			const response = await request.post(`/api/agents/${E2E_SENTINEL.id}/approval`, { data: verdict });
			expect(response.ok(), await response.text()).toBe(true);
		}
	}
	throw new Error(`no shock proposal after ${MAX_PROPOSALS_BEFORE_SHOCK} proposals at the real price`);
}

test.use({ runningAgents: ['sentinel'] });

for (const { button, chip } of VERDICTS) {
	test(`records the owner's ${chip} verdict on the shock's proposal on chain`, async ({ dashboard, request }) => {
		await dashboard.select(E2E_SENTINEL.name);
		await dashboard.armPriceShock();
		const proposal = await shockProposal(request);

		await expect(dashboard.card(E2E_SENTINEL.name)).toContainText('AWAITING_APPROVAL');
		await expect(dashboard.approvalPanelTitle()).toContainText(`step #${proposal}`);
		await expect(dashboard.feedEntry(proposal)).toContainText('simulated shock');

		await dashboard.verdictButton(button).click();
		await expect(dashboard.card(E2E_SENTINEL.name)).toContainText('ACTIVE');
		await expect.poll(async () => (await readChain(E2E_SENTINEL.id)).counter, CHAIN_POLL).toBeGreaterThan(proposal);
		await expect(dashboard.feedEntry(proposal + 1)).toContainText(chip);
	});
}
