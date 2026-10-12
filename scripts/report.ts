import { describeTransactionError, type SendResult } from 'pq-agent-guard';

/** Prints a sent transaction's outcome, CU, size and explorer link; returns whether it succeeded. */
export function reportSend(label: string, result: SendResult): boolean {
	const outcome = result.err === null ? 'ok' : describeTransactionError(result.err);
	console.log(`${label}: ${outcome}, ${result.computeUnits} CU, ${result.transactionBytes} B`);
	console.log(`  https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
	return result.err === null;
}
