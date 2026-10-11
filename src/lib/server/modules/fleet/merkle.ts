import { createHash } from 'crypto';

// The Merkle tree over a batch of decisions recorded with one record_batch. Leaves and nodes are domain-separated, so
// a leaf never passes for a node; an odd node at the end of a level moves up unchanged (no duplication, so two
// different lists of decisions never share a root). Hex in, hex out, like the decision log.

const LEAF_PREFIX = Buffer.from([0]);
const NODE_PREFIX = Buffer.from([1]);

/** The sibling's hash and on which side of the path it sits. */
export interface ProofStep {
	hash: string;
	side: 'left' | 'right';
}

const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest('hex');
const leafOf = (decisionHash: string) => sha256(LEAF_PREFIX, Buffer.from(decisionHash, 'hex'));
const nodeOf = (left: string, right: string) => sha256(NODE_PREFIX, Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

export function merkleRoot(decisionHashes: readonly string[]): string {
	return levels(decisionHashes).at(-1)![0];
}

/** The siblings on the path from the decision at `index` to the root, bottom to top. */
export function merkleProof(decisionHashes: readonly string[], index: number): ProofStep[] {
	if (!Number.isInteger(index) || index < 0 || index >= decisionHashes.length) {
		throw new RangeError(`index ${index} is outside a batch of ${decisionHashes.length}`);
	}
	const proof: ProofStep[] = [];
	let position = index;
	for (const level of levels(decisionHashes).slice(0, -1)) {
		const sibling = position ^ 1;
		// A node without a sibling moves up unchanged and adds no step.
		if (sibling < level.length) proof.push({ hash: level[sibling], side: sibling < position ? 'left' : 'right' });
		position = Math.floor(position / 2);
	}
	return proof;
}

export function verifyProof(decisionHash: string, proof: readonly ProofStep[], root: string): boolean {
	const computed = proof.reduce(
		(hash, step) => (step.side === 'left' ? nodeOf(step.hash, hash) : nodeOf(hash, step.hash)),
		leafOf(decisionHash)
	);
	return computed === root;
}

/** Every level of the tree, leaves first, root last. */
function levels(decisionHashes: readonly string[]): string[][] {
	if (decisionHashes.length === 0) throw new RangeError('a batch holds at least one decision');
	const all = [decisionHashes.map(leafOf)];
	while (all.at(-1)!.length > 1) all.push(parentsOf(all.at(-1)!));
	return all;
}

function parentsOf(level: readonly string[]): string[] {
	const parents: string[] = [];
	for (let i = 0; i < level.length; i += 2) parents.push(i + 1 < level.length ? nodeOf(level[i], level[i + 1]) : level[i]);
	return parents;
}
