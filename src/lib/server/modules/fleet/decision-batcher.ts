import type { QueuedDecision } from './record-decision';

// The buffer of a fast agent: its decisions wait here and go on-chain together, one record_batch per flush. A flush
// runs when the buffer is full or its timer fires. Flushes and single steps of one agent run one at a time, so they
// never race for the agent's next counter. Kept in memory: a restart loses what was not flushed, which never reached
// the chain either.

export interface BatchPolicy {
	agentIds: ReadonlySet<string>;
	flushMs: number;
	maxDecisions: number;
}

export type FlushBatch = (agentId: string, queued: QueuedDecision[]) => Promise<unknown>;

type Env = Record<string, string | undefined>;

const DEFAULT_FLUSH_MS = 10_000;
const DEFAULT_MAX_DECISIONS = 16;

export function batchPolicyFrom(env: Env): BatchPolicy {
	const ids = (env.BATCHED_AGENT_IDS ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id !== '');
	return {
		agentIds: new Set(ids),
		flushMs: positiveInteger(env, 'BATCH_FLUSH_MS', DEFAULT_FLUSH_MS),
		maxDecisions: positiveInteger(env, 'BATCH_MAX_DECISIONS', DEFAULT_MAX_DECISIONS)
	};
}

export class DecisionBatcher {
	private readonly buffers = new Map<string, QueuedDecision[]>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** Per agent, the tail of its chain of flushes and steps; never rejects. */
	private readonly tails = new Map<string, Promise<unknown>>();

	constructor(
		private readonly policy: BatchPolicy,
		private readonly flush: FlushBatch
	) {}

	batches(agentId: string): boolean {
		return this.policy.agentIds.has(agentId);
	}

	queued(agentId: string): number {
		return this.buffers.get(agentId)?.length ?? 0;
	}

	enqueue(agentId: string, decision: QueuedDecision): void {
		const buffer = this.buffers.get(agentId) ?? [];
		buffer.push(decision);
		this.buffers.set(agentId, buffer);
		if (buffer.length >= this.policy.maxDecisions) this.flushInBackground(agentId);
		else if (!this.timers.has(agentId)) {
			this.timers.set(agentId, setTimeout(() => this.flushInBackground(agentId), this.policy.flushMs));
		}
	}

	/** Flushes the agent's buffer after whatever of its work is already running; rejects with the flush's error. */
	flushNow(agentId: string): Promise<void> {
		return this.serially(agentId, () => this.flushBuffer(agentId));
	}

	serially<T>(agentId: string, task: () => Promise<T>): Promise<T> {
		const run = (this.tails.get(agentId) ?? Promise.resolve()).then(task);
		this.tails.set(agentId, run.catch(() => undefined));
		return run;
	}

	/** Takes the buffer when the flush starts, so decisions that arrived while it waited go with it. */
	private async flushBuffer(agentId: string): Promise<void> {
		clearTimeout(this.timers.get(agentId));
		this.timers.delete(agentId);
		const queued = this.buffers.get(agentId) ?? [];
		this.buffers.delete(agentId);
		if (queued.length > 0) await this.flush(agentId, queued);
	}

	/** No caller waits for a timer or full-buffer flush, so its failure is reported here. */
	private flushInBackground(agentId: string): void {
		this.flushNow(agentId).catch((error: unknown) =>
			console.warn(`agent ${agentId}: batch not recorded: ${error instanceof Error ? error.message : error}`)
		);
	}
}

function positiveInteger(env: Env, name: string, fallback: number): number {
	const raw = env[name];
	if (raw === undefined || raw === '') return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
	return value;
}
