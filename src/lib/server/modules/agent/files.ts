import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { address, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from '@solana/kit';

/** Everything the server needs to run one registered agent, including its ML-DSA-44 secret key. */
export interface AgentFile {
	owner: Address;
	agentKey: Address;
	agent: Address;
	mldsaSecretKey: Uint8Array;
}

/** The owner's ML-DSA-44 key that activates every agent of `owner`. */
export interface OwnerKeyFile {
	owner: Address;
	ownerKey: Address;
	mldsaSecretKey: Uint8Array;
}

const AGENT_KEY_HOLDER = "an agent's";
const OWNER_KEY_HOLDER = "the owner's";

/** The agent file holds the only copy of the agent's secret key: refuse before anything could replace it. */
export function assertAgentFileAbsent(path: string): void {
	assertKeyFileAbsent(path, AGENT_KEY_HOLDER);
}

export function saveAgentFile(path: string, file: AgentFile): void {
	assertAgentFileAbsent(path);
	writeKeyFile(path, file);
}

/**
 * Saves the agent file before `send` registers the agent, so a send that throws after the transaction landed cannot lose
 * the secret key. Removes the file only when the registration definitely failed on-chain.
 */
export function sendWithAgentFileWriteAhead<TResult extends { err: unknown }>(
	path: string,
	file: AgentFile,
	send: () => Promise<TResult>
): Promise<TResult> {
	return sendWithWriteAhead(path, () => saveAgentFile(path, file), send);
}

export function loadAgentFile(path: string): AgentFile {
	const { fields, mldsaSecretKey } = readKeyFile(path);
	return {
		owner: address(fields.owner),
		agentKey: address(fields.agentKey),
		agent: address(fields.agent),
		mldsaSecretKey
	};
}

/** The owner key file holds the only copy of the owner's ML-DSA-44 secret key, like the agent file. */
export function assertOwnerKeyFileAbsent(path: string): void {
	assertKeyFileAbsent(path, OWNER_KEY_HOLDER);
}

export function saveOwnerKeyFile(path: string, file: OwnerKeyFile): void {
	assertOwnerKeyFileAbsent(path);
	writeKeyFile(path, file);
}

/** Saves the owner key file before `send` registers the key; same rules as sendWithAgentFileWriteAhead. */
export function sendWithOwnerKeyFileWriteAhead<TResult extends { err: unknown }>(
	path: string,
	file: OwnerKeyFile,
	send: () => Promise<TResult>
): Promise<TResult> {
	return sendWithWriteAhead(path, () => saveOwnerKeyFile(path, file), send);
}

export function loadOwnerKeyFile(path: string): OwnerKeyFile {
	const { fields, mldsaSecretKey } = readKeyFile(path);
	return { owner: address(fields.owner), ownerKey: address(fields.ownerKey), mldsaSecretKey };
}

function assertKeyFileAbsent(path: string, holder: string): void {
	if (existsSync(path)) {
		throw new Error(`${path} already exists; it holds the only copy of ${holder} ML-DSA-44 secret key`);
	}
}

function writeKeyFile(path: string, file: { mldsaSecretKey: Uint8Array }): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = { ...file, mldsaSecretKey: Buffer.from(file.mldsaSecretKey).toString('base64') };
	writeFileSync(path, JSON.stringify(json, null, 2), { mode: 0o600, flag: 'wx' });
}

function readKeyFile(path: string): { fields: Record<string, string>; mldsaSecretKey: Uint8Array } {
	const { mldsaSecretKey, ...fields } = JSON.parse(readFileSync(path, 'utf8'));
	return { fields, mldsaSecretKey: new Uint8Array(Buffer.from(mldsaSecretKey, 'base64')) };
}

async function sendWithWriteAhead<TResult extends { err: unknown }>(
	path: string,
	save: () => void,
	send: () => Promise<TResult>
): Promise<TResult> {
	save();
	const result = await send();
	if (result.err !== null) unlinkSync(path);
	return result;
}

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function loadKeypairSigner(path: string): Promise<KeyPairSigner> {
	return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

/** Appends one JSON line; bigints (e.g. RPC error codes) are written as numbers. */
export function appendJsonLine(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? Number(item) : item))}\n`);
}
