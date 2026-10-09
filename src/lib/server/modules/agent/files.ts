import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { address, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from '@solana/kit';

/** Everything the server needs to run one registered agent, including its ML-DSA-44 secret key. */
export interface AgentFile {
	owner: Address;
	agentKey: Address;
	agent: Address;
	mldsaSecretKey: Uint8Array;
}

/** The agent file holds the only copy of the agent's secret key: refuse before anything could replace it. */
export function assertAgentFileAbsent(path: string): void {
	if (existsSync(path)) {
		throw new Error(`${path} already exists; it holds the only copy of an agent's ML-DSA-44 secret key`);
	}
}

export function saveAgentFile(path: string, file: AgentFile): void {
	assertAgentFileAbsent(path);
	mkdirSync(dirname(path), { recursive: true });
	const json = { ...file, mldsaSecretKey: Buffer.from(file.mldsaSecretKey).toString('base64') };
	writeFileSync(path, JSON.stringify(json, null, 2), { mode: 0o600, flag: 'wx' });
}

/**
 * Saves the agent file before `send` registers the agent, so a send that throws after the transaction landed cannot lose
 * the secret key. Removes the file only when the registration definitely failed on-chain.
 */
export async function sendWithAgentFileWriteAhead<TResult extends { err: unknown }>(
	path: string,
	file: AgentFile,
	send: () => Promise<TResult>
): Promise<TResult> {
	saveAgentFile(path, file);
	const result = await send();
	if (result.err !== null) unlinkSync(path);
	return result;
}

export function loadAgentFile(path: string): AgentFile {
	const json = JSON.parse(readFileSync(path, 'utf8'));
	return {
		owner: address(json.owner),
		agentKey: address(json.agentKey),
		agent: address(json.agent),
		mldsaSecretKey: new Uint8Array(Buffer.from(json.mldsaSecretKey, 'base64'))
	};
}

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function loadKeypairSigner(path: string): Promise<KeyPairSigner> {
	return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

/** Appends one JSON line; bigints (e.g. RPC error codes) are written as numbers. */
export function appendJsonLine(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? Number(item) : item)) + '\n');
}
