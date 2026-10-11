import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertAgentId, isAgentId, type LandedTransaction } from '../agent-guard/guard';
import { loadLogSeal, saveLogSeal, type LogSeal } from './log-seal';
import { isSealedLine, openLine, sealEntry, type SealedLine } from './sealed-log';

// The fleet: what the server knows about each registered agent (name, risk level), the log of its decisions and the
// log of its guard transactions that landed. One directory per agent: <fleetDir>/<agentId>/agent.json, seal.json (the
// log's key, see log-seal.ts), decisions.jsonl (sealed lines, see sealed-log.ts; plaintext lines from before sealing
// are still read) and transactions.jsonl.

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface FleetEntry {
	id: string;
	name: string;
	riskLevel: RiskLevel;
	registeredAt: number;
}

/** What the agent decided, as hashed for the guard. */
export interface DecisionRecord {
	agent: string;
	counter: number;
	kind: string;
	decision: Record<string, unknown>;
	summary: string;
	/** The agent stops after this decision until the owner accepts or rejects it. */
	requiresApproval?: true;
	observedAt: string;
}

export interface DecisionLogEntry {
	record: DecisionRecord;
	decisionHash: string;
	/** Set when the guard failed without a verdict: the step may or may not have been recorded. */
	unconfirmed?: true;
}

export interface LoggedTransaction extends LandedTransaction {
	/** When the server saw it land, in ms. */
	landedAt: number;
}

const ENTRY_FILE = 'agent.json';
const DECISION_LOG_FILE = 'decisions.jsonl';
const TRANSACTION_LOG_FILE = 'transactions.jsonl';
const SEAL_FILE = 'seal.json';

/** The agent has no seal.json: nothing may be sent on-chain, since its record could not be logged. */
export class LogNotSealedError extends Error {}

/** Where the decision log's AES key comes from: the server reads seal.json, the owner's audit recovers it. */
export type DataKeyOf = (agentId: string) => Uint8Array;

export class Fleet {
	private readonly dataKeyOf: DataKeyOf;

	constructor(
		private readonly fleetDir: string,
		dataKeyOf?: DataKeyOf
	) {
		this.dataKeyOf = dataKeyOf ?? ((agentId) => this.seal(agentId).dataKey);
	}

	register(entry: FleetEntry, seal: LogSeal): void {
		const dir = this.agentDir(entry.id);
		if (existsSync(dir)) throw new Error(`agent ${entry.id} is already in the fleet`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, ENTRY_FILE), JSON.stringify(entry, null, 2) + '\n');
		this.addSeal(entry.id, seal);
	}

	/** Seals an agent imported before the log was sealed; its plaintext lines stay readable. */
	addSeal(agentId: string, seal: LogSeal): void {
		if (!this.get(agentId)) throw new Error(`agent ${agentId} is not in the fleet`);
		saveLogSeal(this.sealPath(agentId), seal);
	}

	isSealed(agentId: string): boolean {
		return existsSync(this.sealPath(agentId));
	}

	assertSealed(agentId: string): void {
		if (!this.isSealed(agentId)) {
			throw new LogNotSealedError(`agent ${agentId} has no sealed decision log; run: bun scripts/fleet.ts seal ${agentId}`);
		}
	}

	seal(agentId: string): LogSeal {
		return loadLogSeal(this.sealPath(agentId));
	}

	list(): FleetEntry[] {
		if (!existsSync(this.fleetDir)) return [];
		return readdirSync(this.fleetDir)
			.map((agentId) => this.get(agentId))
			.filter((entry): entry is FleetEntry => entry !== undefined);
	}

	get(agentId: string): FleetEntry | undefined {
		if (!isAgentId(agentId)) return undefined;
		const path = join(this.agentDir(agentId), ENTRY_FILE);
		return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
	}

	/** Throws for an agent without a seal: nothing is written in clear. */
	appendDecision(agentId: string, entry: DecisionLogEntry): void {
		this.appendLine(agentId, DECISION_LOG_FILE, sealEntry(this.dataKeyOf(agentId), entry));
	}

	/** How many log lines are sealed and how many are plaintext from before sealing, without opening any. */
	decisionLineCounts(agentId: string): { sealed: number; legacy: number } {
		const lines = this.readLines<unknown>(agentId, DECISION_LOG_FILE);
		const sealed = lines.filter(isSealedLine).length;
		return { sealed, legacy: lines.length - sealed };
	}

	appendTransaction(transaction: LoggedTransaction): void {
		this.appendLine(transaction.agentId, TRANSACTION_LOG_FILE, transaction);
	}

	/** The agent's guard transactions that landed, oldest first. */
	transactions(agentId: string): LoggedTransaction[] {
		return this.readLines(agentId, TRANSACTION_LOG_FILE);
	}

	lastDecision(agentId: string): DecisionLogEntry | undefined {
		return this.readLog(agentId).at(-1);
	}

	/** The whole log, oldest first, `unconfirmed` marks included. */
	decisions(agentId: string): DecisionLogEntry[] {
		return this.readLog(agentId);
	}

	/** The newest `limit` log entries, newest first, `unconfirmed` marks included. */
	recentDecisions(agentId: string, limit: number): DecisionLogEntry[] {
		return this.readLog(agentId).slice(-limit).reverse();
	}

	/** The newest log entry with that hash; for the hash the guard holds, the record of the last recorded step. */
	findDecision(agentId: string, decisionHash: string): DecisionLogEntry | undefined {
		return this.readLog(agentId)
			.reverse()
			.find((entry) => entry.decisionHash === decisionHash);
	}

	/** The data key is read only when a sealed line needs it, so an unsealed agent's plaintext log still reads. */
	private readLog(agentId: string): DecisionLogEntry[] {
		const lines = this.readLines<SealedLine | DecisionLogEntry>(agentId, DECISION_LOG_FILE);
		let dataKey: Uint8Array | undefined;
		return lines.flatMap((line) => {
			if (!isSealedLine(line)) return [line];
			dataKey ??= this.dataKeyOf(agentId);
			return openOrSkip(agentId, dataKey, line);
		});
	}

	private appendLine(agentId: string, file: string, value: unknown): void {
		appendFileSync(join(this.agentDir(agentId), file), JSON.stringify(value) + '\n');
	}

	private readLines<T>(agentId: string, file: string): T[] {
		const path = join(this.agentDir(agentId), file);
		if (!existsSync(path)) return [];
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line !== '')
			.flatMap((line) => parseLogLine<T>(path, line));
	}

	private sealPath(agentId: string): string {
		return join(this.agentDir(agentId), SEAL_FILE);
	}

	private agentDir(agentId: string): string {
		assertAgentId(agentId);
		return join(this.fleetDir, agentId);
	}
}

/** A line that is not JSON (e.g. cut short by a crash mid-append) is reported and passed over, not fatal to the log. */
function parseLogLine<T>(path: string, line: string): T[] {
	try {
		return [JSON.parse(line)];
	} catch {
		console.warn(`${path}: skipping a line that is not JSON: ${line.slice(0, 80)}`);
		return [];
	}
}

/** A line that does not open with the key is reported and passed over; the audit then misses its step. */
function openOrSkip(agentId: string, dataKey: Uint8Array, line: SealedLine): DecisionLogEntry[] {
	try {
		return [openLine(dataKey, line)];
	} catch {
		console.warn(`${agentId}: skipping a decision log line (counter ${line.counter}) that does not open with the key`);
		return [];
	}
}
