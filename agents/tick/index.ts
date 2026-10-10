// Tick: the simplest agent. Every tick it submits the same decision, TICK, so what the guard does is easy to see.
// It runs as its own process, holds no keys and keeps no status of its own.
import { createRuntimeClient, type SubmitOutcome } from './runtime-client';

const KIND = 'tick';
const DECISION = {};
const SUMMARY = 'TICK';
const DEFAULT_API_URL = 'http://localhost:5173';
const DEFAULT_AGENT_ID = 'tick-01';
/** On devnet every step is a paid transaction and the public RPC rate-limits, hence the slow default. */
const DEFAULT_INTERVAL_MS = 30_000;

const apiUrl = process.env.TICK_API_URL ?? DEFAULT_API_URL;
const agentId = process.env.TICK_AGENT_ID ?? DEFAULT_AGENT_ID;
const intervalMs = intervalFromEnv('TICK_INTERVAL_MS', DEFAULT_INTERVAL_MS);

const submit = createRuntimeClient(apiUrl, agentId);

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

console.log(`Tick (${agentId}) → ${apiUrl}, one TICK every ${intervalMs} ms; Ctrl+C stops`);
while (true) {
	const outcome = await submit({ kind: KIND, decision: DECISION, summary: SUMMARY });
	console.log(`${new Date().toISOString()} TICK → ${describeOutcome(outcome)}`);
	await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
