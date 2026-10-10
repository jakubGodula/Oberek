// Tick: the simplest agent. Every tick it submits the same decision, TICK, so what the guard does is easy to see.
// It runs as its own process, holds no keys and keeps no status of its own.
import { positiveNumber } from '../shared/env';
import { createRuntimeClient, describeSubmitOutcome } from '../shared/runtime-client';

const KIND = 'tick';
const DECISION = {};
const SUMMARY = 'TICK';
const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'tick-01';
/** On devnet every step is a paid transaction and the public RPC rate-limits, hence the slow default. */
const DEFAULT_INTERVAL_MS = 30_000;

const apiUrl = process.env.TICK_API_URL ?? DEFAULT_API_URL;
const agentId = process.env.TICK_AGENT_ID ?? DEFAULT_AGENT_ID;
const intervalMs = intervalFromEnv();

const { submit } = createRuntimeClient(apiUrl, agentId);

/** An invalid interval stops the agent instead of spinning. */
function intervalFromEnv(): number {
	try {
		return positiveNumber(process.env, 'TICK_INTERVAL_MS', DEFAULT_INTERVAL_MS, { integer: true });
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

console.log(`Tick (${agentId}) → ${apiUrl}, one TICK every ${intervalMs} ms; Ctrl+C stops`);
while (true) {
	const outcome = await submit({ kind: KIND, decision: DECISION, summary: SUMMARY });
	console.log(`${new Date().toISOString()} TICK → ${describeSubmitOutcome(outcome)}`);
	await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
