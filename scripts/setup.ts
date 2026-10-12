// First-time devnet setup: .env, the payer wallet, its SOL, the owner's ML-KEM-768 and ML-DSA-44 keys and the agents
// (registered and activated on chain, imported into the fleet, their logs sealed). Every step is skipped when already
// done, so it is safe to re-run, e.g. after funding the wallet by hand.
// Each run leaves a redacted log in .devnet/logs/ (scripts/run-log.ts).
// Usage (from the repo root, after bun install): bun scripts/setup.ts [--reregister]
// --reregister moves the agents' files aside and registers new, activated ones (stop the demo first).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createSolanaRpc, devnet, fetchEncodedAccount, lamports, type Address } from '@solana/kit';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { decodeAgent, loadAgentFile, loadKeypairSigner, saveAgentFile } from 'pq-agent-guard';
import { Fleet } from '../src/lib/server/modules/fleet/fleet';
import { FLEET_DIR, onchainIdentityPath } from '../src/lib/server/modules/fleet/runtime';
import { runLogged } from './run-log';
import { lamportsNeeded, predatesActivation, stepsFor, type AgentProgress, type AgentStep } from './setup-plan';

const ENV_FILE = '.env';
const ENV_EXAMPLE = '.env.example';
const AGENTS_DIR = '.devnet/agents';
const RETIRED_DIR = '.devnet/retired';
const REREGISTER_FLAG = '--reregister';
const AGENTS = [
	{ id: 'sentinel-01', name: 'Oberek Sentinel Alpha — Treasury Rebalancer', risk: 'MEDIUM' },
	{ id: 'tick-01', name: 'Oberek Tick One — on-chain heartbeat', risk: 'LOW' },
	{ id: 'jito-01', name: 'JitoSOL Steward', risk: 'MEDIUM' }
] as const;
const FAUCET_URL = 'https://faucet.solana.com';
const BALANCE_POLL_MS = 10_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

type SetupAgent = (typeof AGENTS)[number];
type Rpc = ReturnType<typeof createSolanaRpc<ReturnType<typeof devnet>>>;

await runLogged('setup');
if (createdEnvFile()) restart();
const config = loadConfig(process.env);
ensurePayer(config.feePayerPath);
const payer = (await loadKeypairSigner(config.feePayerPath)).address;
/** A plain RPC, without the server's rate-limit retries: a refused airdrop should go to the faucet hint at once. */
const rpc = createSolanaRpc(devnet(config.rpcUrl));

if (process.argv.includes(REREGISTER_FLAG)) retireAgents();
const progress = await Promise.all(AGENTS.map(progressOf));
const ownerKeyRegistered = existsSync(config.ownerMldsaPath);
await ensureFunded(rpc, payer, lamportsNeeded(progress, ownerKeyRegistered));
// Idempotent; must come before any import or seal.
runBun(['scripts/fleet.ts', 'owner-key']);
ensureOwnerKey();
for (const [index, agent] of AGENTS.entries()) setUpAgent(agent, progress[index]);
if (predatesActivation(progress, ownerKeyRegistered)) {
	log(`these agents predate the owner key, so it never activated them; to replace them: bun scripts/setup.ts ${REREGISTER_FLAG}`);
}
log('ready: bun scripts/demo.ts');
log(telegramHint());

/** The owner bot is optional: its token comes from @BotFather, so setup can only point the way. */
function telegramHint(): string {
	if (!process.env.TELEGRAM_BOT_TOKEN) {
		return `optional: the owner's Telegram bot needs TELEGRAM_BOT_TOKEN in ${ENV_FILE} (README: "The owner on Telegram")`;
	}
	if (!process.env.TELEGRAM_OWNER_CHAT_ID) {
		return `Telegram: run bun bot/telegram, send /start to the bot, put the chat id in ${ENV_FILE} as TELEGRAM_OWNER_CHAT_ID`;
	}
	return 'Telegram: configured; bun scripts/demo.ts starts the bot too';
}

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
	if (existsSync(path)) {
		log(`payer wallet ${path} exists`);
		return;
	}
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

