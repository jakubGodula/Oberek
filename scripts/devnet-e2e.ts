// End-to-end check of onchain_agent_guard on devnet with a fresh agent: register → 3 steps → kill (steps rejected)
// → resume → step. Needs the program deployed (onchain/deploy-devnet.sh) and .env set; the fee payer is also the
// owner. Costs ~0.15 SOL (key account rent). Usage: bun scripts/devnet-e2e.ts
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getBase16Decoder } from '@solana/kit';
import { runCycle, type DecisionLogEntry } from '../src/lib/server/modules/agent/agent-loop';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { createCyclePorts } from '../src/lib/server/modules/agent/cycle-ports';
import { loadKeypairSigner, type AgentFile } from '../src/lib/server/modules/agent/files';
import { customErrorCode, GUARD_ERROR_CODES } from '../src/lib/server/modules/agent/guard-errors';
import {
	fetchAgent,
	killAgent,
	recordStep,
	registerAgent,
	resumeAgent,
	type GuardClient
} from '../src/lib/server/modules/agent/guard-client';
import { signGuardMessage, stepMessage } from '../src/lib/server/modules/agent/message';
import { signResume } from '../src/lib/server/modules/agent/resume';
import { connect } from '../src/lib/server/modules/agent/transaction';
import { reportSend } from './report';

const STEPS_BEFORE_KILL = 3;
const failures: string[] = [];

function check(label: string, passed: boolean, detail = ''): void {
	console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
	if (!passed) failures.push(label);
}

const config = loadConfig();
const client: GuardClient = {
	connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl),
	programAddress: config.programAddress
};
const payer = await loadKeypairSigner(config.feePayerPath);
const keys = ml_dsa44.keygen();

const registered = await registerAgent(client, payer, keys.publicKey);
if (!reportSend('register', registered.result)) {
	console.log('FAIL: register');
	process.exit(1);
}
const agentFile: AgentFile = {
	owner: payer.address,
	agentKey: registered.agentKey,
	agent: registered.agent,
	mldsaSecretKey: keys.secretKey
};
const { agent, agentKey } = agentFile;
const readAgent = () => fetchAgent(client, agent);
const logEntries: DecisionLogEntry[] = [];
const ports = {
	...createCyclePorts({ client, feePayer: payer, agentFile, appendLog: async (entry) => void logEntries.push(entry) }),
	// Same transaction as the cycle's own sendStep, reported with CU and size.
	sendStep: async (decisionHash: Uint8Array, signature: Uint8Array) => {
		const result = await recordStep(client, { feePayer: payer, agent, agentKey, decisionHash, signature });
		reportSend('record_step', result);
		return result;
	}
};
console.log(`agent ${agent}`);

let state = await readAgent();
check('registered agent is Active with counter 0', state.status === 'Active' && state.counter === 0n);

for (let step = 1; step <= STEPS_BEFORE_KILL; step++) {
	check(`cycle ${step} recorded`, (await runCycle(ports)) === 'recorded');
}
state = await readAgent();
check('counter is 3', state.counter === 3n, `counter ${state.counter}`);
check(
	'last_decision is the hash of the third record',
	getBase16Decoder().decode(state.lastDecision) === logEntries.at(-1)?.decisionHash
);

check('kill', reportSend('kill', await killAgent(client, payer, agent)));
state = await readAgent();
check('agent is Killed', state.status === 'Killed');
check('cycle sends nothing while killed', (await runCycle(ports)) === 'paused');
const decisionHash = new Uint8Array(32);
const forced = await recordStep(client, {
	feePayer: payer,
	agent,
	agentKey,
	decisionHash,
	signature: signGuardMessage(stepMessage(agent, state.counter + 1n, decisionHash), keys.secretKey)
});
reportSend('record_step while killed', forced);
check('step while killed fails with AgentKilled', customErrorCode(forced.err) === GUARD_ERROR_CODES.AgentKilled);

const resumeSignature = signResume(agent, state, keys.secretKey);
check('resume', reportSend('resume', await resumeAgent(client, { owner: payer, agent, agentKey, signature: resumeSignature })));
state = await readAgent();
check('resumed agent is Active with counter 4', state.status === 'Active' && state.counter === 4n, `counter ${state.counter}`);

check('cycle after resume recorded', (await runCycle(ports)) === 'recorded');
state = await readAgent();
check('counter is 5', state.counter === 5n, `counter ${state.counter}`);

console.log(failures.length === 0 ? 'PASS' : `FAIL: ${failures.join('; ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
