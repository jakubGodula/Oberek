import { expect, test } from 'bun:test';
import { MIN_PAYER_LAMPORTS, preflightProblems, type PreflightFacts } from './preflight-checks';

const ready: PreflightFacts = {
	keypairs: [
		{ variable: 'FEE_PAYER_KEYPAIR', path: 'keys/payer.json', exists: true },
		{ variable: 'OWNER_KEYPAIR', path: 'keys/payer.json', exists: true }
	],
	missingAgents: [],
	payerLamports: MIN_PAYER_LAMPORTS
};

test('finds nothing when the keys, the test fleet and the funds are there', () => {
	expect(preflightProblems(ready)).toEqual([]);
});

test('names the variable and the path of a keypair file that does not exist', () => {
	const problems = preflightProblems({
		...ready,
		keypairs: [{ variable: 'FEE_PAYER_KEYPAIR', path: 'spikes/x/.devnet/payer.json', exists: false }]
	});
	expect(problems).toEqual(['FEE_PAYER_KEYPAIR in .env names spikes/x/.devnet/payer.json, which does not exist']);
});

test('reports a keypair variable that is not set', () => {
	const problems = preflightProblems({
		...ready,
		keypairs: [{ variable: 'OWNER_KEYPAIR', path: undefined, exists: false }]
	});
	expect(problems).toEqual(['OWNER_KEYPAIR is not set in .env']);
});

test('points a missing test fleet at the setup command', () => {
	const problems = preflightProblems({ ...ready, missingAgents: ['sentinel-01', 'tick-01'] });
	expect(problems).toEqual(['the test fleet lacks sentinel-01, tick-01: run bun scripts/setup.ts --e2e']);
});

test('reports a payer below the minimum, and only then', () => {
	expect(preflightProblems({ ...ready, payerLamports: MIN_PAYER_LAMPORTS - 1n })).toHaveLength(1);
	expect(preflightProblems({ ...ready, payerLamports: null })).toEqual([]);
});
