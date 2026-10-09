// Owner and agent CLI for onchain_agent_guard. Run from the repo root; Bun reads .env (see .env.example).
// Usage: bun scripts/agent.ts <register|run|kill|resume|status>
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getBase16Decoder } from '@solana/kit';
import { runLoop } from '../src/lib/server/modules/agent/agent-loop';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { createCyclePorts } from '../src/lib/server/modules/agent/cycle-ports';
import {
	appendJsonLine,
	assertAgentFileAbsent,
	loadAgentFile,
	loadKeypairSigner,
	saveAgentFile
} from '../src/lib/server/modules/agent/files';
import {
	fetchAgent,
	killAgent,
	registerAgent,
	resumeAgent,
	type GuardClient
} from '../src/lib/server/modules/agent/guard-client';
import { resumeMessage, signGuardMessage } from '../src/lib/server/modules/agent/message';
import { connect } from '../src/lib/server/modules/agent/transaction';
import { reportSend } from './report';

const USAGE = 'Usage: bun scripts/agent.ts <register|run|kill|resume|status>';

const config = loadConfig();
const client: GuardClient = {
	connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl),
	programAddress: config.programAddress
};

function loadOwner() {
	if (!config.ownerPath) throw new Error('OWNER_KEYPAIR is not set (see .env.example)');
	return loadKeypairSigner(config.ownerPath);
}

const commands: Record<string, () => Promise<boolean>> = {
	async register() {
		assertAgentFileAbsent(config.agentFilePath);
		const owner = await loadOwner();
		const keys = ml_dsa44.keygen();
		const { agent, agentKey, result } = await registerAgent(client, owner, keys.publicKey);
		if (!reportSend('register', result)) return false;
		saveAgentFile(config.agentFilePath, { owner: owner.address, agentKey, agent, mldsaSecretKey: keys.secretKey });
		console.log(`agent ${agent} saved to ${config.agentFilePath}`);
		return true;
	},

	async run() {
		const feePayer = await loadKeypairSigner(config.feePayerPath);
		const agentFile = loadAgentFile(config.agentFilePath);
		const controller = new AbortController();
		process.on('SIGINT', () => controller.abort());
		const ports = createCyclePorts({
			client,
			feePayer,
			agentFile,
			appendLog: async (entry) => appendJsonLine(config.decisionLogPath, entry)
		});
		console.log(`agent ${agentFile.agent}: one step every ${config.tickMs} ms, Ctrl+C to stop`);
		await runLoop(ports, config.tickMs, controller.signal);
		return true;
	},

	async kill() {
		const owner = await loadOwner();
		const { agent } = loadAgentFile(config.agentFilePath);
		return reportSend('kill', await killAgent(client, owner, agent));
	},

	async resume() {
		const owner = await loadOwner();
		const agentFile = loadAgentFile(config.agentFilePath);
		const state = await fetchAgent(client, agentFile.agent);
		const signature = signGuardMessage(resumeMessage(agentFile.agent, state.counter + 1n), agentFile.mldsaSecretKey);
		const result = await resumeAgent(client, { owner, agent: agentFile.agent, agentKey: agentFile.agentKey, signature });
		return reportSend('resume', result);
	},

	async status() {
		const { agent } = loadAgentFile(config.agentFilePath);
		const state = await fetchAgent(client, agent);
		console.log({ agent, ...state, lastDecision: getBase16Decoder().decode(state.lastDecision) });
		return true;
	}
};

const command = commands[process.argv[2] ?? ''];
if (!command) {
	console.error(USAGE);
	process.exit(2);
}
process.exitCode = (await command()) ? 0 : 1;
