import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, shockStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';

/** The agent claims the shock armed for it, which disarms it; `{ shock: null }` when none is armed. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		const pct = shockStore.claim(params.id!);
		return json({ shock: pct === null ? null : { pct } });
	} catch (error) {
		return fleetErrorResponse(error, `shock claim of agent ${params.id}`);
	}
};
