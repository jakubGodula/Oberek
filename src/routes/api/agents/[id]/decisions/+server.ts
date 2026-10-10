import { json, type RequestHandler } from '@sveltejs/kit';
import { GuardError, HTTP_STATUS_BY_GUARD_ERROR } from '#lib/server/modules/agent-guard/guard';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';
import { FleetNotConfiguredError } from '#lib/server/modules/fleet/runtime';
import { RateLimitedError } from '#lib/server/modules/fleet/step-throttle';
import { parseSubmission, submitDecision } from '#lib/server/modules/fleet/submit-decision';

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
/** The guard could not give a verdict (e.g. the Solana RPC failed); the agent may retry on its next tick. */
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;

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
		if (error instanceof FleetNotConfiguredError) {
			return json({ error: 'FleetNotConfigured', message: error.message }, { status: SERVICE_UNAVAILABLE });
		}
		if (error instanceof GuardError) {
			return json({ error: error.code, message: error.message }, { status: HTTP_STATUS_BY_GUARD_ERROR[error.code] });
		}
		console.error(`decision of agent ${params.id} failed:`, error);
		const message = error instanceof Error ? error.message : String(error);
		return json({ error: 'GuardUnavailable', message }, { status: BAD_GATEWAY });
	}
};
