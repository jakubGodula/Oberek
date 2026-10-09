import { address, type Address } from '@solana/kit';

export interface AgentConfig {
	programAddress: Address;
	rpcUrl: string;
	rpcSubscriptionsUrl: string;
	tickMs: number;
	agentFilePath: string;
	decisionLogPath: string;
	feePayerPath: string;
	/** Only the owner commands (register, kill, resume) need it. */
	ownerPath: string | undefined;
}

type Env = Record<string, string | undefined>;

const DEFAULTS = {
	rpcUrl: 'https://api.devnet.solana.com',
	rpcSubscriptionsUrl: 'wss://api.devnet.solana.com',
	tickMs: 30_000,
	agentFilePath: '.devnet/agent.json',
	decisionLogPath: '.devnet/decisions.jsonl'
};

export function loadConfig(env: Env = process.env): AgentConfig {
	return {
		programAddress: address(required(env, 'GUARD_PROGRAM_ID')),
		rpcUrl: env.SOLANA_RPC_URL ?? DEFAULTS.rpcUrl,
		rpcSubscriptionsUrl: env.SOLANA_WS_URL ?? DEFAULTS.rpcSubscriptionsUrl,
		tickMs: positiveInteger(env, 'AGENT_TICK_MS', DEFAULTS.tickMs),
		agentFilePath: env.AGENT_FILE ?? DEFAULTS.agentFilePath,
		decisionLogPath: env.AGENT_DECISION_LOG ?? DEFAULTS.decisionLogPath,
		feePayerPath: required(env, 'FEE_PAYER_KEYPAIR'),
		ownerPath: env.OWNER_KEYPAIR
	};
}

function required(env: Env, name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set (see .env.example)`);
	return value;
}

function positiveInteger(env: Env, name: string, fallback: number): number {
	const raw = env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
	return value;
}
