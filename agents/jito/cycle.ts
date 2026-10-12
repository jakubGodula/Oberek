import { describeSubmitOutcome, type RuntimeClient, type Submission } from '../shared/runtime-client';
import { decide, summarize } from './policy';
import { proposalById } from './proposals';

export const JITO_KIND = 'jito';

/**
 * One cycle: claim the proposal the page armed, if any, then vote. With nothing armed, count a quiet cycle and send
 * no transaction. A failed claim submits nothing, so a vote is never skipped in favour of a quiet line the server did
 * not confirm. Returns the line to log; never throws.
 */
export async function runCycle(client: RuntimeClient): Promise<string> {
	const claimed = await client.claimProposal();
	if (claimed.kind === 'failed') return `skipped: proposal unavailable (${claimed.reason})`;
	if (claimed.kind === 'none') {
		const quiet = await client.reportQuiet();
		if (quiet.kind === 'failed') return `skipped: quiet unavailable (${quiet.reason})`;
		return `No new proposals detected ×${quiet.count}`;
	}
	const decision = decide(proposalById(claimed.direction));
	const summary = summarize(decision);
	const submission: Submission = { kind: JITO_KIND, decision, summary };
	const outcome = await client.submit(submission);
	return `${summary} → ${describeSubmitOutcome(outcome)}`;
}
