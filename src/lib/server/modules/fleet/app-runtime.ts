import * as env from '$app/env/private';
import { createFleetRuntime, type AppRuntime } from './runtime';

let runtime: Promise<AppRuntime> | undefined;

/** The server's one runtime, created on first use from the variables declared in src/env.ts (CHAIN=fake|devnet). */
export function getFleetRuntime(): Promise<AppRuntime> {
	runtime ??= createFleetRuntime(env).catch((error: unknown) => {
		runtime = undefined; // a fixed configuration takes effect on the next request
		throw error;
	});
	return runtime;
}
