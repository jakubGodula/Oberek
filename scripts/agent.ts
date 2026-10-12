// Owner and agent CLI for onchain_agent_guard. Run from the repo root; Bun reads .env (see .env.example).
// Usage: bun scripts/agent.ts <register-owner|register|activate|run|kill|resume|status>
import { existsSync } from 'node:fs';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { generateKeyPairSigner, getBase16Decoder, type Address, type TransactionSigner } from '@solana/kit';
import { runLoop } from '../src/lib/server/modules/agent/agent-loop';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { createCyclePorts } from '../src/lib/server/modules/agent/cycle-ports';
import {
	appendJsonLine,
	assertAgentFileAbsent,
	assertOwnerKeyFileAbsent,
	loadAgentFile,
	loadKeypairSigner,
	loadOwnerKeyFile,
	sendWithAgentFileWriteAhead,
	sendWithOwnerKeyFileWriteAhead,
	type OwnerKeyFile
} from '../src/lib/server/modules/agent/files';
import {
	activateAgent,
	fetchAgent,
	killAgent,
	registerAgent,
	registerOwner,
	resumeAgent,
	type GuardClient
} from '../src/lib/server/modules/agent/guard-client';
import { findAgentAddress, findOwnerRecordAddress } from '../src/lib/server/modules/agent/instructions';
import { activateMessage, signGuardMessage } from '../src/lib/server/modules/agent/message';
import { signResume } from '../src/lib/server/modules/agent/resume';
import { connect } from '../src/lib/server/modules/agent/transaction';
import { reportSend } from './report';

const USAGE = 'Usage: bun scripts/agent.ts <register-owner|register|activate|run|kill|resume|status>';

const config = loadConfig();
const client: GuardClient = {
	connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl),
	programAddress: config.programAddress
};

function loadOwner() {
	if (!config.ownerPath) throw new Error('OWNER_KEYPAIR is not set (see .env.example)');
	return loadKeypairSigner(config.ownerPath);
}

/** The owner key file must exist and belong to OWNER_KEYPAIR: checked before anything is sent. */
function loadOwnerKeyFileOf(owner: Address): OwnerKeyFile {
	const path = config.ownerMldsaPath;
	if (!existsSync(path)) throw new Error(`${path} not found; run bun scripts/agent.ts register-owner first`);
	const file = loadOwnerKeyFile(path);
	if (file.owner !== owner) throw new Error(`${path} belongs to ${file.owner}, not to OWNER_KEYPAIR ${owner}`);
	return file;
}

async function sendActivation(owner: TransactionSigner, agent: Address, ownerKeyFile: OwnerKeyFile): Promise<boolean> {
	const signature = signGuardMessage(activateMessage(agent), ownerKeyFile.mldsaSecretKey);
	const ownerRecord = await findOwnerRecordAddress(config.programAddress, owner.address);
	const activation = { feePayer: owner, agent, ownerRecord, ownerKey: ownerKeyFile.ownerKey, signature };
	return reportSend('activate', await activateAgent(client, activation));
}

const commands: Record<string, () => Promise<boolean>> = {
	async 'register-owner'() {
		assertOwnerKeyFileAbsent(config.ownerMldsaPath);
		const owner = await loadOwner();
		const keys = ml_dsa44.keygen();
		const ownerKey = await generateKeyPairSigner();
		const ownerRecord = await findOwnerRecordAddress(config.programAddress, owner.address);
		const file = { owner: owner.address, ownerKey: ownerKey.address, mldsaSecretKey: keys.secretKey };
		const register = () => registerOwner(client, { owner, ownerKey, ownerRecord, publicKey: keys.publicKey });
		const result = await sendWithOwnerKeyFileWriteAhead(config.ownerMldsaPath, file, register).catch((error) => {
			console.error(`owner key registration outcome unknown: ${config.ownerMldsaPath} kept; check ${ownerRecord} on the explorer`);
			throw error;
		});
		if (!reportSend('register-owner', result)) return false;
		console.log(`owner key ${ownerKey.address} (record ${ownerRecord}) saved to ${config.ownerMldsaPath}`);
		return true;
	},

	async register() {
		assertAgentFileAbsent(config.agentFilePath);
		const owner = await loadOwner();
		const ownerKeyFile = loadOwnerKeyFileOf(owner.address);
		const keys = ml_dsa44.keygen();
		const agentKey = await generateKeyPairSigner();
		const agent = await findAgentAddress(config.programAddress, owner.address, agentKey.address);
		const agentFile = { owner: owner.address, agentKey: agentKey.address, agent, mldsaSecretKey: keys.secretKey };
		const register = () => registerAgent(client, { owner, agentKey, agent, publicKey: keys.publicKey });
		const result = await sendWithAgentFileWriteAhead(config.agentFilePath, agentFile, register).catch((error) => {
			console.error(`registration outcome unknown: ${config.agentFilePath} kept; check with bun scripts/agent.ts status`);
			throw error;
		});
		if (!reportSend('register', result)) return false;
		console.log(`agent ${agent} saved to ${config.agentFilePath}`);
		const activated = await sendActivation(owner, agent, ownerKeyFile).catch((error) => {
			console.error(error);
			return false;
		});
		if (activated) return true;
		console.error(`agent registered but not active; retry: AGENT_FILE=${config.agentFilePath} bun scripts/agent.ts activate`);
		return false;
	},

	async activate() {
		const owner = await loadOwner();
		const { agent } = loadAgentFile(config.agentFilePath);
		return sendActivation(owner, agent, loadOwnerKeyFileOf(owner.address));
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
		const signature = signResume(agentFile.agent, state, agentFile.mldsaSecretKey);
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
