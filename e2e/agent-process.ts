// The test agents as their own processes, as in the demo, pointed at the test server. Stopped like the demo's
// (scripts/demo-stop.ts): SIGTERM, so a step in flight lands first, and SIGKILL only after the grace period.
import { spawn } from 'node:child_process';
import { DEMO_PACE } from '../scripts/demo-pace';
import type { DemoProcess } from '../scripts/demo-stop';
import { E2E_SENTINEL, E2E_TICK } from '../scripts/setup-plan';

export type AgentName = 'tick' | 'sentinel';

export interface AgentProcess extends DemoProcess {
	readonly name: AgentName;
	running(): boolean;
	output(): string;
}

/** A devnet step can take up to ~30 s to land (scripts/demo.ts gives agents the same grace). */
export const AGENT_STOP_GRACE_MS = 40_000;
/** The server's step throttle allows one step per agent every 10 s; batched or not, a step lands about that often. */
const TICK_INTERVAL_MS = 10_000;

/** The variable that points each agent at its server; e2e/preflight.ts finds leftover test agents by it. */
export const API_URL_VARIABLES: Record<AgentName, string> = { tick: 'TICK_API_URL', sentinel: 'SENTINEL_API_URL' };

function agentEnv(name: AgentName, apiUrl: string): Record<string, string> {
	const pointedAtServer = { [API_URL_VARIABLES[name]]: apiUrl };
	return name === 'tick'
		? { ...pointedAtServer, TICK_AGENT_ID: E2E_TICK.id, TICK_INTERVAL_MS: String(TICK_INTERVAL_MS) }
		: { ...pointedAtServer, SENTINEL_AGENT_ID: E2E_SENTINEL.id, ...DEMO_PACE };
}

export function startAgent(name: AgentName, apiUrl: string): AgentProcess {
	const child = spawn('bun', [`agents/${name}`], {
		env: { ...process.env, ...agentEnv(name, apiUrl) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	let alive = true;
	const collect = (chunk: Buffer | string) => {
		output += chunk.toString();
	};
	child.stdout.on('data', collect);
	child.stderr.on('data', collect);
	// A process that cannot start (no bun on PATH) emits 'error' and may never emit 'exit'.
	const exited = new Promise<void>((resolve) => {
		child.once('exit', resolve);
		child.once('error', (error) => {
			collect(`${error.message}\n`);
			resolve();
		});
	}).then(() => {
		alive = false;
	});
	return {
		name,
		exited,
		running: () => alive,
		output: () => output,
		signal: (signal) => {
			child.kill(signal);
		}
	};
}
