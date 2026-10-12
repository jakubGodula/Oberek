import { expect, test } from 'bun:test';
import { agentsServing, MIN_PAYER_LAMPORTS, preflightProblems, type PreflightFacts } from './preflight-checks';

const TEST_SERVER = 'http://localhost:5174';

const ready: PreflightFacts = {
	keypairs: [
		{ variable: 'FEE_PAYER_KEYPAIR', path: 'keys/payer.json', exists: true },
		{ variable: 'OWNER_KEYPAIR', path: 'keys/payer.json', exists: true }
	],
	missingAgents: [],
	payerLamports: MIN_PAYER_LAMPORTS,
	leftoverAgentPids: []
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

test('points agent processes left by an earlier run at the command that stops them', () => {
	const problems = preflightProblems({ ...ready, leftoverAgentPids: [4100, 4200] });
	expect(problems).toEqual([
		'agent processes of an earlier run still use the test server (pids 4100, 4200): stop them with kill 4100 4200'
	]);
});

test('finds the agent processes pointed at the test server, by their environment', () => {
	const processes = [
		{ pid: 1, environ: `PATH=/bin\0TICK_API_URL=${TEST_SERVER}\0` },
		{ pid: 2, environ: `SENTINEL_API_URL=${TEST_SERVER}` },
		{ pid: 3, environ: 'TICK_API_URL=http://localhost:5173' },
		{ pid: 4, environ: `NOTE=TICK_API_URL=${TEST_SERVER}` }
	];
	expect(agentsServing(processes, TEST_SERVER)).toEqual([1, 2]);
});
