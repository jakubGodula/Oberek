import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, quietStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';

/** Counts one quiet cycle for the page. Nothing is written on-chain. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		const quiet = quietStore.note(params.id!);
		return json({ count: quiet.count });
	} catch (error) {
		return fleetErrorResponse(error, `quiet cycle of agent ${params.id}`);
	}
};
