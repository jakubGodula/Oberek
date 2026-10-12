// The whole demo in one terminal: the server, then Sentinel (at demo pace), Tick, the JitoSOL steward and, with TELEGRAM_BOT_TOKEN in .env,
// the owner's Telegram bot, their output prefixed by name.
// Ctrl+C stops it gracefully: the agents finish the step in flight and exit, and only then the server stops.
// Each run leaves a redacted log in .devnet/logs/ (scripts/run-log.ts).
// Usage (from the repo root, with .env set up as in README): bun scripts/demo.ts
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { batchPolicyFrom } from '../src/lib/server/modules/fleet/decision-batcher';
import { Fleet } from '../src/lib/server/modules/fleet/fleet';
import { FLEET_DIR } from '../src/lib/server/modules/fleet/runtime';
import { stopInOrder, type DemoProcess } from './demo-stop';
import { runLogged } from './run-log';

const PORT = 5173;
const SERVER_URL = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_POLL_MS = 500;
/** A devnet step can take a while to land; the agents get that long to finish it. */
const AGENT_GRACE_MS = 30_000;
const SERVER_GRACE_MS = 10_000;
const DEMO_PACE = { SENTINEL_SCHEDULE_MIN: '2', SENTINEL_INTERVAL_MS: '10000' };
/** The ids the agents run as: their defaults unless .env overrides them. */
const AGENT_IDS = [
	process.env.SENTINEL_AGENT_ID ?? 'sentinel-01',
	process.env.TICK_AGENT_ID ?? 'tick-01',
	process.env.JITO_AGENT_ID ?? 'jito-01'
];
const TICK_ID = AGENT_IDS[1];
/** Tick at a fast agent's pace when the server batches its decisions (BATCHED_AGENT_IDS in .env, which Bun loads). */
const BATCHED_TICK_PACE = { TICK_INTERVAL_MS: '1000' };
const tickBatched = batchPolicyFrom(process.env).agentIds.has(TICK_ID);
/** The owner bot is optional: it runs only when .env has its token from @BotFather. */
const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);

await runLogged('demo');
if (!existsSync('.env')) {
	console.error('No .env in the current directory: run from the repo root after the setup in README.md');
	process.exit(1);
}
const notInFleet = AGENT_IDS.filter((id) => !new Fleet(FLEET_DIR).get(id));
if (notInFleet.length > 0) {
	console.error(`Not in the fleet: ${notInFleet.join(', ')}; run bun scripts/setup.ts first (safe to re-run)`);
	process.exit(1);
}
if (await listening(SERVER_URL)) {
	console.error(`Port ${PORT} is busy (an earlier \`bun run dev\`?): stop whatever listens there, then re-run`);
	process.exit(1);
}

let stopping = false;
let exitCode = 0;

const server = start('server', 'node_modules/.bin/vite', ['dev', '--port', String(PORT), '--strictPort']);
const agents: DemoProcess[] = [];
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void stopDemo());

if (await serverReady()) {
	agents.push(
		start('sentinel', process.execPath, ['agents/sentinel'], DEMO_PACE),
		start('tick', process.execPath, ['agents/tick'], tickBatched ? BATCHED_TICK_PACE : {}),
		start('jito', process.execPath, ['agents/jito'])
	);
	if (telegramConfigured) agents.push(start('telegram', process.execPath, ['bot/telegram'], { TELEGRAM_API_URL: SERVER_URL }));
	log(`demo running at ${SERVER_URL}; Ctrl+C stops it`);
	if (!tickBatched) log(`add BATCHED_AGENT_IDS=${TICK_ID} to .env to see Tick's decisions go on-chain in Merkle batches`);
	if (!telegramConfigured) log('add TELEGRAM_BOT_TOKEN to .env to get proposals in Telegram (README: The owner on Telegram)');
} else {
	log(`the server did not answer within ${SERVER_READY_TIMEOUT_MS} ms`);
	exitCode = 1;
	await stopDemo();
}

/**
 * Starts a command in its own process group, so Ctrl+C in the terminal reaches only this script, which then stops
 * everything in order. `defaults` are env values that the caller's own environment overrides.
 */
function start(name: string, command: string, args: string[], defaults: Record<string, string> = {}): DemoProcess {
	const child = spawn(command, args, {
		detached: true,
		env: { ...defaults, ...process.env },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	for (const stream of [child.stdout, child.stderr]) {
		createInterface({ input: stream }).on('line', (line) => console.log(`[${name}] ${line}`));
	}
	const exited = new Promise<void>((resolve) =>
		child.once('exit', (code, signal) => {
			log(`${name} exited (${signal ?? `code ${code}`})`);
			resolve();
			if (!stopping) {
				exitCode = 1;
				void stopDemo();
			}
		})
	);
	return { name, exited, signal: (signal) => signalGroup(child.pid, signal) };
}

/** Signals the whole process group, so whatever the command started stops with it. */
function signalGroup(pid: number | undefined, signal: NodeJS.Signals): void {
	if (pid === undefined) return;
	try {
		process.kill(-pid, signal);
	} catch {
		// Already gone.
	}
}

async function serverReady(): Promise<boolean> {
	const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
	while (Date.now() < deadline && !stopping) {
		if (await answers(`${SERVER_URL}/api/agents`)) return true;
		await Bun.sleep(SERVER_POLL_MS);
	}
	return false;
}

/** Any HTTP answer, even an error, means something already listens there. */
async function listening(url: string): Promise<boolean> {
	try {
		await fetch(url);
		return true;
	} catch {
		return false;
	}
}

async function answers(url: string): Promise<boolean> {
	try {
		return (await fetch(url)).ok;
	} catch {
		return false;
	}
}

async function stopDemo(): Promise<void> {
	if (stopping) return;
	stopping = true;
	log('stopping: agents first, then the server');
	await stopInOrder([
		{ processes: agents, graceMs: AGENT_GRACE_MS },
		{ processes: [server], graceMs: SERVER_GRACE_MS }
	]);
	log('demo stopped');
	process.exit(exitCode);
}

function log(message: string): void {
	console.log(`[demo] ${message}`);
}
