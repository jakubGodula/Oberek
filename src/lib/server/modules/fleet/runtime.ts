import { FakeGuard } from '../agent-guard/fake-guard';
import { Fleet } from './fleet';
import type { FleetRuntime } from './submit-decision';

// Paths relative to the repo root, where the dev server and scripts/fleet.ts run. Both directories are gitignored.
export const FLEET_DIR = '.fleet';
export const FAKE_CHAIN_DIR = '.fake-chain';

/** The server's one runtime. Switching to the on-chain program means replacing FakeGuard here. */
export const fleetRuntime: FleetRuntime = {
	guard: new FakeGuard(FAKE_CHAIN_DIR),
	fleet: new Fleet(FLEET_DIR),
	now: () => new Date()
};
