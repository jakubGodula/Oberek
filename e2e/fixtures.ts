// Every test starts and ends with the test fleet active and nothing waiting, runs the agent processes it asks for
// (test.use({ runningAgents: [...] })) and fails on any browser console error.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { startAgent, type AgentName } from './agent-process';
import { Dashboard } from './dashboard';
import { queuedAgents, restoreRequests, unavailable, type FleetCard } from './restore';

interface Fixtures {
	dashboard: Dashboard;
	runningAgents: AgentName[];
	/** Auto: sets the fleet up around every test; it gives the test nothing. */
	testFleet: undefined;
}

/** The server flushes a batch every 10 s (BATCH_FLUSH_MS); with its transaction landing, well within this. */
const BATCH_DRAIN_TIMEOUT_MS = 45_000;

export async function fleetCards(request: APIRequestContext): Promise<FleetCard[]> {
	return ((await (await request.get('/api/agents')).json()) as { agents: FleetCard[] }).agents;
}

/** Waits until no decision waits for its batch, so none lands during the next test. */
async function drainBatches(request: APIRequestContext): Promise<void> {
	await expect
		.poll(async () => queuedAgents(await fleetCards(request)), {
			message: 'decisions still queued for a batch',
			timeout: BATCH_DRAIN_TIMEOUT_MS
		})
		.toEqual([]);
}

async function restoreFleet(request: APIRequestContext): Promise<void> {
	const agents = await fleetCards(request);
	expect(unavailable(agents), 'agents the server cannot read').toEqual([]);
	for (const { path, body } of restoreRequests(agents)) {
		const response = await request.post(path, { data: body });
		expect(response.ok(), `${path} ${JSON.stringify(body)}: ${await response.text()}`).toBe(true);
	}
}

export const test = base.extend<Fixtures>({
	runningAgents: [[], { option: true }],

	testFleet: [
		async ({ request, runningAgents, baseURL }, use, testInfo) => {
			await restoreFleet(request);
			const started = runningAgents.map((name) => ({ name, agent: startAgent(name, baseURL ?? '') }));
			await use(undefined);
			const diedEarly = started.filter(({ agent }) => !agent.running()).map(({ name }) => name);
			await Promise.all(started.map(({ agent }) => agent.stop()));
			for (const { name, agent } of started) await testInfo.attach(`${name}.log`, { body: agent.output() });
			await drainBatches(request);
			await restoreFleet(request);
			expect(diedEarly, 'agent processes that exited during the test (see their logs)').toEqual([]);
		},
		{ auto: true }
	],

	dashboard: async ({ page }, use) => {
		const consoleErrors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') consoleErrors.push(message.text());
		});
		page.on('pageerror', (error) => consoleErrors.push(error.message));
		const dashboard = new Dashboard(page);
		await dashboard.open();
		await use(dashboard);
		expect(consoleErrors, 'browser console errors').toEqual([]);
	}
});

export { expect };
