// Prints one test-fleet agent's account on chain as JSON on the last line. Playwright runs in Node and reads the chain
// through this Bun script, which resolves the kit and .env the way the server does.
// Usage: FLEET_DIR=.devnet/e2e-fleet bun e2e/chain-state.ts <agent id>
import { getBase16Decoder } from '@solana/kit';
import { fetchAgent, loadAgentFile } from 'pq-agent-guard';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';

const agentId = process.argv[2];
if (!agentId) {
	console.error('Usage: FLEET_DIR=<fleet dir> bun e2e/chain-state.ts <agent id>');
	process.exit(2);
}
const { agent } = loadAgentFile(onchainIdentityPath(agentId));
const state = await fetchAgent(guardClientFrom(loadConfig(process.env)), agent);
console.log(
	JSON.stringify({
		status: state.status,
		counter: Number(state.counter),
		lastDecision: getBase16Decoder().decode(state.lastDecision),
		agentKey: state.agentKey
	})
);
// The RPC client keeps the process alive.
process.exit(0);
