import { json, type RequestHandler } from '@sveltejs/kit';
import { parseControlAction } from '#lib/server/modules/fleet/control';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

const BAD_REQUEST = 400;

/** The owner's kill switch: kill or resume the agent; 409 when it is already in that state. */
export const POST: RequestHandler = async ({ params, request }) => {
	const action = parseControlAction(await request.json().catch(() => null));
	if (!action) {
		return json({ error: 'BadRequest', message: 'expected { action: "kill" | "resume" }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await blinkService.controlAgent(params.id!, action));
	} catch (error) {
		return fleetErrorResponse(error, `${action} of agent ${params.id}`);
	}
};
