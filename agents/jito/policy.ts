// The JitoSOL steward's mandate, simulated locally: a proposal it reads as positive for holders is accepted, one it
// reads as negative is rejected. No model is called. Pure: no I/O. A cycle with no proposal is not a decision.

import type { DemoProposal } from './proposals';

export type Vote = {
	action: 'FOR' | 'AGAINST';
	/** The simulated answer: positive or negative for JitoSOL holders. */
	answer: 'positive' | 'negative';
	proposal: DemoProposal;
};

export type JitoDecision = Vote;

/** A positive reading is FOR; a negative reading is AGAINST. */
export function decide(proposal: DemoProposal): JitoDecision {
	if (proposal.reading === 'positive') return { action: 'FOR', answer: 'positive', proposal };
	return { action: 'AGAINST', answer: 'negative', proposal };
}

export function summarize(decision: JitoDecision): string {
	return `${decision.action} upcoming proposal · ${decision.answer} for JitoSOL holders`;
}
