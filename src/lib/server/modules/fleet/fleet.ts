import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertAgentId, isAgentId } from '../agent-guard/guard';

// The fleet: what the server knows about each registered agent (name, risk level) and the log of its decisions.
// One directory per agent: <fleetDir>/<agentId>/agent.json and decisions.jsonl.

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
	observedAt: string;
}

export interface DecisionLogEntry {
	record: DecisionRecord;
	decisionHash: string;
	/** Set when the guard failed without a verdict: the step may or may not have been recorded. */
	unconfirmed?: true;
}

const ENTRY_FILE = 'agent.json';
const DECISION_LOG_FILE = 'decisions.jsonl';

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
		appendFileSync(join(this.agentDir(agentId), DECISION_LOG_FILE), JSON.stringify(entry) + '\n');
	}

	lastDecision(agentId: string): DecisionLogEntry | undefined {
		return this.readLog(agentId).at(-1);
	}

	/** The newest log entry with that hash; for the hash the guard holds, the record of the last recorded step. */
	findDecision(agentId: string, decisionHash: string): DecisionLogEntry | undefined {
		return this.readLog(agentId)
			.reverse()
			.find((entry) => entry.decisionHash === decisionHash);
	}

	private readLog(agentId: string): DecisionLogEntry[] {
		const path = join(this.agentDir(agentId), DECISION_LOG_FILE);
		if (!existsSync(path)) return [];
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line !== '')
			.map((line) => JSON.parse(line));
	}

	private agentDir(agentId: string): string {
		assertAgentId(agentId);
		return join(this.fleetDir, agentId);
	}
}
