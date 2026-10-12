import { describe, expect, it } from 'bun:test';
import { getAddressDecoder } from '@solana/kit';
import { runCycle, runLoop, type CyclePorts, type DecisionLogEntry, type SentTransaction } from './agent-loop';
import { hashDecision, tickDecision } from './decision';
import { stepMessage, type AgentState, type AgentStatus } from 'pq-agent-guard';

const AGENT = getAddressDecoder().decode(new Uint8Array(32).fill(7));
const NOW = new Date('2026-10-10T12:00:00.000Z');
const FAKE_SIGNATURE = Uint8Array.of(1, 2, 3);
const LANDED: SentTransaction = { signature: 'tx-signature', err: null };

function agentState(status: AgentStatus, counter: bigint): AgentState {
	return { owner: AGENT, agentKey: AGENT, status, counter, lastDecision: new Uint8Array(32), bump: 255 };
}

function fakePorts(overrides: Partial<CyclePorts> = {}) {
	const calls = {
		signed: [] as Uint8Array[],
		steps: [] as { decisionHash: Uint8Array; signature: Uint8Array }[],
		logEntries: [] as DecisionLogEntry[],
		lines: [] as string[]
	};
	const ports: CyclePorts = {
		agent: AGENT,
		readAgent: async () => agentState('Active', 4n),
		sign: (message) => {
			calls.signed.push(message);
			return FAKE_SIGNATURE;
		},
		sendStep: async (decisionHash, signature) => {
			calls.steps.push({ decisionHash, signature });
			return LANDED;
		},
		appendLog: async (entry) => {
			calls.logEntries.push(entry);
		},
		now: () => NOW,
		log: (line) => {
			calls.lines.push(line);
		},
		...overrides
	};
	return { ports, calls };
}

describe('runCycle', () => {
	it('sends nothing while the agent is killed', async () => {
		const { ports, calls } = fakePorts({ readAgent: async () => agentState('Killed', 4n) });
		expect(await runCycle(ports)).toBe('paused');
		expect(calls.signed).toHaveLength(0);
		expect(calls.steps).toHaveLength(0);
	});

	it('sends nothing while the agent awaits the owner activation, and says how to activate', async () => {
		const { ports, calls } = fakePorts({ readAgent: async () => agentState('Pending', 0n) });
		expect(await runCycle(ports)).toBe('paused');
		expect(calls.signed).toHaveLength(0);
		expect(calls.steps).toHaveLength(0);
		expect(calls.lines.join('\n')).toContain('bun scripts/agent.ts activate');
	});

	it('signs and sends the tick decision for the next counter', async () => {
		const { ports, calls } = fakePorts();
		const expectedHash = hashDecision(tickDecision(AGENT, 5n, NOW));

		expect(await runCycle(ports)).toBe('recorded');
		expect(calls.signed).toEqual([stepMessage(AGENT, 5n, expectedHash)]);
		expect(calls.steps).toEqual([{ decisionHash: expectedHash, signature: FAKE_SIGNATURE }]);
		expect(calls.logEntries[0]?.record.counter).toBe(5);
		expect(calls.logEntries[0]?.transaction).toBe('tx-signature');
	});

	it('logs a step the program rejected and reports failure', async () => {
		const rejected: SentTransaction = { signature: 'tx-rejected', err: { InstructionError: [0, { Custom: 6006 }] } };
		const { ports, calls } = fakePorts({ sendStep: async () => rejected });
		expect(await runCycle(ports)).toBe('failed');
		expect(calls.logEntries[0]?.err).toEqual(rejected.err);
		expect(calls.lines.at(-1)).toContain('VerifyFailed');
	});

	it('survives an unreachable RPC', async () => {
		const { ports, calls } = fakePorts({
			readAgent: async () => {
				throw new Error('fetch failed');
			}
		});
		expect(await runCycle(ports)).toBe('failed');
		expect(calls.lines.at(-1)).toContain('fetch failed');
	});

	it('logs the record of a send that throws, since the step may still land', async () => {
		const { ports, calls } = fakePorts({
			sendStep: async () => {
				throw new Error('blockhash not found');
			}
		});
		expect(await runCycle(ports)).toBe('failed');
		expect(calls.logEntries).toHaveLength(1);
		expect(calls.logEntries[0]?.record.counter).toBe(5);
		expect(calls.logEntries[0]?.transaction).toBeNull();
		expect(calls.logEntries[0]?.err).toBe('blockhash not found');
	});

	it('survives a send that throws', async () => {
		const { ports } = fakePorts({
			sendStep: async () => {
				throw new Error('blockhash not found');
			}
		});
		expect(await runCycle(ports)).toBe('failed');
	});
});

describe('runLoop', () => {
	it('keeps cycling through failures until aborted', async () => {
		const controller = new AbortController();
		let reads = 0;
		const { ports } = fakePorts({
			readAgent: async () => {
				reads += 1;
				if (reads === 3) controller.abort();
				throw new Error('fetch failed');
			}
		});
		await runLoop(ports, 0, controller.signal);
		expect(reads).toBe(3);
	});
});
