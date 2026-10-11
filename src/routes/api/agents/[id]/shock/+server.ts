import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, shockStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';
import { parseShockPct } from '#lib/server/modules/fleet/shock-store';

const BAD_REQUEST = 400;

/** Arms a one-off simulated price shock for the agent's next cycle (demo); replaces one already armed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const pct = parseShockPct(await request.json().catch(() => null));
	if (pct === null) {
		const message = 'expected { pct }: a non-zero number of percent, at most 50 either way';
		return json({ error: 'BadRequest', message }, { status: BAD_REQUEST });
	}
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		shockStore.arm(params.id!, pct);
		return json({ armed: { pct } });
	} catch (error) {
		return fleetErrorResponse(error, `shock for agent ${params.id}`);
	}
};
