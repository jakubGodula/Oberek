import { json } from '@sveltejs/kit';
import { parseVerdictRequest } from '#lib/server/modules/fleet/approval';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { blinkService } from '#lib/server/modules/solana-blink/blink.service';
import type { RequestHandler } from './$types';

const BAD_REQUEST = 400;

/**
 * The owner's verdict on the agent's waiting proposal; 409 when none waits, when `counter` names another proposal than
 * the waiting one, or when the agent is killed.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const verdictRequest = parseVerdictRequest(await request.json().catch(() => null));
	if (!verdictRequest) {
		return json(
			{ error: 'BadRequest', message: 'expected { verdict: "accept" | "reject", counter?: positive integer }' },
			{ status: BAD_REQUEST }
		);
	}
	try {
		return json(await blinkService.decideProposal(params.id, verdictRequest));
	} catch (error) {
		return fleetErrorResponse(error, `verdict for agent ${params.id}`);
	}
};
