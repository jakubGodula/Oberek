import { json } from '@sveltejs/kit';
import { GuardError, HTTP_STATUS_BY_GUARD_ERROR } from '../agent-guard/guard';
import { AwaitingApprovalError, NoPendingProposalError } from './approval';
import { LogNotSealedError } from './fleet';
import { DecisionNotInLogError } from './latest-decision';
import { FleetNotConfiguredError } from './runtime';

const CONFLICT = 409;
/** The guard could not give a verdict (e.g. the Solana RPC failed); the agent may retry on its next cycle. */
const BAD_GATEWAY = 502;
const SERVICE_UNAVAILABLE = 503;
const GUARD_UNAVAILABLE = 'GuardUnavailable';

/** The answer to a fleet request that failed; an unexpected failure is logged with the request's context. */
export function fleetErrorResponse(error: unknown, context: string): Response {
	if (error instanceof FleetNotConfiguredError) return answer(SERVICE_UNAVAILABLE, 'FleetNotConfigured', error.message);
	if (error instanceof LogNotSealedError) return answer(SERVICE_UNAVAILABLE, 'LogNotSealed', error.message);
	if (error instanceof DecisionNotInLogError) return answer(CONFLICT, 'DecisionNotInLog', error.message);
	if (error instanceof AwaitingApprovalError) return answer(CONFLICT, 'AwaitingApproval', error.message);
	if (error instanceof NoPendingProposalError) return answer(CONFLICT, 'NoPendingProposal', error.message);
	if (error instanceof GuardError) return answer(HTTP_STATUS_BY_GUARD_ERROR[error.code], error.code, error.message);
	console.error(`${context} failed:`, error);
	return answer(BAD_GATEWAY, GUARD_UNAVAILABLE, error instanceof Error ? error.message : String(error));
}

function answer(status: number, error: string, message: string): Response {
	return json({ error, message }, { status });
}
