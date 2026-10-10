// Sentinel: rebalances a virtual SOL/USDC treasury from the live Jupiter SOL price and asks the owner to approve large
// trades. It runs as its own process, holds no keys and keeps no state: each cycle it continues from its last decision
// recorded on chain.
import { createRuntimeClient } from '../shared/runtime-client';
import { loadSentinelConfig, type SentinelConfig } from './config';
import { runCycle } from './cycle';
import { fetchSolPrice } from './jupiter';

const config = configFromEnv();
const client = createRuntimeClient(config.apiUrl, config.agentId);

/** An invalid value stops the agent at start instead of running with a policy nobody asked for. */
function configFromEnv(): SentinelConfig {
	try {
		return loadSentinelConfig(process.env);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

const { targetSolShare, driftThreshold, scheduleMinutes, approvalShare } = config.policy;
console.log(
	`Sentinel (${config.agentId}) → ${config.apiUrl}, every ${config.intervalMs} ms; target SOL ${targetSolShare}, ` +
		`band ±${driftThreshold}, schedule ${scheduleMinutes} min, approval above ${approvalShare * 100}% of the ` +
		`treasury; Ctrl+C stops`
);
while (true) {
	const line = await runCycle({ client, fetchPrice: () => fetchSolPrice(), policy: config.policy });
	console.log(`${new Date().toISOString()} ${line}`);
	await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
}
