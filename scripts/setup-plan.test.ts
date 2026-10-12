import { expect, test } from 'bun:test';
import { LAMPORTS_PER_AGENT, lamportsNeeded, stepsFor, type AgentProgress } from './setup-plan';

const fresh: AgentProgress = { registered: false, imported: false, sealed: false, identified: false };
const registered: AgentProgress = { registered: true, imported: false, sealed: false, identified: false };
const done: AgentProgress = { registered: true, imported: true, sealed: true, identified: true };
const importedBeforeSealing: AgentProgress = { registered: true, imported: true, sealed: false, identified: true };
const importedWithoutIdentity: AgentProgress = { registered: true, imported: true, sealed: true, identified: false };

test('a fresh agent is registered, then imported', () => {
	expect(stepsFor(fresh)).toEqual(['register', 'import']);
});

test('a registered agent is only imported', () => {
	expect(stepsFor(registered)).toEqual(['import']);
});

test('an agent in the fleet needs nothing', () => {
	expect(stepsFor(done)).toEqual([]);
});

test('an agent in the fleet without its agent file still needs nothing when the key file is already there', () => {
	expect(stepsFor({ registered: false, imported: true, sealed: true, identified: true })).toEqual([]);
});

test('an imported agent whose key file was not copied only copies it', () => {
	expect(stepsFor(importedWithoutIdentity)).toEqual(['identify']);
});

test('a fleet entry with neither key file asks to restore it, and that costs no SOL', () => {
	const missing = { registered: false, imported: true, sealed: true, identified: false };
	expect(stepsFor(missing)).toEqual(['identify']);
	expect(lamportsNeeded([missing])).toBe(0n);
});

test('a machine that already runs Sentinel and Tick only funds the new steward', () => {
	expect(stepsFor(done)).toEqual([]);
	expect(stepsFor(fresh)).toEqual(['register', 'import']);
	expect(lamportsNeeded([done, done, fresh])).toBe(LAMPORTS_PER_AGENT);
});

test('an agent imported before logs were sealed is only sealed', () => {
	expect(stepsFor(importedBeforeSealing)).toEqual(['seal']);
});

test('a sealed agent is never sealed again', () => {
	expect(stepsFor(done)).not.toContain('seal');
});

test('sealing costs no SOL', () => {
	expect(lamportsNeeded([importedBeforeSealing])).toBe(0n);
});

test('funding covers each agent still to register', () => {
	expect(lamportsNeeded([fresh, registered, fresh])).toBe(2n * LAMPORTS_PER_AGENT);
});

test('a set-up machine needs no funding', () => {
	expect(lamportsNeeded([done, registered])).toBe(0n);
});
