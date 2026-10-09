import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAddressDecoder } from '@solana/kit';
import { appendJsonLine, assertAgentFileAbsent, loadAgentFile, saveAgentFile, type AgentFile } from './files';

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

describe('appendJsonLine', () => {
	it('appends one line per value and writes bigints as numbers', () => {
		const path = tempPath('decisions.jsonl');
		appendJsonLine(path, { err: { InstructionError: [0, { Custom: 6000n }] } });
		appendJsonLine(path, { ok: true });
		expect(readFileSync(path, 'utf8')).toBe('{"err":{"InstructionError":[0,{"Custom":6000}]}}\n{"ok":true}\n');
	});
});