/** Once per owner wallet, before any agent: every agent needs the owner's ML-DSA-44 activation. */
function ensureOwnerKey(): void {
	if (existsSync(config.ownerMldsaPath)) {
		log(`owner key ${config.ownerMldsaPath} exists`);
		return;
	}
	runBun(['scripts/agent.ts', 'register-owner']);
	log(`back up ${config.ownerMldsaPath}: a wallet registers its owner key once, so without it no new agent can be activated`);
}

/** The old accounts stay on chain and the server stops running them; their files are kept for the audit. */
function retireAgents(): void {
	const dir = join(RETIRED_DIR, `reregister-${new Date().toISOString().replace(/[:.]/g, '-')}`);
	for (const agent of AGENTS) {
		moveIfPresent(agentFile(agent), join(dir, 'agents', `${agent.id}.json`));
		moveIfPresent(join(FLEET_DIR, agent.id), join(dir, 'fleet', agent.id));
	}
	log(`old agents moved to ${dir}`);
}

function moveIfPresent(from: string, to: string): void {
	if (!existsSync(from)) return;
	mkdirSync(dirname(to), { recursive: true });
	renameSync(from, to);
}

function setUpAgent(agent: SetupAgent, progress: AgentProgress): void {
	// The page name lives only in the fleet entry. A re-run brings it in line with this script; keys and the account stay.
	if (progress.imported) alignName(agent);
	const steps = stepsFor(progress);
	if (steps.length === 0) {
		log(`${agent.id} is in the fleet`);
		return;
	}
	for (const step of steps) runStep(agent, step);
}

function alignName(agent: SetupAgent): void {
	const fleet = new Fleet(FLEET_DIR);
	const entry = fleet.get(agent.id);
	if (!entry || entry.name === agent.name) return;
	fleet.rename(agent.id, agent.name);
	log(`${agent.id} renamed to ${agent.name}`);
}

function runStep(agent: SetupAgent, step: AgentStep): void {
	if (step === 'import') {
		runBun(['scripts/fleet.ts', 'import', agentFile(agent), '--as', agent.id, '--name', agent.name, '--risk', agent.risk]);
	} else if (step === 'seal') runBun(['scripts/fleet.ts', 'seal', agent.id]);
	else if (step === 'identify') restoreIdentity(agent);
	else runBun(['scripts/agent.ts', step], { AGENT_FILE: agentFile(agent) });
}

/** Copies the agent file into the fleet entry. Never overwrites a key file that is already there. */
function restoreIdentity(agent: SetupAgent): void {
	const destination = onchainIdentityPath(agent.id);
	if (existsSync(destination)) {
		log(`${agent.id} already has its on-chain identity`);
		return;
	}
	const source = agentFile(agent);
	if (!existsSync(source)) {
		log(
			`${agent.id} is in the fleet but ${destination} is missing and ${source} is too, so its key cannot be restored`
		);
		process.exit(1);
	}
	saveAgentFile(destination, loadAgentFile(source));
	log(`${agent.id}: on-chain identity restored from ${source}`);
}

async function progressOf(agent: SetupAgent): Promise<AgentProgress> {
	const registered = existsSync(agentFile(agent));
	const imported = existsSync(join(FLEET_DIR, agent.id));
	return {
		registered,
		pending: registered && (await isPending(agentFile(agent))),
		imported,
		sealed: imported && new Fleet(FLEET_DIR).isSealed(agent.id),
		identified: imported && existsSync(onchainIdentityPath(agent.id))
	};
}

/** A registration whose outcome is unknown (no account yet) is not pending: `agent.ts status` reports it. */
async function isPending(path: string): Promise<boolean> {
	const account = await fetchEncodedAccount(rpc, loadAgentFile(path).agent);
	return account.exists && decodeAgent(new Uint8Array(account.data)).status === 'Pending';
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
