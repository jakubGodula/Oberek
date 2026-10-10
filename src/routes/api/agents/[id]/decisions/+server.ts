import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime, onchainLog } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { withTransactions } from '#lib/server/modules/fleet/onchain-log';
import { assertInFleet } from '#lib/server/modules/fleet/record-decision';
import { RateLimitedError } from '#lib/server/modules/fleet/step-throttle';
import { parseSubmission, submitDecision } from '#lib/server/modules/fleet/submit-decision';

const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

/**
 * An agent process submits its next decision; 409 while the agent is killed or its proposal waits for a verdict, 429
 * when it submits too often, 503 while the fleet is not configured or the fee payer has no funds.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const submission = parseSubmission(await request.json().catch(() => null));
	if (!submission) {
		const message = 'expected { kind, decision, summary, requiresApproval? }';
		return json({ error: 'BadRequest', message }, { status: BAD_REQUEST });
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

const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 50;

/**
 * The agent's newest log entries, newest first, with the transactions this server saw land: each entry's signature and
 * the owner's kills and resumes among them. For the page's on-chain feed.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const runtime = await getFleetRuntime();
		assertInFleet(runtime, params.id!);
		const entries = runtime.fleet.recentDecisions(params.id!, feedLimit(url.searchParams.get('limit')));
		return json(withTransactions(entries, onchainLog.ofAgent(params.id!)));
	} catch (error) {
		return fleetErrorResponse(error, `decisions of agent ${params.id}`);
	}
};

function feedLimit(raw: string | null): number {
	const limit = Number(raw);
	return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_FEED_LIMIT) : DEFAULT_FEED_LIMIT;
}
