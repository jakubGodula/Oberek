// Registers an agent in the fleet: its guard account (fake for now, .fake-chain/) and what the server shows about it
// (.fleet/). The agent process then submits decisions under this id. Run from the repo root.
// Usage: bun scripts/fleet.ts register <id> --name "<name>" --owner <wallet address> [--risk LOW|MEDIUM|HIGH|CRITICAL]
import { parseArgs } from 'util';
import { FakeGuard } from '../src/lib/server/modules/agent-guard/fake-guard';
import { Fleet, type RiskLevel } from '../src/lib/server/modules/fleet/fleet';
import { FAKE_CHAIN_DIR, FLEET_DIR } from '../src/lib/server/modules/fleet/runtime';

const USAGE =
	'Usage: bun scripts/fleet.ts register <id> --name "<name>" --owner <wallet address> [--risk LOW|MEDIUM|HIGH|CRITICAL]';
const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_RISK: RiskLevel = 'LOW';

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { name: { type: 'string' }, owner: { type: 'string' }, risk: { type: 'string', default: DEFAULT_RISK } }
});
const [command, id] = positionals;
const riskLevel = values.risk as RiskLevel;

if (command !== 'register' || !id || !values.name || !values.owner || !RISK_LEVELS.includes(riskLevel)) {
	console.error(USAGE);
	process.exit(1);
}

const guard = new FakeGuard(FAKE_CHAIN_DIR);
const account = await guard.register(id, values.owner);
new Fleet(FLEET_DIR).register({ id, name: values.name, riskLevel, registeredAt: Date.now() });
console.log(`registered ${id}: owner ${account.owner}, status ${account.status}, counter ${account.counter}`);
console.log(`guard account: ${FAKE_CHAIN_DIR}/${id}.json, fleet entry: ${FLEET_DIR}/${id}/agent.json`);
