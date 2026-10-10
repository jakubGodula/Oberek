// Scout Delta: a market-signal agent running as its own process. Every tick it decides and submits the decision to
// the server, which records it only while the guard lets the agent act. It holds no keys and no status of its own.
import { nextPrice, START_PRICE_USD } from './market';
import { createRuntimeClient, type SubmitOutcome } from './runtime-client';
import { decide, summarize } from './strategy';

const KIND = 'market-scout';
const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'scout-04';
const DEFAULT_TICK_MS = 5000;

const apiUrl = process.env.SCOUT_API_URL ?? DEFAULT_API_URL;
const agentId = process.env.SCOUT_AGENT_ID ?? DEFAULT_AGENT_ID;
const tickMs = intervalFromEnv('SCOUT_TICK_MS', DEFAULT_TICK_MS);

const submit = createRuntimeClient(apiUrl, agentId);
let priceUsd = START_PRICE_USD;

/** A positive whole number of milliseconds from the environment; anything else stops the agent instead of spinning. */
function intervalFromEnv(name: string, fallbackMs: number): number {
	const raw = process.env[name];
	if (raw === undefined) return fallbackMs;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		console.error(`${name} must be a positive whole number of milliseconds, got "${raw}"`);
		process.exit(1);
	}
	return value;
}

async function tick(): Promise<void> {
	const previousPriceUsd = priceUsd;
	priceUsd = nextPrice(priceUsd);
	const decision = decide(previousPriceUsd, priceUsd);
	const summary = summarize(decision);
	const outcome = await submit({ kind: KIND, decision: { ...decision }, summary });
	console.log(`${new Date().toISOString()} ${summary} → ${describeOutcome(outcome)}`);
}

function describeOutcome(outcome: SubmitOutcome): string {
	switch (outcome.kind) {
		case 'recorded':
			return `recorded #${outcome.counter}`;
		case 'paused':
			return 'refused: the owner killed the agent';
		case 'failed':
			return `failed: ${outcome.reason}`;
	}
}

console.log(`Scout Delta (${agentId}) → ${apiUrl}, one decision every ${tickMs} ms; Ctrl+C stops`);
while (true) {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, tickMs));
}
