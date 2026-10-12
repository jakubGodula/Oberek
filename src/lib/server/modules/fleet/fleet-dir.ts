// Where the fleet lives: the demo's directory, or another one named by FLEET_DIR, such as the e2e tests' own fleet
// (bun scripts/setup.ts --e2e, bun run e2e). Read on each call, so a script can set FLEET_DIR before first use and pass
// it on to the scripts it runs. Paths are relative to the repo root; .devnet/ is gitignored.

export const DEMO_FLEET_DIR = '.devnet/fleet';
export const E2E_FLEET_DIR = '.devnet/e2e-fleet';

export function fleetDir(): string {
	return process.env.FLEET_DIR || DEMO_FLEET_DIR;
}
