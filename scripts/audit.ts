// Checks a fleet agent's decision log (.devnet/fleet/<id>/decisions.jsonl) against its on-chain history: every step
// and resume present, each on-chain hash backed by a log record that still hashes to it. Run from the repo root.
// Usage: bun scripts/audit.ts <agent id>   (exit code 1 when a problem is found)
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { loadAgentFile } from '../src/lib/server/modules/agent/files';
import { fetchAgent, fetchGuardEvents } from '../src/lib/server/modules/agent/guard-client';
import { auditHistory } from '../src/lib/server/modules/fleet/audit';
import { Fleet } from '../src/lib/server/modules/fleet/fleet';
import { FLEET_DIR, guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';

const USAGE = 'Usage: bun scripts/audit.ts <agent id>   (a directory in .devnet/fleet, e.g. sentinel-01)';

const agentId = process.argv[2];
if (!agentId) {
	console.error(USAGE);
	process.exit(2);
}

const client = guardClientFrom(loadConfig());
const { agent } = loadAgentFile(onchainIdentityPath(agentId));
// Read before the history: steps that land meanwhile are past its counter and left out of the audit.
const state = await fetchAgent(client, agent);
const events = await fetchGuardEvents(client, agent, (fetched, total) =>
	process.stdout.write(`\rfetching transactions ${fetched}/${total}`)
);
process.stdout.write('\n');
const report = auditHistory({ agent, state, events, log: new Fleet(FLEET_DIR).decisions(agentId) });

console.log(`agent ${agentId} (${agent}), ${state.status}, counter ${state.counter}`);
console.log(`on-chain: ${report.steps} steps, ${report.resumes} resumes, ${report.kills} kills; log: ${report.logEntries} entries`);
if (report.newer > 0) console.log(`${report.newer} events and log entries newer than the account read, not audited`);
for (const problem of report.problems) console.log(`  ✗ ${problem}`);
console.log(report.problems.length ? `${report.problems.length} problems` : 'history OK');
process.exitCode = report.problems.length ? 1 : 0;
