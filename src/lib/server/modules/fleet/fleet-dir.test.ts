import { afterEach, expect, test } from 'bun:test';
import { DEMO_FLEET_DIR, E2E_FLEET_DIR, fleetDir } from './fleet-dir';

const saved = process.env.FLEET_DIR;

afterEach(() => {
	if (saved === undefined) delete process.env.FLEET_DIR;
	else process.env.FLEET_DIR = saved;
});

test('is the demo fleet when FLEET_DIR is not set', () => {
	delete process.env.FLEET_DIR;
	expect(fleetDir()).toBe(DEMO_FLEET_DIR);
});

test('is the demo fleet when FLEET_DIR is empty', () => {
	process.env.FLEET_DIR = '';
	expect(fleetDir()).toBe(DEMO_FLEET_DIR);
});

test('follows FLEET_DIR, read on each call', () => {
	process.env.FLEET_DIR = E2E_FLEET_DIR;
	expect(fleetDir()).toBe(E2E_FLEET_DIR);
});

test('keeps the test fleet apart from the demo fleet', () => {
	expect(E2E_FLEET_DIR).not.toBe(DEMO_FLEET_DIR);
});
