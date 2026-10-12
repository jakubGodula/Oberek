import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getAddressEncoder, getU32Encoder, getU64Encoder, type Address } from '@solana/kit';

// The bytes the agent's and the owner's ML-DSA-44 keys sign. Must match onchain/programs/onchain_agent_guard/src/message.rs; both
// sides are checked against onchain/fixtures/message-vector.json.

/** FIPS 204 context string (domain separation); the program verifies with the same one. */
export const GUARD_CONTEXT = new TextEncoder().encode('onchain-agent-guard:v1');
export const DECISION_HASH_LENGTH = 32;
const STEP_TAG = 1;
const RESUME_TAG = 2;
const BATCH_TAG = 3;
const ACTIVATE_TAG = 4;
/** Activation happens once, while the agent's counter is still 0. */
const ACTIVATION_COUNTER = 0n;

function header(tag: number, agent: Address, counter: bigint): Uint8Array {
	return Uint8Array.from([tag, ...getAddressEncoder().encode(agent), ...getU64Encoder().encode(counter)]);
}

/** Message for the step that moves the agent's counter to `counter`. */
export function stepMessage(agent: Address, counter: bigint, decisionHash: Uint8Array): Uint8Array {
	if (decisionHash.length !== DECISION_HASH_LENGTH) {
		throw new RangeError(`decision hash must be ${DECISION_HASH_LENGTH} bytes, got ${decisionHash.length}`);
	}
	return Uint8Array.from([...header(STEP_TAG, agent, counter), ...decisionHash]);
}

/** Message for the resume that moves the agent's counter to `counter`. */
export function resumeMessage(agent: Address, counter: bigint): Uint8Array {
	return header(RESUME_TAG, agent, counter);
}

/** Message for the batch of `size` decisions with Merkle root `root` that moves the agent's counter to `counter`. */
export function batchMessage(agent: Address, counter: bigint, root: Uint8Array, size: number): Uint8Array {
	if (root.length !== DECISION_HASH_LENGTH) {
		throw new RangeError(`batch root must be ${DECISION_HASH_LENGTH} bytes, got ${root.length}`);
	}
	return Uint8Array.from([...header(BATCH_TAG, agent, counter), ...root, ...getU32Encoder().encode(size)]);
}

/** Message the owner's ML-DSA-44 key signs to activate a registered agent. */
export function activateMessage(agent: Address): Uint8Array {
	return header(ACTIVATE_TAG, agent, ACTIVATION_COUNTER);
}

export function signGuardMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
	return ml_dsa44.sign(message, secretKey, { context: GUARD_CONTEXT });
}
