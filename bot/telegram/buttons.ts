import type { Answer, ServerRequest } from './oberek-api';
import type { Keyboard } from './telegram-api';

// The owner's buttons: what each one carries, which server request it makes and how its result reads.

export type ButtonAction = 'accept' | 'reject' | 'kill' | 'resume';

export interface Press {
	action: ButtonAction;
	agentId: string;
}

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
const SEPARATOR = ':';
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const isButtonAction = (value: string): value is ButtonAction => Object.hasOwn(LABELS, value);
const callbackData = ({ action, agentId }: Press) => `${action}${SEPARATOR}${agentId}`;

export function parseCallbackData(data: string): Press | null {
	const at = data.indexOf(SEPARATOR);
	const action = data.slice(0, at);
	const agentId = data.slice(at + 1);
	return at > 0 && isButtonAction(action) && AGENT_ID.test(agentId) ? { action, agentId } : null;
}

export function keyboardFor(agentId: string, actions: ButtonAction[]): Keyboard | null {
	const row = actions.map((action) => ({ text: LABELS[action], callback_data: callbackData({ action, agentId }) }));
	const fits = row.every((button) => Buffer.byteLength(button.callback_data) <= MAX_CALLBACK_BYTES);
	return fits ? [row] : null;
}

export function requestFor({ action, agentId }: Press): ServerRequest {
	const agentPath = `/api/agents/${encodeURIComponent(agentId)}`;
	return action === 'accept' || action === 'reject'
		? { path: `${agentPath}/approval`, body: { verdict: action } }
		: { path: `${agentPath}/control`, body: { action } };
}

export function resultLine(action: ButtonAction, answer: Answer): string {
	if (answer.kind === 'unreachable') return `Server unreachable: ${answer.reason}`;
	const body = (typeof answer.body === 'object' && answer.body !== null ? answer.body : {}) as Record<string, unknown>;
	if (answer.status >= HTTP_OK_MIN && answer.status <= HTTP_OK_MAX) return `${DONE[action]} · step ${body.counter}`;
	return `Refused (${answer.status}): ${typeof body.message === 'string' ? body.message : 'no reason given'}`;
}
