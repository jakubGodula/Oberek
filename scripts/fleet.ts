// Puts an agent registered on devnet into the fleet (.devnet/fleet/<id>/), e.g. .devnet/agent.json from
// `bun scripts/agent.ts register`; copies its keys into .devnet/fleet/<id>/onchain.json. Run from the repo root.
// Usage: bun scripts/fleet.ts import <agent file> --as <id> --name "<name>" [--risk LOW|MEDIUM|HIGH|CRITICAL]
import { parseArgs } from 'util';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { loadAgentFile, saveAgentFile } from '../src/lib/server/modules/agent/files';
import { fetchAgent } from '../src/lib/server/modules/agent/guard-client';
import { Fleet, type RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import { FLEET_DIR, guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';

const USAGE =
	'Usage: bun scripts/fleet.ts import <agent file> --as <id> --name "<name>" [--risk LOW (default)|MEDIUM|HIGH|CRITICAL]';
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_RISK: RiskLevel = 'LOW';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { name: { type: 'string' }, as: { type: 'string' }, risk: { type: 'string', default: DEFAULT_RISK } }
});
const [command, agentFilePath] = positionals;
const riskLevel = values.risk as RiskLevel;

function fail(message: string): never {
	console.error(`${message}\n${USAGE}`);
	process.exit(1);
}

if (command !== 'import') fail(`unknown command ${command ?? ''}`);
if (!RISK_LEVELS.includes(riskLevel)) fail(`unknown risk level ${values.risk}`);
const id = values.as ?? fail('--as <id> is required');
const name = values.name ?? fail('--name is required');
const agentFile = loadAgentFile(agentFilePath ?? fail('the agent file is required'));

// Proves the agent exists on this cluster and belongs to GUARD_PROGRAM_ID before anything is written.
const state = await fetchAgent(guardClientFrom(loadConfig(process.env)), agentFile.agent);
if (state.owner !== agentFile.owner) fail(`on-chain owner ${state.owner} differs from the agent file's ${agentFile.owner}`);
new Fleet(FLEET_DIR).register({ id, name, riskLevel, registeredAt: Date.now() });
saveAgentFile(onchainIdentityPath(id), agentFile);
console.log(`imported ${agentFile.agent} as ${id}: owner ${state.owner}, ${state.status}, counter ${state.counter}`);
