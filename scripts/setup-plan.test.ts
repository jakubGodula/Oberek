import { expect, test } from 'bun:test';
import { LAMPORTS_PER_AGENT, lamportsNeeded, stepsFor, type AgentProgress } from './setup-plan';

const fresh: AgentProgress = { registered: false, imported: false };
const registered: AgentProgress = { registered: true, imported: false };
const done: AgentProgress = { registered: true, imported: true };

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
	expect(stepsFor({ registered: false, imported: true })).toEqual([]);
});

test('funding covers each agent still to register', () => {
	expect(lamportsNeeded([fresh, registered, fresh])).toBe(2n * LAMPORTS_PER_AGENT);
});

test('a set-up machine needs no funding', () => {
	expect(lamportsNeeded([done, registered])).toBe(0n);
});
