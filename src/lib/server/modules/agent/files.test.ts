import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAddressDecoder } from '@solana/kit';
import {
	appendJsonLine,
	assertAgentFileAbsent,
	loadAgentFile,
	saveAgentFile,
	sendWithAgentFileWriteAhead,
	type AgentFile
} from './files';

const addressOf = (value: number) => getAddressDecoder().decode(new Uint8Array(32).fill(value));
const tempPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'agent-files-')), name);
const AGENT_FILE: AgentFile = {
	owner: addressOf(1),
	agentKey: addressOf(2),
	agent: addressOf(3),
	mldsaSecretKey: new Uint8Array(2560).fill(4)
};

describe('agent file', () => {
	it('round-trips', () => {
		const path = tempPath('agent.json');
		saveAgentFile(path, AGENT_FILE);
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});

	it('never overwrites an existing agent file', () => {
		const path = tempPath('agent.json');
		saveAgentFile(path, AGENT_FILE);
		expect(() => assertAgentFileAbsent(path)).toThrow('already exists');
		expect(() => saveAgentFile(path, { ...AGENT_FILE, mldsaSecretKey: new Uint8Array(2560) })).toThrow('already exists');
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});
});

describe('sendWithAgentFileWriteAhead', () => {
	it('keeps the secret key when the send throws, since the registration may have landed', async () => {
		const path = tempPath('agent.json');
		const send = async () => {
			throw new Error('HTTP error (429): Too Many Requests');
		};
		await expect(sendWithAgentFileWriteAhead(path, AGENT_FILE, send)).rejects.toThrow('429');
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});

	it('removes the file when the registration failed on-chain', async () => {
		const path = tempPath('agent.json');
		const failed = { err: { InstructionError: [1, { Custom: 6003 }] } };
		expect(await sendWithAgentFileWriteAhead(path, AGENT_FILE, async () => failed)).toBe(failed);
		expect(existsSync(path)).toBe(false);
	});

	it('keeps the file when the registration succeeded', async () => {
		const path = tempPath('agent.json');
		await sendWithAgentFileWriteAhead(path, AGENT_FILE, async () => ({ err: null }));
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});
});

describe('appendJsonLine', () => {
	it('appends one line per value and writes bigints as numbers', () => {
		const path = tempPath('decisions.jsonl');
		appendJsonLine(path, { err: { InstructionError: [0, { Custom: 6000n }] } });
		appendJsonLine(path, { ok: true });
		expect(readFileSync(path, 'utf8')).toBe('{"err":{"InstructionError":[0,{"Custom":6000}]}}\n{"ok":true}\n');
	});
});
