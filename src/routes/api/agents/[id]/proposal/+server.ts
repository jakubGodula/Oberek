import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, proposalStore } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';
import { parseProposalReading } from '#lib/server/modules/fleet/proposal-store';

const BAD_REQUEST = 400;

/** Arms a one-off simulated proposal for the agent's next cycle (demo); replaces one already armed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const direction = parseProposalReading(await request.json().catch(() => null));
	if (direction === null) {
		const message = 'expected { direction }: "positive" or "negative"';
		return json({ error: 'BadRequest', message }, { status: BAD_REQUEST });
	}
	try {
		assertInFleet(await getFleetRuntime(), params.id!);
		proposalStore.arm(params.id!, direction);
		return json({ armed: { direction } });
	} catch (error) {
		return fleetErrorResponse(error, `proposal for agent ${params.id}`);
	}
};
