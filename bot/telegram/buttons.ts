import type { Answer, ServerRequest } from './oberek-api';
import type { Keyboard } from './telegram-api';

// The owner's buttons: what each one carries, which server request it makes and how its result reads.

type VerdictAction = 'accept' | 'reject';
export type ButtonAction = VerdictAction | 'kill' | 'resume';

/**
 * A verdict carries the step counter of the proposal its message shows, so an old message cannot decide a later
 * proposal.
 */
export type Press =
	| { action: VerdictAction; agentId: string; proposalCounter: number }
	| { action: Exclude<ButtonAction, VerdictAction>; agentId: string };

const LABELS: Record<ButtonAction, string> = {
	accept: '✅ Accept',
	reject: '❌ Reject',
	kill: '🛑 Kill',
	resume: '▶ Resume'
};

const DONE: Record<ButtonAction, string> = {
	accept: '✅ Approved',
	reject: '❌ Rejected',
	kill: '🛑 Killed',
	resume: '▶ Resumed'
};

/** Telegram's limit on a button's callback data. */
const MAX_CALLBACK_BYTES = 64;
/** The server's agent id pattern (isAgentId). */
const AGENT_ID = /^[A-Za-z0-9-]{1,64}$/;
/** A proposal's step counter in callback data: a positive integer, digits only. */
const PROPOSAL_COUNTER = /^[1-9][0-9]*$/;
const SEPARATOR = ':';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const isButtonAction = (value: string): value is ButtonAction => Object.hasOwn(LABELS, value);
const isVerdict = (action: ButtonAction): action is VerdictAction => action === 'accept' || action === 'reject';

/** `<action>:<agentId>`, and `:<proposalCounter>` after a verdict. */
function callbackData(action: ButtonAction, agentId: string, proposalCounter: number | undefined): string {
	if (!isVerdict(action)) return [action, agentId].join(SEPARATOR);
	if (proposalCounter === undefined) throw new Error('a verdict button needs the proposal counter');
	return [action, agentId, proposalCounter].join(SEPARATOR);
}

export function parseCallbackData(data: string): Press | null {
	const [action = '', agentId = '', counter, ...rest] = data.split(SEPARATOR);
	if (!isButtonAction(action) || !AGENT_ID.test(agentId) || rest.length > 0) return null;
	if (!isVerdict(action)) return counter === undefined ? { action, agentId } : null;
	return counter !== undefined && PROPOSAL_COUNTER.test(counter)
		? { action, agentId, proposalCounter: Number(counter) }
		: null;
}

/** `proposalCounter` is required when `actions` hold Accept or Reject. */
export function keyboardFor(agentId: string, actions: ButtonAction[], proposalCounter?: number): Keyboard | null {
	const row = actions.map((action) => ({
		text: LABELS[action],
		callback_data: callbackData(action, agentId, proposalCounter)
	}));
	const fits = row.every((button) => Buffer.byteLength(button.callback_data) <= MAX_CALLBACK_BYTES);
	return fits ? [row] : null;
}

export function requestFor(press: Press): ServerRequest {
	const agentPath = `/api/agents/${encodeURIComponent(press.agentId)}`;
	return 'proposalCounter' in press
		? { path: `${agentPath}/approval`, body: { verdict: press.action, counter: press.proposalCounter } }
		: { path: `${agentPath}/control`, body: { action: press.action } };
}

export function resultLine(action: ButtonAction, answer: Answer): string {
	if (answer.kind === 'unreachable') return `Server unreachable: ${answer.reason}`;
	const body = (typeof answer.body === 'object' && answer.body !== null ? answer.body : {}) as Record<string, unknown>;
	if (answer.status >= HTTP_OK_MIN && answer.status <= HTTP_OK_MAX) return `${DONE[action]} · step ${body.counter}`;
	return `Refused (${answer.status}): ${typeof body.message === 'string' ? body.message : 'no reason given'}`;
}
