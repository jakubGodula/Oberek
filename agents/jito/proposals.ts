// The two demo proposals the page can arm. They are not real JIPs. The page sends only the steward's simulated
// reading; the text lives here so the recorded decision carries it.

export type ProposalId = 'positive' | 'negative';

export interface DemoProposal {
	id: ProposalId;
	source: 'demo';
	title: string;
	body: string;
	/** How the steward reads the proposal for JitoSOL holders. The page chooses this; no model is called. */
	reading: 'positive' | 'negative';
}

export const POSITIVE_PROPOSAL: DemoProposal = {
	id: 'positive',
	source: 'demo',
	title: 'Upcoming proposal',
	body:
		'The Steward routes part of the JitoSOL pool through a pass-through validator and returns block rewards to stakers. The treasury is not spent. The steward reads this as positive for JitoSOL holders.',
	reading: 'positive'
};

export const NEGATIVE_PROPOSAL: DemoProposal = {
	id: 'negative',
	source: 'demo',
	title: 'Upcoming proposal',
	body:
		'The Steward raises the commission on JitoSOL validators and stops passing block rewards through to stakers. The steward reads this as negative for JitoSOL holders.',
	reading: 'negative'
};

const BY_ID: Record<ProposalId, DemoProposal> = { positive: POSITIVE_PROPOSAL, negative: NEGATIVE_PROPOSAL };

export function proposalById(id: ProposalId): DemoProposal {
	return BY_ID[id];
}
