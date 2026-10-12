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
	/** The owner's ML-KEM-768 key pair: its public key seals new agents' logs, its secret key opens them in the audit. */
	ownerKemPath: string;
	/** The owner's ML-DSA-44 key file; register-owner writes it, register and activate read it. */
	ownerMldsaPath: string;
}

type Env = Record<string, string | undefined>;

const DEFAULTS = {
	rpcUrl: 'https://api.devnet.solana.com',
	rpcSubscriptionsUrl: 'wss://api.devnet.solana.com',
	tickMs: 30_000,
	agentFilePath: '.devnet/agent.json',
	decisionLogPath: '.devnet/decisions.jsonl',
	ownerKemPath: '.devnet/owner-mlkem.json',
	ownerMldsaPath: '.devnet/owner-mldsa.json'
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
		ownerPath: env.OWNER_KEYPAIR,
		ownerKemPath: env.OWNER_MLKEM_FILE ?? DEFAULTS.ownerKemPath,
		ownerMldsaPath: env.OWNER_MLDSA_FILE ?? DEFAULTS.ownerMldsaPath
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
