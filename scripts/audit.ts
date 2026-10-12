// Audits a fleet agent: compares its decision log (.devnet/fleet/<id>/decisions.jsonl) with its on-chain history and
// checks that every step and resume is on-chain and that each on-chain hash is backed by a log record that still
// hashes to it. Sealed log lines are opened with the owner's ML-KEM-768 secret key (OWNER_MLKEM_FILE), not with the
// server's copy of the key. Read-only: sends no transactions, costs no fees. Run from the repo root.
// Usage: bun scripts/audit.ts <agent id>
// Exit code: 0 history OK, 1 problems found, 2 usage error.
import type { Address } from '@solana/kit';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import {
	fetchAgent,
	fetchGuardEvents,
	loadAgentFile,
	type AgentState,
	type GuardClient,
	type GuardEvent
} from 'pq-agent-guard';
import { auditHistory, type AuditReport } from '../src/lib/server/modules/fleet/audit';
import { Fleet } from '../src/lib/server/modules/fleet/fleet';
import { loadOwnerKemKey, recoverDataKey } from '../src/lib/server/modules/fleet/log-seal';
import { guardClientFrom, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';
import { fleetDir } from '../src/lib/server/modules/fleet/fleet-dir';

const USAGE = 'Usage: bun scripts/audit.ts <agent id>   (a directory in .devnet/fleet, e.g. sentinel-01)';
const EXIT_OK = 0;
const EXIT_PROBLEMS = 1;
const EXIT_USAGE = 2;

const agentId = agentIdFromArgs();
const config = loadConfig();
const client = guardClientFrom(config);
const { agent } = loadAgentFile(onchainIdentityPath(agentId));
// The account is read before the history, so its counter is the audit's cutoff: steps that land while the history is
// being fetched are past it and reported as newer, not as problems.
const state = await fetchAgent(client, agent);
const events = await fetchEventsShowingProgress(client, agent);
const report = auditHistory({ agent, state, events, log: ownerFleet().decisions(agentId) });
printReport(agent, state, report);
process.exitCode = report.problems.length ? EXIT_PROBLEMS : EXIT_OK;

/**
 * The fleet as the owner reads it: each log key recovered from the seal's ML-KEM capsule with the owner's secret key,
 * never taken from the server's stored copy. The owner key is loaded only when a sealed line needs it.
 */
function ownerFleet(): Fleet {
	const stored = new Fleet(fleetDir());
	const ownerSecretKey = () => loadOwnerKemKey(config.ownerKemPath).secretKey;
	return new Fleet(fleetDir(), (id) => recoverDataKey(stored.seal(id).kemCiphertext, ownerSecretKey()));
}

function agentIdFromArgs(): string {
	const id = process.argv[2];
	if (id) return id;
	console.error(USAGE);
	process.exit(EXIT_USAGE);
}

/** One getTransaction per transaction, so this takes minutes; the progress line is rewritten in place. */
async function fetchEventsShowingProgress(guard: GuardClient, account: Address): Promise<GuardEvent[]> {
	const fetched = await fetchGuardEvents(guard, account, (done, total) =>
		process.stdout.write(`\rfetching transactions ${done}/${total}`)
	);
	process.stdout.write('\n');
	return fetched;
}

function printReport(account: Address, agentState: AgentState, audit: AuditReport): void {
	console.log(`agent ${agentId} (${account}), ${agentState.status}, counter ${agentState.counter}`);
	console.log(`on-chain: ${audit.steps} steps, ${audit.batches} batches, ${audit.resumes} resumes, ${audit.kills} kills; log: ${audit.logEntries} entries`);
	const lines = new Fleet(fleetDir()).decisionLineCounts(agentId);
	console.log(`log file: ${lines.sealed} lines sealed (opened with the owner's ML-KEM key), ${lines.legacy} plaintext from before sealing`);
	if (audit.newer > 0) console.log(`${audit.newer} events and log entries newer than the account read, not audited`);
	for (const problem of audit.problems) console.log(`  ✗ ${problem}`);
	console.log(audit.problems.length ? `${audit.problems.length} problems` : 'history OK');
}
