// Three guarded steps of one agent on devnet. Run from the repo root (Bun reads .env):
//   AGENT_FILE=.devnet/my-agent.json FEE_PAYER_KEYPAIR=.devnet/agent-payer.json bun kit/example.ts
// The agent comes from `bun scripts/agent.ts register`; FEE_PAYER_KEYPAIR pays the steps (use a wallet that is not the
// owner's, so the agent cannot resume itself after a kill).
import { GuardError, openGuardedAgent, type GuardedAgent } from 'pq-agent-guard';

const STEPS = 3;
/** Enough of the hex SHA-256 to tell steps apart in the output. */
const HASH_PREVIEW_CHARS = 12;

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set (see kit/README.md)`);
	return value;
}

function openAgentFromEnv(): Promise<GuardedAgent> {
	return openGuardedAgent({
		agentFile: requiredEnv('AGENT_FILE'),
		payer: requiredEnv('FEE_PAYER_KEYPAIR'),
		rpcUrl: process.env.SOLANA_RPC_URL,
		wsUrl: process.env.SOLANA_WS_URL,
		programId: process.env.GUARD_PROGRAM_ID
	});
}

/** The decision goes on chain first; the action (here a greeting) runs only after it landed. */
async function greet(agent: GuardedAgent, index: number): Promise<void> {
	const decision = JSON.stringify({ action: 'greet', index, at: new Date().toISOString() });
	const step = await agent.step(decision, () => `hello ${index}`);
	const hashPreview = step.decisionHash.slice(0, HASH_PREVIEW_CHARS);
	console.log(`step ${step.counter} recorded (${hashPreview}…), action returned "${step.result}"`);
}

async function printStatus(agent: GuardedAgent): Promise<void> {
	const { status, counter } = await agent.status();
	console.log(`agent is ${status} at counter ${counter}`);
}

const agent = await openAgentFromEnv();
try {
	await printStatus(agent);
	for (let index = 1; index <= STEPS; index++) await greet(agent, index);
	await printStatus(agent);
} catch (error) {
	if (!(error instanceof GuardError)) throw error;
	console.log(`refused by the guard: ${error.code} (${error.message}); a refused step runs no action`);
	process.exitCode = 1;
}
// The RPC subscription client keeps the event loop alive.
process.exit();
