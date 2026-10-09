// Writes a fresh noble ML-DSA-44 key and signatures for the Mollusk tests in
// onchain/programs/onchain_agent_guard/tests/guard.rs. Called by onchain/run-tests.sh.
// Usage: bun scripts/gen-guard-fixtures.ts <program id> <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { address, getAddressDecoder } from '@solana/kit';
import { findAgentAddress } from '../src/lib/server/modules/agent/instructions';
import { resumeMessage, signGuardMessage, stepMessage } from '../src/lib/server/modules/agent/message';

// Must match OWNER, AGENT_KEY and decision_hash() in guard.rs.
const OWNER = getAddressDecoder().decode(new Uint8Array(32).fill(2));
const AGENT_KEY = getAddressDecoder().decode(new Uint8Array(32).fill(3));
const STEP_COUNTERS = [1n, 2n, 3n];
const RESUME_COUNTER = 2n;
const decisionHash = (counter: bigint) => new Uint8Array(32).fill(Number(counter));

const [programId, outDir] = process.argv.slice(2);
if (!programId || !outDir) {
	console.error('Usage: bun scripts/gen-guard-fixtures.ts <program id> <out dir>');
	process.exit(2);
}

const agent = await findAgentAddress(address(programId), OWNER, AGENT_KEY);
const keys = ml_dsa44.keygen();
mkdirSync(outDir, { recursive: true });
const write = (name: string, bytes: Uint8Array) => writeFileSync(join(outDir, name), bytes);

write('agent-key.pk', keys.publicKey);
for (const counter of STEP_COUNTERS) {
	write(`step-${counter}.sig`, signGuardMessage(stepMessage(agent, counter, decisionHash(counter)), keys.secretKey));
}
write(`resume-${RESUME_COUNTER}.sig`, signGuardMessage(resumeMessage(agent, RESUME_COUNTER), keys.secretKey));
console.log(`wrote guard fixtures for agent ${agent} to ${outDir}`);
