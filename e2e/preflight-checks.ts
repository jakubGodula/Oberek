// What would make an e2e run fail for reasons outside the code under test, found before any test starts. Pure: the
// facts come from e2e/preflight.ts.
import { API_URL_VARIABLES } from './agent-process';

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
	/** Agent processes still pointed at the test server, left by a run that was killed before its teardown. */
	leftoverAgentPids: number[];
}

/** A process as /proc shows it: its environment is NUL-separated NAME=value entries. */
export interface ProcessFact {
	pid: number;
	environ: string;
}

export function preflightProblems({
	keypairs,
	missingAgents,
	payerLamports,
	leftoverAgentPids
}: PreflightFacts): string[] {
	const problems = keypairs.filter((keypair) => !keypair.exists).map(describeMissingKeypair);
	if (missingAgents.length > 0) {
		problems.push(`the test fleet lacks ${missingAgents.join(', ')}: run bun scripts/setup.ts --e2e`);
	}
	if (payerLamports !== null && payerLamports < MIN_PAYER_LAMPORTS) {
		problems.push(`the fee payer has ${payerLamports} lamports, below ${MIN_PAYER_LAMPORTS}: fund it on devnet`);
	}
	if (leftoverAgentPids.length > 0) {
		const pids = leftoverAgentPids.join(', ');
		const stop = `kill ${leftoverAgentPids.join(' ')}`;
		problems.push(`agent processes of an earlier run still use the test server (pids ${pids}): stop them with ${stop}`);
	}
	return problems;
}

/** The processes whose environment points an agent at `apiUrl`. */
export function agentsServing(processes: readonly ProcessFact[], apiUrl: string): number[] {
	const entries = Object.values(API_URL_VARIABLES).map((variable) => `${variable}=${apiUrl}`);
	return processes
		.filter(({ environ }) => environ.split('\0').some((entry) => entries.includes(entry)))
		.map(({ pid }) => pid);
}

function describeMissingKeypair({ variable, path }: KeypairFact): string {
	return path ? `${variable} in .env names ${path}, which does not exist` : `${variable} is not set in .env`;
}
