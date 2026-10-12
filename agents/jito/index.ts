// JitoSOL steward: every 30 s it notes a quiet cycle, or votes on the one simulated proposal the page armed. The
// answer is local (a positive reading is FOR, a negative reading is AGAINST). It runs as its own process, holds no
// keys and keeps no state.
import { createRuntimeClient } from '../shared/runtime-client';
import { runLoop, stopOnSignals } from '../shared/loop';
import { loadJitoConfig, type JitoConfig } from './config';
import { runCycle } from './cycle';

const config = configFromEnv();
const client = createRuntimeClient(config.apiUrl, config.agentId);

/** An invalid value stops the agent at start instead of running on an interval nobody asked for. */
function configFromEnv(): JitoConfig {
	try {
		return loadJitoConfig(process.env);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

console.log(
	`JitoSOL steward (${config.agentId}) → ${config.apiUrl}, every ${config.intervalMs} ms; ` +
		'quiet unless the page armed a simulated proposal; Ctrl+C stops'
);
await runLoop(
	async () => {
		console.log(`${new Date().toISOString()} ${await runCycle(client)}`);
	},
	config.intervalMs,
	stopOnSignals()
);
console.log('JitoSOL steward stopped');
