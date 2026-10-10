// Puts an agent in the fleet of the current CHAIN (.env, see .env.example). Run from the repo root.
//   CHAIN=fake    register <id> --name "<name>" --owner <wallet address> [--risk LOW|MEDIUM|HIGH|CRITICAL]
//                 creates the agent's fake guard account (.fake-chain/) and fleet entry (.fake-chain/fleet/)
//   CHAIN=devnet  import <agent file> --as <id> --name "<name>" [--risk LOW|MEDIUM|HIGH|CRITICAL]
//                 adopts an agent already registered on devnet, e.g. .devnet/agent.json from scripts/agent.ts register;
//                 copies its keys into .devnet/fleet/<id>/onchain.json
import { parseArgs } from 'util';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { loadAgentFile, saveAgentFile } from '../src/lib/server/modules/agent/files';
import { fetchAgent } from '../src/lib/server/modules/agent/guard-client';
import { FakeGuard } from '../src/lib/server/modules/agent-guard/fake-guard';
import { Fleet, type FleetEntry, type RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import {
	chainFrom,
	FAKE_CHAIN_DIR,
	fleetDirFor,
	guardClientFrom,
	onchainIdentityPath,
	type Chain
} from '../src/lib/server/modules/fleet/runtime';

const USAGE = `Usage (the command must match CHAIN):
  CHAIN=fake    bun scripts/fleet.ts register <id> --name "<name>" --owner <wallet address> [--risk LEVEL]
  CHAIN=devnet  bun scripts/fleet.ts import <agent file> --as <id> --name "<name>" [--risk LEVEL]
  LEVEL: LOW (default), MEDIUM, HIGH, CRITICAL`;
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_RISK: RiskLevel = 'LOW';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		name: { type: 'string' },
		owner: { type: 'string' },
		as: { type: 'string' },
		risk: { type: 'string', default: DEFAULT_RISK }
	}
});
const [command, target] = positionals;
const chain = chainFrom(process.env);
const fleet = new Fleet(fleetDirFor(chain));

const commands: Record<string, { chain: Chain; run: () => Promise<void> }> = {
	register: { chain: 'fake', run: registerFakeAgent },
	import: { chain: 'devnet', run: importOnchainAgent }
};

async function registerFakeAgent(): Promise<void> {
	const owner = values.owner ?? fail('--owner is required');
	const entry = fleetEntry(target);
	const account = await new FakeGuard(FAKE_CHAIN_DIR).register(entry.id, owner);
	fleet.register(entry);
	console.log(`registered ${entry.id} on the fake chain: owner ${account.owner}, status ${account.status}`);
}

async function importOnchainAgent(): Promise<void> {
	const agentFile = loadAgentFile(target ?? fail('the agent file is required'));
	const entry = fleetEntry(values.as);
	// Proves the agent exists on this cluster and belongs to GUARD_PROGRAM_ID before anything is written.
	const state = await fetchAgent(guardClientFrom(loadConfig(process.env)), agentFile.agent);
	if (state.owner !== agentFile.owner) fail(`on-chain owner ${state.owner} differs from the agent file's ${agentFile.owner}`);
	fleet.register(entry);
	saveAgentFile(onchainIdentityPath(entry.id), agentFile);
	console.log(`imported ${agentFile.agent} as ${entry.id}: owner ${state.owner}, ${state.status}, counter ${state.counter}`);
}

function fleetEntry(id: string | undefined): FleetEntry {
	const riskLevel = values.risk as RiskLevel;
	if (!RISK_LEVELS.includes(riskLevel)) fail(`unknown risk level ${values.risk}`);
	return {
		id: id ?? fail('the agent id is required'),
		name: values.name ?? fail('--name is required'),
		riskLevel,
		registeredAt: Date.now()
	};
}

function fail(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(1);
}

const selected = commands[command ?? ''] ?? fail(`unknown command ${command ?? ''}`);
if (selected.chain !== chain) fail(`${command} needs CHAIN=${selected.chain}, but CHAIN is ${chain}`);
await selected.run();
