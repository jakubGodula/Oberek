import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertAgentId, isAgentId, type LandedTransaction } from '../agent-guard/guard';

// The fleet: what the server knows about each registered agent (name, risk level), the log of its decisions and the
// log of its guard transactions that landed. One directory per agent: <fleetDir>/<agentId>/agent.json, decisions.jsonl
// and transactions.jsonl.

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

export class Fleet {
	constructor(private readonly fleetDir: string) {}

	register(entry: FleetEntry): void {
		const dir = this.agentDir(entry.id);
		if (existsSync(dir)) throw new Error(`agent ${entry.id} is already in the fleet`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, ENTRY_FILE), JSON.stringify(entry, null, 2) + '\n');
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

	appendDecision(agentId: string, entry: DecisionLogEntry): void {
		this.appendLine(agentId, DECISION_LOG_FILE, entry);
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

	private readLog(agentId: string): DecisionLogEntry[] {
		return this.readLines(agentId, DECISION_LOG_FILE);
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
