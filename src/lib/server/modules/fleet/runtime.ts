import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, type AgentConfig } from '../agent/config';
import { loadAgentFile, loadKeypairSigner, type AgentFile } from '../agent/files';
import type { GuardClient } from '../agent/guard-client';
import { connect } from '../agent/transaction';
import { FakeGuard } from '../agent-guard/fake-guard';
import { assertAgentId, GuardError, type AgentGuard } from '../agent-guard/guard';
import { OnchainGuard } from '../agent-guard/onchain-guard';
import { Fleet } from './fleet';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';

// CHAIN picks one world for the whole server: the fake guard on local files, or the onchain_agent_guard program on
// devnet. Each world has its own fleet, because a fleet entry only makes sense with the guard it was registered with.
// Paths are relative to the repo root, where the dev server and scripts run; all of them are gitignored.

export type Chain = 'fake' | 'devnet';
type Env = Record<string, string | undefined>;

export interface AppRuntime extends FleetRuntime {
	chain: Chain;
}

const DEFAULT_CHAIN: Chain = 'fake';
/** Everything of the fake world: the fake guard accounts (<id>.json) and its fleet (fleet/). */
export const FAKE_CHAIN_DIR = '.fake-chain';
/** Each devnet step costs the fee payer ~15,000 lamports: 10 s caps one agent at ~0.13 SOL a day. Fake steps are free. */
const MIN_STEP_INTERVAL_MS: Record<Chain, number> = { fake: 0, devnet: 10_000 };
const FLEET_DIRS: Record<Chain, string> = { fake: `${FAKE_CHAIN_DIR}/fleet`, devnet: '.devnet/fleet' };
/** Next to a devnet agent's fleet entry: its on-chain addresses and ML-DSA-44 secret key (agent file format). */
const ONCHAIN_IDENTITY_FILE = 'onchain.json';

export function chainFrom(env: Env): Chain {
	const chain = env.CHAIN ?? DEFAULT_CHAIN;
	if (chain !== 'fake' && chain !== 'devnet') throw new Error(`CHAIN must be "fake" or "devnet", got "${chain}"`);
	return chain;
}

export function fleetDirFor(chain: Chain): string {
	return FLEET_DIRS[chain];
}

export function onchainIdentityPath(agentId: string): string {
	assertAgentId(agentId);
	return join(FLEET_DIRS.devnet, agentId, ONCHAIN_IDENTITY_FILE);
}

export function guardClientFrom(config: AgentConfig): GuardClient {
	return { connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl), programAddress: config.programAddress };
}

export async function createFleetRuntime(env: Env): Promise<AppRuntime> {
	const chain = chainFrom(env);
	const guard = chain === 'fake' ? new FakeGuard(FAKE_CHAIN_DIR) : await createOnchainGuard(env);
	return {
		chain,
		guard,
		fleet: new Fleet(fleetDirFor(chain)),
		throttle: new StepThrottle(MIN_STEP_INTERVAL_MS[chain]),
		now: () => new Date()
	};
}

async function createOnchainGuard(env: Env): Promise<AgentGuard> {
	const config = loadConfig(env);
	if (!config.ownerPath) throw new Error('OWNER_KEYPAIR is not set: on devnet the server signs kill and resume as the owner');
	return new OnchainGuard({
		client: guardClientFrom(config),
		feePayer: await loadKeypairSigner(config.feePayerPath),
		owner: await loadKeypairSigner(config.ownerPath),
		identityOf: loadOnchainIdentity
	});
}

function loadOnchainIdentity(agentId: string): AgentFile {
	const path = onchainIdentityPath(agentId);
	if (!existsSync(path)) throw new GuardError('AgentNotFound', `agent ${agentId} has no on-chain identity (${path})`);
	return loadAgentFile(path);
}
