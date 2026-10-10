import * as env from '$app/env/private';
import { OnchainLog } from './onchain-log';
import { createFleetRuntime, FleetNotConfiguredError } from './runtime';
import { ShockStore } from './shock-store';
import type { FleetRuntime } from './submit-decision';

/** The server's one store of armed demo shocks. */
export const shockStore = new ShockStore();

/** The server's one on-chain log, filled by the runtime's guard. */
export const onchainLog = new OnchainLog();

let runtime: Promise<FleetRuntime> | undefined;
let reportedNotConfigured = false;

/** The server's one runtime, created on first use from the variables declared in src/env.ts. */
export function getFleetRuntime(): Promise<FleetRuntime> {
	runtime ??= createFleetRuntime(env, (transaction) => onchainLog.record(transaction)).catch((error: unknown) => {
		runtime = undefined; // a fixed configuration takes effect on the next request
		throw error;
	});
	return runtime;
}

/** The runtime, or null while the fleet is not configured (reported once): the page then shows only the mock agents. */
export async function findFleetRuntime(): Promise<FleetRuntime | null> {
	try {
		return await getFleetRuntime();
	} catch (error) {
		if (!(error instanceof FleetNotConfiguredError)) throw error;
		if (!reportedNotConfigured) console.warn(`fleet not configured, showing only the mock agents: ${error.message}`);
		reportedNotConfigured = true;
		return null;
	}
}
