import { expect, test } from 'bun:test';
import type { ProposalOutcome, QuietOutcome, RuntimeClient, Submission, SubmitOutcome } from '../shared/runtime-client';
import { runCycle } from './cycle';

function clientWith(
	proposal: ProposalOutcome,
	outcome: SubmitOutcome = { kind: 'recorded', counter: 4 },
	quiet: QuietOutcome = { kind: 'noted', count: 3 }
) {
	const submitted: Submission[] = [];
	let quietCalls = 0;
	const client: RuntimeClient = {
		latest: async () => ({ kind: 'none' }),
		pace: async () => null,
		claimShock: async () => ({ kind: 'none' }),
		claimProposal: async () => proposal,
		reportQuiet: async () => {
			quietCalls += 1;
			return quiet;
		},
		submit: async (submission) => {
			submitted.push(submission);
			return outcome;
		}
	};
	return { client, submitted, quietCalls: () => quietCalls };
}

test('counts a quiet cycle and submits nothing when no proposal is armed', async () => {
	const { client, submitted, quietCalls } = clientWith({ kind: 'none' });
	expect(await runCycle(client)).toBe('No new proposals detected ×3');
	expect(submitted).toEqual([]);
	expect(quietCalls()).toBe(1);
});

test('votes for a proposal it reads as positive for holders', async () => {
	const { client, submitted, quietCalls } = clientWith({ kind: 'armed', direction: 'positive' });
	expect(await runCycle(client)).toBe('FOR upcoming proposal · positive for JitoSOL holders → recorded #4');
	expect(submitted[0].decision).toMatchObject({
		action: 'FOR',
		answer: 'positive',
		proposal: { reading: 'positive', title: 'Upcoming proposal' }
	});
	expect(quietCalls()).toBe(0);
});

test('votes against a proposal it reads as negative for holders', async () => {
	const { client, submitted } = clientWith({ kind: 'armed', direction: 'negative' });
	expect(await runCycle(client)).toBe('AGAINST upcoming proposal · negative for JitoSOL holders → recorded #4');
	expect(submitted[0].decision).toMatchObject({ action: 'AGAINST', answer: 'negative', proposal: { reading: 'negative' } });
});

test('submits nothing when the claim fails', async () => {
	const { client, submitted, quietCalls } = clientWith({ kind: 'failed', reason: 'server unreachable: down' });
	expect(await runCycle(client)).toBe('skipped: proposal unavailable (server unreachable: down)');
	expect(submitted).toEqual([]);
	expect(quietCalls()).toBe(0);
});

test('reports a killed agent without throwing', async () => {
	const { client } = clientWith({ kind: 'armed', direction: 'positive' }, { kind: 'paused' });
	expect(await runCycle(client)).toBe(
		'FOR upcoming proposal · positive for JitoSOL holders → refused: the owner killed the agent'
	);
});

test('skips the line when the quiet report fails', async () => {
	const { client, submitted } = clientWith({ kind: 'none' }, { kind: 'recorded', counter: 4 }, {
		kind: 'failed',
		reason: 'server unreachable: down'
	});
	expect(await runCycle(client)).toBe('skipped: quiet unavailable (server unreachable: down)');
	expect(submitted).toEqual([]);
});
