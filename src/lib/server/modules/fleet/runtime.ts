import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, type AgentConfig } from '../agent/config';
import { loadAgentFile, loadKeypairSigner, type AgentFile } from '../agent/files';
import type { GuardClient } from '../agent/guard-client';
import { connect } from '../agent/transaction';
import { GuardError, type LandedTransaction } from '../agent-guard/guard';
import { assertAgentId } from './agent-id';
import { OnchainGuard } from '../agent-guard/onchain-guard';
import { batchPolicyFrom, DecisionBatcher } from './decision-batcher';
import { Fleet } from './fleet';
import { flushBatch } from './record-decision';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';

// The fleet runtime on devnet: agents guarded by the onchain_agent_guard program. Paths are relative to the repo root,
// where the dev server and scripts run; .devnet/ is gitignored.

type Env = Record<string, string | undefined>;

export const FLEET_DIR = '.devnet/fleet';
/** Next to an agent's fleet entry: its on-chain addresses and ML-DSA-44 secret key (agent file format). */
const ONCHAIN_IDENTITY_FILE = 'onchain.json';
/** Each step costs the fee payer ~15,000 lamports: 10 s caps one agent at ~0.13 SOL a day. */
const MIN_STEP_INTERVAL_MS = 10_000;

export function onchainIdentityPath(agentId: string): string {
	assertAgentId(agentId);
	return join(FLEET_DIR, agentId, ONCHAIN_IDENTITY_FILE);
}

export function guardClientFrom(config: AgentConfig): GuardClient {
	return { connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl), programAddress: config.programAddress };
}

/** The server has no usable fleet configuration (a variable or a keypair file is missing); the mock agents still work. */
export class FleetNotConfiguredError extends Error {}

export async function createFleetRuntime(env: Env): Promise<FleetRuntime> {
	const fleet = new Fleet(FLEET_DIR);
	const now = () => new Date();
	// Every guard transaction that lands goes to the agent's transaction log, next to its decision log.
	const onLanded = (transaction: LandedTransaction) =>
		fleet.appendTransaction({ ...transaction, landedAt: now().getTime() });
	const guard = await createGuard(env, onLanded).catch((error: unknown) => {
		throw new FleetNotConfiguredError(error instanceof Error ? error.message : String(error));
	});
	const runtime: FleetRuntime = { guard, fleet, throttle: new StepThrottle(MIN_STEP_INTERVAL_MS), now };
	runtime.batcher = new DecisionBatcher(batchPolicyFrom(env), (agentId, queued) => flushBatch(runtime, agentId, queued));
	return runtime;
}

async function createGuard(env: Env, onLanded: (transaction: LandedTransaction) => void): Promise<OnchainGuard> {
	const config = loadConfig(env);
	if (!config.ownerPath) throw new Error('OWNER_KEYPAIR is not set: the server signs kill and resume as the owner');
	return new OnchainGuard({
		client: guardClientFrom(config),
		feePayer: await loadKeypairSigner(config.feePayerPath),
		owner: await loadKeypairSigner(config.ownerPath),
		identityOf: loadOnchainIdentity,
		onLanded
	});
}

function loadOnchainIdentity(agentId: string): AgentFile {
	const path = onchainIdentityPath(agentId);
	if (!existsSync(path)) throw new GuardError('AgentNotFound', `agent ${agentId} has no on-chain identity (${path})`);
	return loadAgentFile(path);
}
