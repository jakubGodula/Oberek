// Runs before the e2e tests (bun run e2e): stops the run, with what to do, when something outside the code under test
// would make it fail. Bun loads .env, so the keypair paths are the ones the server will use.
import { existsSync } from 'node:fs';
import { createSolanaRpc, devnet } from '@solana/kit';
import { loadKeypairSigner } from 'pq-agent-guard';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';
import { E2E_PROFILE } from '../scripts/setup-plan';
import { preflightProblems, type KeypairFact } from './preflight-checks';

process.env.FLEET_DIR = E2E_PROFILE.fleetDir;

function fail(problems: string[]): never {
	console.error(`e2e preflight:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
	process.exit(1);
}

function keypairFact(variable: string, path: string | undefined): KeypairFact {
	return { variable, path, exists: path !== undefined && existsSync(path) };
}

async function payerLamports(rpcUrl: string, payer: KeypairFact): Promise<bigint | null> {
	if (!payer.exists || !payer.path) return null;
	const { address } = await loadKeypairSigner(payer.path);
	return (await createSolanaRpc(devnet(rpcUrl)).getBalance(address).send()).value;
}

function loadConfigOrFail(): ReturnType<typeof loadConfig> {
	try {
		return loadConfig(process.env);
	} catch (error) {
		fail([error instanceof Error ? error.message : String(error)]);
	}
}

const config = loadConfigOrFail();
const payer = keypairFact('FEE_PAYER_KEYPAIR', config.feePayerPath);
const problems = preflightProblems({
	keypairs: [payer, keypairFact('OWNER_KEYPAIR', config.ownerPath)],
	missingAgents: E2E_PROFILE.agents.map((agent) => agent.id).filter((id) => !existsSync(onchainIdentityPath(id))),
	payerLamports: await payerLamports(config.rpcUrl, payer)
});
if (problems.length > 0) fail(problems);
console.log('e2e preflight: ok');
