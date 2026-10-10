import * as env from '$app/env/private';
import { createFleetRuntime } from './runtime';
import type { FleetRuntime } from './submit-decision';

let runtime: Promise<FleetRuntime> | undefined;

/** The server's one runtime, created on first use from the variables declared in src/env.ts. */
export function getFleetRuntime(): Promise<FleetRuntime> {
	runtime ??= createFleetRuntime(env).catch((error: unknown) => {
		runtime = undefined; // a fixed configuration takes effect on the next request
		throw error;
	});
	return runtime;
}
