import {
	appendTransactionMessageInstructions,
	assertIsSendableTransaction,
	assertIsTransactionWithBlockhashLifetime,
	createSolanaRpc,
	createSolanaRpcSubscriptions,
	createTransactionMessage,
	getSignatureFromTransaction,
	getTransactionSize,
	pipe,
	sendAndConfirmTransactionFactory,
	setTransactionMessageComputeUnitLimit,
	setTransactionMessageFeePayerSigner,
	setTransactionMessageLifetimeUsingBlockhash,
	setTransactionMessageLoadedAccountsDataSizeLimit,
	setTransactionMessagePriorityFeeLamports,
	signTransactionMessageWithSigners,
	type Instruction,
	type Rpc,
	type Signature,
	type SolanaRpcApi,
	type TransactionSigner
} from '@solana/kit';

// V1 transactions (needed for the ~2.7 KB ML-DSA-44 signatures), pattern from
// spikes/mldsa44-dilithium-noble-compat/js/devnet-client.cjs.

/** V1 budgets zero bytes when unset. Covers the ~423 KB program data plus the 20.5 KB key account. */
const LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 512 * 1024;
const PRIORITY_FEE_LAMPORTS = 10_000n;
// getTransaction can return null for a few seconds after the send is confirmed.
const LEDGER_POLL_ATTEMPTS = 20;
const LEDGER_POLL_INTERVAL_MS = 1000;

export interface SolanaConnection {
	rpc: Rpc<SolanaRpcApi>;
	sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>;
}

export interface SendResult {
	signature: Signature;
	/** `null` when the transaction succeeded, otherwise the on-chain error. */
	err: unknown;
	computeUnits: bigint | null;
	transactionBytes: number;
}

export function connect(rpcUrl: string, rpcSubscriptionsUrl: string): SolanaConnection {
	const rpc = createSolanaRpc(rpcUrl);
	const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
	return { rpc, sendAndConfirm: sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions }) };
}

/**
 * Sends one V1 transaction and reads its outcome from the ledger. skipPreflight lets a failing transaction land, so a
 * program error comes back as `err` (with its CU) instead of a simulation exception.
 */
export async function sendV1(
	connection: SolanaConnection,
	feePayer: TransactionSigner,
	instructions: readonly Instruction[],
	computeUnitLimit: number
): Promise<SendResult> {
	const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();
	const message = pipe(
		createTransactionMessage({ version: 1 }),
		(m) => setTransactionMessageFeePayerSigner(feePayer, m),
		(m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
		(m) => setTransactionMessageComputeUnitLimit(computeUnitLimit, m),
		(m) => setTransactionMessagePriorityFeeLamports(PRIORITY_FEE_LAMPORTS, m),
		(m) => setTransactionMessageLoadedAccountsDataSizeLimit(LOADED_ACCOUNTS_DATA_SIZE_LIMIT, m),
		(m) => appendTransactionMessageInstructions(instructions, m)
	);
	const transaction = await signTransactionMessageWithSigners(message);
	assertIsSendableTransaction(transaction);
	assertIsTransactionWithBlockhashLifetime(transaction);
	const signature = getSignatureFromTransaction(transaction);
	const sendError = await connection
		.sendAndConfirm(transaction, { commitment: 'confirmed', skipPreflight: true })
		.then(
			() => null,
			(error: unknown) => error
		);
	const landed = await fetchLandedTransaction(connection.rpc, signature);
	if (!landed) throw sendError ?? new Error(`transaction ${signature} not found`);
	return {
		signature,
		err: landed.meta?.err ?? null,
		computeUnits: landed.meta?.computeUnitsConsumed ?? null,
		transactionBytes: getTransactionSize(transaction)
	};
}

async function fetchLandedTransaction(rpc: Rpc<SolanaRpcApi>, signature: Signature) {
	for (let attempt = 0; attempt < LEDGER_POLL_ATTEMPTS; attempt++) {
		const landed = await rpc
			.getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 1 })
			.send();
		if (landed) return landed;
		await new Promise((resolve) => setTimeout(resolve, LEDGER_POLL_INTERVAL_MS));
	}
	return null;
}
