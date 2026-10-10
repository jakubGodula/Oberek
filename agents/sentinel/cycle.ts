import { describeSubmitOutcome, type RuntimeClient } from '../shared/runtime-client';
import { decide, summarize, type Policy, type Previous, type PriceReading } from './policy';
import { previousFrom, SENTINEL_KIND } from './previous';

export interface CycleDeps {
	client: RuntimeClient;
	fetchPrice: () => Promise<PriceReading>;
	policy: Policy;
}

/** One cycle: last recorded decision → price → policy → submit. Returns the line to log; never throws. */
export async function runCycle({ client, fetchPrice, policy }: CycleDeps): Promise<string> {
	const latest = await client.latest();
	if (latest.kind === 'failed') return `skipped: last decision unavailable (${latest.reason})`;
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
	const decision = decide(previous, price, policy);
	const summary = summarize(decision);
	const outcome = await client.submit({ kind: SENTINEL_KIND, decision, summary });
	return `${summary} → ${describeSubmitOutcome(outcome)}`;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
