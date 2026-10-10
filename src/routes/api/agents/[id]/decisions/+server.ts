import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { RateLimitedError } from '#lib/server/modules/fleet/step-throttle';
import { parseSubmission, submitDecision } from '#lib/server/modules/fleet/submit-decision';

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

/**
 * An agent process submits its next decision; 409 while the agent is killed, 429 when it submits too often, 503 while
 * the fleet is not configured or the fee payer has no funds.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const submission = parseSubmission(await request.json().catch(() => null));
	if (!submission) {
		return json({ error: 'BadRequest', message: 'expected { kind, decision, summary }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await submitDecision(await getFleetRuntime(), params.id!, submission));
	} catch (error) {
		if (error instanceof RateLimitedError) {
			const retryAfterSeconds = String(Math.ceil(error.retryAfterMs / MS_PER_SECOND));
			const body = { error: 'RateLimited', message: error.message };
			return json(body, { status: TOO_MANY_REQUESTS, headers: { 'retry-after': retryAfterSeconds } });
		}
		return fleetErrorResponse(error, `decision of agent ${params.id}`);
	}
};
