// The chain as the tests see it: one test-fleet agent's account, read by e2e/chain-state.ts under Bun.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { E2E_FLEET_DIR } from '../src/lib/server/modules/fleet/fleet-dir';

export interface ChainState {
	status: 'Active' | 'Killed' | 'Pending';
	counter: number;
	lastDecision: string;
	agentKey: string;
}

/** Each read starts a Bun process and an RPC call, so polls space them out. */
export const CHAIN_POLL = { intervals: [2_000] };

/** A devnet RPC call fails now and then; a read is tried this many times before the test fails. */
const READ_ATTEMPTS = 3;

const run = promisify(execFile);

export async function readChain(agentId: string): Promise<ChainState> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await readChainOnce(agentId);
		} catch (error) {
			if (attempt === READ_ATTEMPTS) throw error;
		}
	}
}

async function readChainOnce(agentId: string): Promise<ChainState> {
	const { stdout } = await run('bun', ['e2e/chain-state.ts', agentId], {
		env: { ...process.env, FLEET_DIR: E2E_FLEET_DIR }
	});
	const lines = stdout.trim().split('\n');
	return JSON.parse(lines[lines.length - 1]) as ChainState;
}
