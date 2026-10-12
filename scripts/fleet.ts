// Manages the fleet (.devnet/fleet/<id>/). Run from the repo root.
//   owner-key: creates the owner's ML-KEM-768 key file (OWNER_MLKEM_FILE) if it is missing.
//   import:    puts an agent registered on devnet into the fleet, e.g. .devnet/agent.json from
//              `bun scripts/agent.ts register`; copies its keys into .devnet/fleet/<id>/onchain.json and seals its
//              decision log to the owner's key.
//   seal:      seals the decision log of an agent imported before logs were sealed.
import { existsSync } from 'fs';
import { parseArgs } from 'util';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { fetchAgent, loadAgentFile, saveAgentFile } from 'pq-agent-guard';
import { Fleet, type RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import {
	createLogSeal,
	createOwnerKemKey,
	loadOwnerKemKey,
	saveOwnerKemKey,
	type LogSeal
} from '../src/lib/server/modules/fleet/log-seal';
import { FLEET_DIR, guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';

const USAGE = [
	'Usage: bun scripts/fleet.ts owner-key',
	'       bun scripts/fleet.ts import <agent file> --as <id> --name "<name>" [--risk LOW (default)|MEDIUM|HIGH|CRITICAL]',
	'       bun scripts/fleet.ts seal <id>'
].join('\n');
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_RISK: RiskLevel = 'LOW';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { name: { type: 'string' }, as: { type: 'string' }, risk: { type: 'string', default: DEFAULT_RISK } }
});
const [command, argument] = positionals;
const config = loadConfig(process.env);
const fleet = new Fleet(FLEET_DIR);

function fail(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(1);
}

if (command === 'owner-key') createOwnerKey();
else if (command === 'import') await importAgent(argument ?? fail('the agent file is required'));
else if (command === 'seal') sealAgent(argument ?? fail('the agent id is required'));
else fail(`unknown command ${command ?? ''}`);

function createOwnerKey(): void {
	if (existsSync(config.ownerKemPath)) {
		console.log(`owner ML-KEM key ${config.ownerKemPath} exists`);
		return;
	}
	saveOwnerKemKey(config.ownerKemPath, createOwnerKemKey());
	console.log(`owner ML-KEM-768 key written to ${config.ownerKemPath}; its secret key is the only way to read the logs`);
}

/** A new seal for each agent: a fresh ML-KEM capsule to the owner's public key, and the AES key it carries. */
function newSeal(): LogSeal {
	if (!existsSync(config.ownerKemPath)) fail(`${config.ownerKemPath} is missing; run: bun scripts/fleet.ts owner-key`);
	return createLogSeal(loadOwnerKemKey(config.ownerKemPath).publicKey);
}

async function importAgent(agentFilePath: string): Promise<void> {
	const riskLevel = values.risk as RiskLevel;
	if (!RISK_LEVELS.includes(riskLevel)) fail(`unknown risk level ${values.risk}`);
	const id = values.as ?? fail('--as <id> is required');
	const name = values.name ?? fail('--name is required');
	const agentFile = loadAgentFile(agentFilePath);
	const seal = newSeal();
	// Proves the agent exists on this cluster and belongs to GUARD_PROGRAM_ID before anything is written.
	const state = await fetchAgent(guardClientFrom(config), agentFile.agent);
	if (state.owner !== agentFile.owner) fail(`on-chain owner ${state.owner} differs from the agent file's ${agentFile.owner}`);
	fleet.register({ id, name, riskLevel, registeredAt: Date.now() }, seal);
	saveAgentFile(onchainIdentityPath(id), agentFile);
	console.log(`imported ${agentFile.agent} as ${id}: owner ${state.owner}, ${state.status}, counter ${state.counter}, log sealed`);
}

function sealAgent(id: string): void {
	if (!fleet.get(id)) fail(`agent ${id} is not in the fleet`);
	if (fleet.isSealed(id)) {
		console.log(`${id} is already sealed`);
		return;
	}
	fleet.addSeal(id, newSeal());
	console.log(`${id}: decision log sealed to the owner's ML-KEM-768 key; earlier plaintext lines stay readable`);
}
