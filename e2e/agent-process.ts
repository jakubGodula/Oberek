// The test agents as their own processes, as in the demo, pointed at the test server. Stopped with SIGTERM so a step
// in flight lands first.
import { spawn } from 'node:child_process';
import { E2E_SENTINEL, E2E_TICK } from '../scripts/setup-plan';

export type AgentName = 'tick' | 'sentinel';

export interface AgentProcess {
	running(): boolean;
	output(): string;
	stop(): Promise<void>;
}

/** A devnet step can take up to ~30 s to land (scripts/demo.ts gives agents the same grace). */
const STOP_GRACE_MS = 40_000;
/** The server's step throttle allows one step per agent every 10 s; batched or not, a step lands about that often. */
const STEP_INTERVAL_MS = '10000';
/** The demo's Sentinel pace (scripts/demo.ts DEMO_PACE). */
const SENTINEL_SCHEDULE_MIN = '2';

function agentEnv(name: AgentName, apiUrl: string): Record<string, string> {
	return name === 'tick'
		? { TICK_API_URL: apiUrl, TICK_AGENT_ID: E2E_TICK.id, TICK_INTERVAL_MS: STEP_INTERVAL_MS }
		: {
				SENTINEL_API_URL: apiUrl,
				SENTINEL_AGENT_ID: E2E_SENTINEL.id,
				SENTINEL_INTERVAL_MS: STEP_INTERVAL_MS,
				SENTINEL_SCHEDULE_MIN
			};
}

export function startAgent(name: AgentName, apiUrl: string): AgentProcess {
	const child = spawn('bun', [`agents/${name}`], {
		env: { ...process.env, ...agentEnv(name, apiUrl) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	const collect = (chunk: Buffer) => {
		output += chunk.toString();
	};
	child.stdout.on('data', collect);
	child.stderr.on('data', collect);
	const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
	const running = () => child.exitCode === null && child.signalCode === null;
	return {
		running,
		output: () => output,
		async stop() {
			if (!running()) return;
			child.kill('SIGTERM');
			const forceStop = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
			await exited;
			clearTimeout(forceStop);
		}
	};
}
