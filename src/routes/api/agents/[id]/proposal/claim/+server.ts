import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, proposalStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';

/** The agent claims the simulated proposal armed for it, which disarms it; `{ proposal: null }` when none is armed. */
export const POST: RequestHandler = async ({ params }) => {
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		const direction = proposalStore.claim(params.id!);
		return json({ proposal: direction === null ? null : { direction } });
	} catch (error) {
		return fleetErrorResponse(error, `proposal claim of agent ${params.id}`);
	}
};
