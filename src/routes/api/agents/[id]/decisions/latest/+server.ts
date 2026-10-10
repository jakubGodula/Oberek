import { json, type RequestHandler } from '@sveltejs/kit';
import { getFleetRuntime } from '#lib/server/modules/fleet/app-runtime';
import { fleetErrorResponse } from '#lib/server/modules/fleet/http-errors';
import { latestDecision } from '#lib/server/modules/fleet/latest-decision';

/** The agent's last decision recorded on chain, checked against the hash the guard holds; null before its first step. */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const entry = await latestDecision(await getFleetRuntime(), params.id!);
		const latest = entry && { counter: entry.record.counter, record: entry.record, decisionHash: entry.decisionHash };
		return json({ latest });
	} catch (error) {
		return fleetErrorResponse(error, `latest decision of agent ${params.id}`);
	}
};
