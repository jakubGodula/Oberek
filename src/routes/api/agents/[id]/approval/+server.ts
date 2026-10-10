import { json, type RequestHandler } from '@sveltejs/kit';
import { parseVerdict } from '#lib/server/modules/fleet/approval';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';

const BAD_REQUEST = 400;

/** The owner's verdict on the agent's waiting proposal; 409 when none waits or the agent is killed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const verdict = parseVerdict(await request.json().catch(() => null));
	if (!verdict) {
		return json({ error: 'BadRequest', message: 'expected { verdict: "accept" | "reject" }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await blinkService.decideProposal(params.id!, verdict));
	} catch (error) {
		return fleetErrorResponse(error, `verdict for agent ${params.id}`);
	}
};
