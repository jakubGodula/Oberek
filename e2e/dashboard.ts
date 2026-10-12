// The dashboard as the owner uses it, by role and visible text: the page has no test ids and its GUI is frozen.
import type { Locator, Page } from '@playwright/test';

const FEED_HEADING = /On-Chain Observability Log/;
/** The page's first request from the browser: the selected agent's feed, loaded by an effect once it has hydrated. */
const FEED_REQUEST = /\/api\/agents\/[^/]+\/decisions/;

function numberIn(text: string, pattern: RegExp): number {
	const match = text.match(pattern);
	if (!match) throw new Error(`no ${pattern} in "${text}"`);
	return Number(match[1]);
}

export class Dashboard {
	constructor(private readonly page: Page) {}

	/** Resolves once the page has hydrated: until then a click on a card reaches no handler. */
	async open(): Promise<void> {
		const hydrated = this.page.waitForResponse((response) => FEED_REQUEST.test(response.url()));
		await this.page.goto('/');
		await hydrated;
	}

	/** The agent cards in the fleet column. */
	cards(): Locator {
		return this.page.locator('aside button[type="button"]');
	}

	card(name: string): Locator {
		return this.cards().filter({ hasText: name });
	}

	/** Clicks the agent's card and waits for its details. */
	async select(name: string): Promise<void> {
		await this.card(name).click();
		await this.page.getByRole('heading', { level: 2, name, exact: true }).waitFor();
	}

	/** The on-chain counter on the agent's card ("975 tx"). */
	async counterOf(name: string): Promise<number> {
		return numberIn(await this.card(name).innerText(), /(\d+) tx/);
	}

	/** The selected agent's decision feed: the innermost block holding its heading. */
	feed(): Locator {
		return this.page
			.locator('div')
			.filter({ has: this.page.getByRole('heading', { name: FEED_HEADING }) })
			.last();
	}

	/** The feed row of step #counter (its time, counter and chip). */
	feedEntry(counter: number): Locator {
		return this.feed().getByText(`#${counter}`, { exact: true }).first().locator('..');
	}

	killSwitch(): Locator {
		return this.page.getByRole('button', { name: /Kill-Switch/ });
	}

	resumeButton(): Locator {
		return this.page.getByRole('button', { name: 'Resume agent' });
	}

	/** Arms Sentinel's −3% shock in the Simulate panel, then closes the panel (it covers the fleet column). */
	async armPriceShock(): Promise<void> {
		await this.page.getByRole('button', { name: 'Simulate', exact: true }).click();
		await this.page.getByRole('button', { name: 'Simulate a price shock (−3%)' }).click();
		await this.page.getByRole('button', { name: 'Shock armed, applied in the next cycle' }).waitFor();
		await this.page.getByRole('button', { name: 'Hide', exact: true }).click();
	}

	/** The approval panel's title, which names the waiting proposal ("… waiting for your verdict · step #221"). */
	approvalPanelTitle(): Locator {
		return this.page.getByText(/waiting for your verdict · step #\d+/);
	}

	/** The approval panel's button: it comes before the console's "Approve Step" / "Reject" in the page. */
	verdictButton(label: 'Approve' | 'Reject'): Locator {
		return this.page.getByRole('button', { name: label, exact: true }).first();
	}
}
