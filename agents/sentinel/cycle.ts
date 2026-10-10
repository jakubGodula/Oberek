import { describeSubmitOutcome, type RuntimeClient, type Submission } from '../shared/runtime-client';
import { decide, summarize, type Policy, type Previous, type PriceReading } from './policy';
import { previousFrom, SENTINEL_KIND } from './previous';
import { applyShock } from './shock';

export interface CycleDeps {
	client: RuntimeClient;
	fetchPrice: () => Promise<PriceReading>;
	policy: Policy;
}

/**
 * One cycle: last recorded decision → price (shocked when the demo armed a shock) → policy → submit. While its
 * proposal waits for the owner's verdict it does nothing. Returns the line to log; never throws.
 */
export async function runCycle({ client, fetchPrice, policy }: CycleDeps): Promise<string> {
	const latest = await client.latest();
	if (latest.kind === 'failed') return `skipped: last decision unavailable (${latest.reason})`;
	if (latest.kind === 'found' && latest.record.requiresApproval) {
		return `waiting for approval (#${latest.record.counter})`;
	}
	let previous: Previous | null;
	try {
		previous = latest.kind === 'none' ? null : previousFrom(latest.record);
	} catch (error) {
		return `skipped: ${messageOf(error)}`;
	}
	let price: PriceReading;
	try {
		price = await fetchPrice();
	} catch (error) {
		return `skipped: price unavailable (${messageOf(error)})`;
	}
	const { reading, note } = await withShock(client, price);
	const decision = decide(previous, reading, policy);
	const summary = summarize(decision);
	const submission: Submission = { kind: SENTINEL_KIND, decision, summary };
	const outcome = await client.submit(decision.approval ? { ...submission, requiresApproval: true } : submission);
	return `${summary} → ${describeSubmitOutcome(outcome)}${note}`;
}

/** Applies the shock armed for this cycle, if any; a failed claim keeps the real price and is noted in the log line. */
async function withShock(client: RuntimeClient, price: PriceReading): Promise<{ reading: PriceReading; note: string }> {
	const shock = await client.claimShock();
	if (shock.kind === 'armed') return { reading: applyShock(price, shock.pct), note: '' };
	return { reading: price, note: shock.kind === 'failed' ? ` (shock claim failed: ${shock.reason})` : '' };
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
