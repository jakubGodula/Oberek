// Every test starts and ends with the test fleet active and nothing waiting, runs the agent processes it asks for
// (test.use({ runningAgents: [...] })) and fails on any browser console error.
import { setTimeout as sleep } from 'node:timers/promises';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { stopInOrder } from '../scripts/demo-stop';
import { E2E_PROFILE } from '../scripts/setup-plan';
import { AGENT_STOP_GRACE_MS, startAgent, type AgentName, type AgentProcess } from './agent-process';
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
/** An agent that cannot run (bad config, a crash on load) exits within this; the test then stops at once. */
const AGENT_START_CHECK_MS = 3_000;
/** The server reads every agent on chain for the list: one failed RPC read is retried before the test gives up. */
const RPC_RETRY = { intervals: [2_000], timeout: 20_000 };
const TEST_FLEET_NAMES = E2E_PROFILE.agents.map((agent) => agent.name).sort();

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

/** The fleet once the server could read every agent on chain. */
async function readableFleet(request: APIRequestContext): Promise<FleetCard[]> {
	let cards: FleetCard[] = [];
	const unreadable = async () => {
		cards = await fleetCards(request);
		return unavailable(cards);
	};
	await expect.poll(unreadable, { ...RPC_RETRY, message: 'agents the server cannot read' }).toEqual([]);
	return cards;
}

/** Acts only on the test fleet: the demo's agents have the same ids, so the names tell them apart. */
async function restoreFleet(request: APIRequestContext): Promise<void> {
	const cards = await readableFleet(request);
	const names = cards.map((card) => card.name).sort();
	expect(names, 'the server must serve the test fleet (FLEET_DIR, bun scripts/setup.ts --e2e)').toEqual(
		TEST_FLEET_NAMES
	);
	const requests = restoreRequests(cards);
	for (const { path, body } of requests) {
		const response = await request.post(path, { data: body });
		expect(response.ok(), `${path} ${JSON.stringify(body)}: ${await response.text()}`).toBe(true);
	}
	if (requests.length > 0) {
		await expect
			.poll(async () => restoreRequests(await readableFleet(request)), { message: 'the fleet after its restore' })
			.toEqual([]);
	}
}

/** The agents that have exited, each with its output. */
function exitedAgents(agents: readonly AgentProcess[]): string[] {
	return agents.filter((agent) => !agent.running()).map((agent) => `${agent.name}:\n${agent.output()}`);
}

/** Returns once an agent has exited, or the start check is over with every agent still running. */
async function startCheck(agents: readonly AgentProcess[]): Promise<void> {
	await Promise.race([sleep(AGENT_START_CHECK_MS), ...agents.map((agent) => agent.exited)]);
}

export const test = base.extend<Fixtures>({
	runningAgents: [[], { option: true }],

	testFleet: [
		async ({ request, runningAgents, baseURL }, use, testInfo) => {
			await restoreFleet(request);
			const agents = runningAgents.map((name) => startAgent(name, baseURL ?? ''));
			let exitedDuringTest: string[] = [];
			try {
				await startCheck(agents);
				expect(exitedAgents(agents), 'agent processes that exited on start').toEqual([]);
				await use(undefined);
				exitedDuringTest = exitedAgents(agents);
			} finally {
				await stopInOrder([{ processes: agents, graceMs: AGENT_STOP_GRACE_MS }]);
				for (const agent of agents) await testInfo.attach(`${agent.name}.log`, { body: agent.output() });
			}
			await drainBatches(request);
			await restoreFleet(request);
			expect(exitedDuringTest, 'agent processes that exited during the test').toEqual([]);
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
