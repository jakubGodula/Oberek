// Three guarded steps of one agent on devnet. Run from the repo root (Bun reads .env):
//   AGENT_FILE=.devnet/my-agent.json FEE_PAYER_KEYPAIR=.devnet/agent-payer.json bun kit/example.ts
// The agent comes from `bun scripts/agent.ts register`; FEE_PAYER_KEYPAIR pays the steps (use a wallet that is not the
// owner's, so the agent cannot resume itself after a kill).
import { GuardError, openGuardedAgent } from 'pq-agent-guard';

const STEPS = 3;

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set (see kit/README.md)`);
	return value;
}

const agent = await openGuardedAgent({
	agentFile: requiredEnv('AGENT_FILE'),
	payer: requiredEnv('FEE_PAYER_KEYPAIR'),
	rpcUrl: process.env.SOLANA_RPC_URL,
	wsUrl: process.env.SOLANA_WS_URL,
	programId: process.env.GUARD_PROGRAM_ID
});

try {
	for (let index = 1; index <= STEPS; index++) {
		const decision = JSON.stringify({ action: 'greet', index, at: new Date().toISOString() });
		const step = await agent.step(decision, () => `hello ${index}`);
		console.log(`step ${step.counter} recorded (${step.decisionHash.slice(0, 12)}…), action returned "${step.result}"`);
	}
} catch (error) {
	if (!(error instanceof GuardError)) throw error;
	console.log(`refused by the guard: ${error.code}, no action ran (${error.message})`);
}

const { status, counter } = await agent.status();
console.log(`agent is ${status} at counter ${counter}`);
// The RPC subscription client keeps the event loop alive.
process.exit(0);
