import { expect, test } from 'bun:test';
import {
	DEMO_PROFILE,
	E2E_FLAG,
	E2E_PROFILE,
	LAMPORTS_FOR_OWNER_KEY,
	LAMPORTS_PER_AGENT,
	lamportsNeeded,
	predatesActivation,
	profileFor,
	stepsFor,
	type AgentProgress
} from './setup-plan';

const fresh: AgentProgress = { registered: false, pending: false, imported: false, sealed: false, identified: false };
const registered: AgentProgress = { registered: true, pending: false, imported: false, sealed: false, identified: false };
const done: AgentProgress = { registered: true, pending: false, imported: true, sealed: true, identified: true };
const importedBeforeSealing: AgentProgress = {
	registered: true,
	pending: false,
	imported: true,
	sealed: false,
	identified: true
};
const importedWithoutIdentity: AgentProgress = { ...done, identified: false };

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

test('an agent in the fleet without its agent file still needs nothing when the key file is already there', () => {
	expect(stepsFor({ ...done, registered: false })).toEqual([]);
});

test('an imported agent whose key file was not copied only copies it', () => {
	expect(stepsFor(importedWithoutIdentity)).toEqual(['identify']);
});

test('a fleet entry with neither key file asks to restore it, and that costs no SOL', () => {
	const missing: AgentProgress = { ...importedWithoutIdentity, registered: false };
	expect(stepsFor(missing)).toEqual(['identify']);
	expect(lamportsNeeded([missing], true)).toBe(0n);
});

test('a machine that already runs Sentinel and Tick only funds the new steward', () => {
	expect(stepsFor(done)).toEqual([]);
	expect(stepsFor(fresh)).toEqual(['register', 'import']);
	expect(lamportsNeeded([done, done, fresh], true)).toBe(LAMPORTS_PER_AGENT);
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

test('agents set up before the owner key existed predate activation', () => {
	expect(predatesActivation([done, fresh], false)).toBe(true);
	expect(predatesActivation([{ ...fresh, registered: true }], false)).toBe(true);
});

test('agents set up after the owner key, or no agents at all, do not predate activation', () => {
	expect(predatesActivation([done], true)).toBe(false);
	expect(predatesActivation([fresh, fresh], false)).toBe(false);
});

test('sets up the demo fleet by default', () => {
	expect(profileFor(['bun', 'scripts/setup.ts'])).toBe(DEMO_PROFILE);
	expect(DEMO_PROFILE.agents.map((agent) => agent.id)).toEqual(['sentinel-01', 'tick-01', 'jito-01']);
});

test('sets up the test fleet with --e2e, also next to --reregister', () => {
	expect(profileFor(['bun', 'scripts/setup.ts', E2E_FLAG])).toBe(E2E_PROFILE);
	expect(profileFor(['bun', 'scripts/setup.ts', '--reregister', E2E_FLAG])).toBe(E2E_PROFILE);
	expect(E2E_PROFILE.agents.map((agent) => agent.id)).toEqual(['sentinel-01', 'tick-01']);
});

test("keeps the test fleet out of the demo fleet's directories", () => {
	expect(E2E_PROFILE.fleetDir).not.toBe(DEMO_PROFILE.fleetDir);
	expect(E2E_PROFILE.agentsDir).not.toBe(DEMO_PROFILE.agentsDir);
});

test('names the test agents so the page shows which fleet it serves', () => {
	const demoNames = new Set(DEMO_PROFILE.agents.map((agent) => agent.name));
	for (const agent of E2E_PROFILE.agents) {
		expect(agent.name.startsWith('E2E ')).toBe(true);
		expect(demoNames.has(agent.name)).toBe(false);
	}
});
