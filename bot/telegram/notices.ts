import { type ButtonAction, keyboardFor } from './buttons';
import type { AgentView, PendingProposal } from './oberek-api';
import type { Keyboard } from './telegram-api';

// What the bot tells the owner: notices about changes between two reads of the fleet, and the answer to /agents.
// Only fleet agents count; mock agents send nothing on chain.

export interface Notice {
	text: string;
	keyboard?: Keyboard;
}

const PROPOSAL_FOOTER = [
	'Accept: the verdict goes on-chain and the agent executes the trade in its next cycle.',
	'Reject: the verdict goes on-chain and the treasury stays unchanged.'
].join('\n');
const NO_BUTTONS_NOTE = 'Its id is too long for Telegram buttons: use the page.';
const EMPTY_FLEET = 'No fleet agents on the server.';

const isFleetAgent = (agent: AgentView) => agent.fleet !== undefined;
const proposalOf = (agent: AgentView): PendingProposal | null =>
	agent.status === 'AWAITING_APPROVAL' ? (agent.fleet?.pendingProposal ?? null) : null;

function notice(text: string, agentId: string, actions: ButtonAction[], proposalCounter?: number): Notice {
	if (actions.length === 0) return { text };
	const keyboard = keyboardFor(agentId, actions, proposalCounter);
	return keyboard ? { text, keyboard } : { text: `${text}\n\n${NO_BUTTONS_NOTE}` };
}

function proposalNotice(agent: AgentView, proposal: PendingProposal): Notice {
	const text = `⚠️ ${agent.name} waits for your verdict · step #${proposal.counter}\n${proposal.summary}\n\n${PROPOSAL_FOOTER}`;
	return notice(text, agent.id, ['accept', 'reject', 'kill'], proposal.counter);
}

/** What changed for one agent since the previous read; null when nothing worth a message. */
function changeNotice(before: AgentView | undefined, now: AgentView): Notice | null {
	const proposal = proposalOf(now);
	if (proposal) {
		const known = before && proposalOf(before)?.counter === proposal.counter;
		return known ? null : proposalNotice(now, proposal);
	}
	if (now.status === before?.status) return null;
	if (now.status === 'PAUSED') {
		return notice(`⏸ ${now.name} is killed · step ${now.actionsExecuted}`, now.id, ['resume']);
	}
	if (now.status === 'ACTIVE' && before?.status === 'PAUSED') {
		return notice(`▶ ${now.name} is running again · step ${now.actionsExecuted}`, now.id, ['kill']);
	}
	return null;
}

export function changeNotices(previous: AgentView[] | null, current: AgentView[]): Notice[] {
	const fleet = current.filter(isFleetAgent);
	if (previous === null) {
		return fleet.flatMap((agent) => {
			const proposal = proposalOf(agent);
			return proposal ? [proposalNotice(agent, proposal)] : [];
		});
	}
	const before = new Map(previous.map((agent) => [agent.id, agent]));
	return fleet.flatMap((agent) => changeNotice(before.get(agent.id), agent) ?? []);
}

/**
 * What the next read is compared with: the current read, where an unavailable agent keeps its last known card, so a
 * blip in reading it does not resend what the owner already got.
 */
export function lastKnown(previous: AgentView[] | null, current: AgentView[]): AgentView[] {
	const before = new Map((previous ?? []).map((agent) => [agent.id, agent]));
	return current.map((agent) => (agent.status === 'UNAVAILABLE' ? (before.get(agent.id) ?? agent) : agent));
}

function agentNotice(agent: AgentView): Notice {
	const proposal = proposalOf(agent);
	if (proposal) return proposalNotice(agent, proposal);
	const step = `step ${agent.actionsExecuted}`;
	if (agent.status === 'ACTIVE') {
		return notice(`▶ ${agent.name} · running · ${step}\n${agent.currentTask}`, agent.id, ['kill']);
	}
	if (agent.status === 'PAUSED') return notice(`⏸ ${agent.name} · killed · ${step}`, agent.id, ['resume']);
	return notice(`${agent.name} · ${agent.currentTask}`, agent.id, []);
}

export function agentsAnswer(agents: AgentView[]): Notice[] {
	const fleet = agents.filter(isFleetAgent);
	return fleet.length > 0 ? fleet.map(agentNotice) : [{ text: EMPTY_FLEET }];
}
