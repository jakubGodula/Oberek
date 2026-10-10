import { json, type RequestHandler } from '@sveltejs/kit';
import { GuardError, HTTP_STATUS_BY_GUARD_ERROR } from '#lib/server/modules/agent-guard/guard';
import { fleetRuntime } from '#lib/server/modules/fleet/runtime';
import { parseSubmission, submitDecision } from '#lib/server/modules/fleet/submit-decision';

const BAD_REQUEST = 400;

/** An agent process submits its next decision; 409 while the agent is killed. */
export const POST: RequestHandler = async ({ params, request }) => {
	const submission = parseSubmission(await request.json().catch(() => null));
	if (!submission) {
		return json({ error: 'BadRequest', message: 'expected { kind, decision, summary }' }, { status: BAD_REQUEST });
	}
	try {
		return json(await submitDecision(fleetRuntime, params.id!, submission));
	} catch (error) {
		if (error instanceof GuardError) {
			return json({ error: error.code, message: error.message }, { status: HTTP_STATUS_BY_GUARD_ERROR[error.code] });
		}
		throw error;
	}
};
