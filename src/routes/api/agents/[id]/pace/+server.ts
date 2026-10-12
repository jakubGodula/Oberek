import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, paceStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { parsePaceMs } from '#lib/server/modules/fleet/pace-store';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';
import { paceStepsFor } from '#lib/tick-pace';

const BAD_REQUEST = 400;

/** The agent reads the pause the owner picked; `{ intervalMs: null }` when none is picked. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		return json({ intervalMs: paceStore.get(params.id!) });
	} catch (error) {
		return fleetErrorResponse(error, `pace of agent ${params.id}`);
	}
};

/** The page's speed wheel sets the agent's pause between ticks; only a step of the wheel, and none under 10 s unbatched. */
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const runtime = await getFleetRuntime();
		assertInFleet(runtime, params.id!);
		const batched = runtime.batcher?.batches(params.id!) ?? false;
		const intervalMs = parsePaceMs(await request.json().catch(() => null), batched);
		if (intervalMs === null) {
			const message = `expected { intervalMs }: one of ${paceStepsFor(batched).join(', ')} ms`;
			return json({ error: 'BadRequest', message }, { status: BAD_REQUEST });
		}
		paceStore.set(params.id!, intervalMs);
		return json({ intervalMs });
	} catch (error) {
		return fleetErrorResponse(error, `pace of agent ${params.id}`);
	}
};
