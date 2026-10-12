// What would make an e2e run fail for reasons outside the code under test, found before any test starts. Pure: the
// facts come from e2e/preflight.ts.

/** 0.01 SOL: a run is about a dozen devnet steps of ~15,000 lamports each, with room to spare. */
export const MIN_PAYER_LAMPORTS = 10_000_000n;

export interface KeypairFact {
	variable: string;
	path: string | undefined;
	exists: boolean;
}

export interface PreflightFacts {
	keypairs: KeypairFact[];
	/** Test-fleet agents without their on-chain identity file. */
	missingAgents: string[];
	/** null when the payer could not be read (its keypair problem is reported instead). */
	payerLamports: bigint | null;
}

export function preflightProblems({ keypairs, missingAgents, payerLamports }: PreflightFacts): string[] {
	const problems = keypairs.filter((keypair) => !keypair.exists).map(describeMissingKeypair);
	if (missingAgents.length > 0) {
		problems.push(`the test fleet lacks ${missingAgents.join(', ')}: run bun scripts/setup.ts --e2e`);
	}
	if (payerLamports !== null && payerLamports < MIN_PAYER_LAMPORTS) {
		problems.push(`the fee payer has ${payerLamports} lamports, below ${MIN_PAYER_LAMPORTS}: fund it on devnet`);
	}
	return problems;
}

function describeMissingKeypair({ variable, path }: KeypairFact): string {
	return path ? `${variable} in .env names ${path}, which does not exist` : `${variable} is not set in .env`;
}
