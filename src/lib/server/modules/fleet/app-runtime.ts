import * as env from '$app/env/private';
import { createFleetRuntime, FleetNotConfiguredError } from './runtime';
import { PaceStore } from './pace-store';
import { ProposalStore } from './proposal-store';
import { QuietStore } from './quiet-store';
import { ShockStore } from './shock-store';
import type { FleetRuntime } from './submit-decision';

/** The server's one store of armed demo shocks. */
export const shockStore = new ShockStore();

/** The server's one store of armed simulated Jito proposals. */
export const proposalStore = new ProposalStore();

/** Quiet cycles that the page shows as one line and that never become a transaction. */
export const quietStore = new QuietStore();

/** The server's one store of the paces picked on the speed wheel. */
export const paceStore = new PaceStore();

let runtime: Promise<FleetRuntime> | undefined;
let reportedNotConfigured = false;

/** The server's one runtime, created on first use from the variables declared in src/env.ts. */
export function getFleetRuntime(): Promise<FleetRuntime> {
	runtime ??= createFleetRuntime(env).catch((error: unknown) => {
		runtime = undefined; // a fixed configuration takes effect on the next request
		throw error;
	});
	return runtime;
}

/** The runtime, or null while the fleet is not configured (reported once): the page then shows no agents. */
export async function findFleetRuntime(): Promise<FleetRuntime | null> {
	try {
		return await getFleetRuntime();
	} catch (error) {
		if (!(error instanceof FleetNotConfiguredError)) throw error;
		if (!reportedNotConfigured) console.warn(`fleet not configured, showing no agents: ${error.message}`);
		reportedNotConfigured = true;
		return null;
	}
}
