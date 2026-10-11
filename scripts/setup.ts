// First-time devnet setup: .env, the payer wallet, its SOL, the owner's ML-KEM key and the two agents (registered on
// chain, imported into the fleet, their logs sealed). Every step is skipped when already done, so it is safe to re-run, e.g. after funding the wallet by hand.
// Usage (from the repo root, after bun install): bun scripts/setup.ts
import { spawnSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createSolanaRpc, devnet, lamports, type Address } from '@solana/kit';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { loadKeypairSigner } from '../src/lib/server/modules/agent/files';
import { Fleet } from '../src/lib/server/modules/fleet/fleet';
import { FLEET_DIR } from '../src/lib/server/modules/fleet/runtime';
import { lamportsNeeded, stepsFor, type AgentProgress, type AgentStep } from './setup-plan';

const ENV_FILE = '.env';
const ENV_EXAMPLE = '.env.example';
const AGENTS_DIR = '.devnet/agents';
const AGENTS = [
	{ id: 'sentinel-01', name: 'Aegis Sentinel Alpha — Treasury Rebalancer', risk: 'MEDIUM' },
	{ id: 'tick-01', name: 'Tick One', risk: 'LOW' }
] as const;
const FAUCET_URL = 'https://faucet.solana.com';
const BALANCE_POLL_MS = 10_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

type SetupAgent = (typeof AGENTS)[number];
type Rpc = ReturnType<typeof createSolanaRpc<ReturnType<typeof devnet>>>;

if (createdEnvFile()) restart();
const config = loadConfig(process.env);
ensurePayer(config.feePayerPath);
const payer = (await loadKeypairSigner(config.feePayerPath)).address;
/** A plain RPC, without the server's rate-limit retries: a refused airdrop should go to the faucet hint at once. */
const rpc = createSolanaRpc(devnet(config.rpcUrl));

await ensureFunded(rpc, payer, lamportsNeeded(AGENTS.map(progressOf)));
// Idempotent; must come before any import or seal.
runBun(['scripts/fleet.ts', 'owner-key']);
for (const agent of AGENTS) setUpAgent(agent);
log('ready: bun scripts/demo.ts');

function createdEnvFile(): boolean {
	if (existsSync(ENV_FILE)) {
		log(`${ENV_FILE} exists`);
		return false;
	}
	copyFileSync(ENV_EXAMPLE, ENV_FILE);
	log(`${ENV_FILE} created from ${ENV_EXAMPLE}`);
	return true;
}

/** Bun reads .env only at start, so a run that has just created it starts over to pick it up. */
function restart(): never {
	process.exit(spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit' }).status ?? 1);
}

function ensurePayer(path: string): void {
	if (existsSync(path)) return log(`payer wallet ${path} exists`);
	runBun(['scripts/new-keypair.ts', path]);
}

async function ensureFunded(rpc: Rpc, payer: Address, needed: bigint): Promise<void> {
	let balance = await balanceOf(rpc, payer);
	if (balance >= needed) return log(`payer ${payer} has ${sol(balance)} SOL, enough`);
	await requestAirdrop(rpc, payer, needed - balance);
	log(`payer ${payer} has ${sol(balance)} SOL, needs ${sol(needed)}`);
	log(`waiting for funds; send devnet SOL to ${payer}, e.g. from ${FAUCET_URL} (Ctrl+C and re-run later is fine)`);
	while (balance < needed) {
		await Bun.sleep(BALANCE_POLL_MS);
		balance = await balanceOf(rpc, payer);
		log(`balance ${sol(balance)} / ${sol(needed)} SOL`);
	}
}

/** Devnet's airdrop is often rate-limited; a refusal only means funding by hand. */
async function requestAirdrop(rpc: Rpc, payer: Address, amount: bigint): Promise<void> {
	try {
		await rpc.requestAirdrop(payer, lamports(amount)).send();
		log(`airdrop of ${sol(amount)} SOL requested`);
	} catch (error) {
		log(`airdrop refused (${error instanceof Error ? error.message : error})`);
	}
}

async function balanceOf(rpc: Rpc, account: Address): Promise<bigint> {
	return (await rpc.getBalance(account).send()).value;
}

function setUpAgent(agent: SetupAgent): void {
	const steps = stepsFor(progressOf(agent));
	if (steps.length === 0) return log(`${agent.id} is in the fleet`);
	for (const step of steps) runStep(agent, step);
}

function runStep(agent: SetupAgent, step: AgentStep): void {
	if (step === 'register') runBun(['scripts/agent.ts', 'register'], { AGENT_FILE: agentFile(agent) });
	else if (step === 'seal') runBun(['scripts/fleet.ts', 'seal', agent.id]);
	else runBun(['scripts/fleet.ts', 'import', agentFile(agent), '--as', agent.id, '--name', agent.name, '--risk', agent.risk]);
}

function progressOf(agent: SetupAgent): AgentProgress {
	const imported = existsSync(join(FLEET_DIR, agent.id));
	return { registered: existsSync(agentFile(agent)), imported, sealed: imported && new Fleet(FLEET_DIR).isSealed(agent.id) };
}

function agentFile(agent: SetupAgent): string {
	return join(AGENTS_DIR, `${agent.id}.json`);
}

/** Runs one of the repo's scripts; setup stops at the first one that fails. */
function runBun(args: string[], extraEnv: Record<string, string> = {}): void {
	log(`bun ${args.join(' ')}`);
	const { status } = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...extraEnv } });
	if (status !== 0) {
		log('setup stopped; fix the error above and re-run');
		process.exit(1);
	}
}

function sol(amount: bigint): string {
	return (Number(amount) / LAMPORTS_PER_SOL).toFixed(2);
}

function log(message: string): void {
	console.log(`[setup] ${message}`);
}
