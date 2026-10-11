// The whole demo in one terminal: the server, then Sentinel (at demo pace) and Tick, their output prefixed by name.
// Ctrl+C stops it gracefully: the agents finish the step in flight and exit, and only then the server stops.
// Usage (from the repo root, with .env set up as in README): bun scripts/demo.ts
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { createInterface } from 'readline';
import { stopInOrder, type DemoProcess } from './demo-stop';

const PORT = 5173;
const SERVER_URL = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT_MS = 60_000;
const SERVER_POLL_MS = 500;
/** A devnet step can take a while to land; the agents get that long to finish it. */
const AGENT_GRACE_MS = 30_000;
const SERVER_GRACE_MS = 10_000;
const DEMO_PACE = { SENTINEL_SCHEDULE_MIN: '2', SENTINEL_INTERVAL_MS: '10000' };

if (!existsSync('.env')) {
	console.error('No .env in the current directory: run from the repo root after the setup in README.md');
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
		start('tick', process.execPath, ['agents/tick'])
	);
	log(`demo running at ${SERVER_URL}; Ctrl+C stops it`);
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
