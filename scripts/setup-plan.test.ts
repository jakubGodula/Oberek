import { expect, test } from 'bun:test';
import { LAMPORTS_FOR_OWNER_KEY, LAMPORTS_PER_AGENT, lamportsNeeded, stepsFor, type AgentProgress } from './setup-plan';

const fresh: AgentProgress = { registered: false, pending: false, imported: false, sealed: false };
const registered: AgentProgress = { registered: true, pending: false, imported: false, sealed: false };
const done: AgentProgress = { registered: true, pending: false, imported: true, sealed: true };
const importedBeforeSealing: AgentProgress = { registered: true, pending: false, imported: true, sealed: false };

test('a registered agent still awaiting activation is activated, then imported', () => {
	expect(stepsFor({ ...registered, pending: true })).toEqual(['activate', 'import']);
});

test('an imported agent still awaiting activation is only activated', () => {
	expect(stepsFor({ ...done, pending: true })).toEqual(['activate']);
});

test('an agent imported before logs were sealed and still awaiting activation is activated, then sealed', () => {
	expect(stepsFor({ ...importedBeforeSealing, pending: true })).toEqual(['activate', 'seal']);
});

test('a fresh agent is registered, then imported', () => {
	expect(stepsFor(fresh)).toEqual(['register', 'import']);
});

test('a registered agent is only imported', () => {
	expect(stepsFor(registered)).toEqual(['import']);
});

test('an agent in the fleet needs nothing', () => {
	expect(stepsFor(done)).toEqual([]);
});

test('an agent in the fleet without its agent file still needs nothing', () => {
	expect(stepsFor({ registered: false, pending: false, imported: true, sealed: true })).toEqual([]);
});

test('an agent imported before logs were sealed is only sealed', () => {
	expect(stepsFor(importedBeforeSealing)).toEqual(['seal']);
});

test('a sealed agent is never sealed again', () => {
	expect(stepsFor(done)).not.toContain('seal');
});

test('sealing costs no SOL', () => {
	expect(lamportsNeeded([importedBeforeSealing], true)).toBe(0n);
});

test('funding covers each agent still to register', () => {
	expect(lamportsNeeded([fresh, registered, fresh], true)).toBe(2n * LAMPORTS_PER_AGENT);
});

test('a set-up machine needs no funding', () => {
	expect(lamportsNeeded([done, registered], true)).toBe(0n);
});

test('funding also covers the owner key until it is registered', () => {
	expect(lamportsNeeded([fresh], false)).toBe(LAMPORTS_PER_AGENT + LAMPORTS_FOR_OWNER_KEY);
	expect(lamportsNeeded([done], false)).toBe(LAMPORTS_FOR_OWNER_KEY);
});
