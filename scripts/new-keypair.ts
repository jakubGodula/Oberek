// Writes a new Solana keypair in the solana-keygen file format (JSON array of the 64 secret key bytes), for machines
// without the Solana CLI. Refuses to overwrite: the file may be a funded wallet.
// Usage: bun scripts/new-keypair.ts <file>
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Keypair } from '@solana/web3.js';

const OWNER_READ_WRITE = 0o600;

const [path] = process.argv.slice(2);
if (!path) {
	console.error('Usage: bun scripts/new-keypair.ts <file>');
	process.exit(1);
}
const keypair = Keypair.generate();
mkdirSync(dirname(path), { recursive: true });
try {
	writeFileSync(path, JSON.stringify([...keypair.secretKey]), { mode: OWNER_READ_WRITE, flag: 'wx' });
} catch {
	console.error(`${path} already exists (or cannot be written); not overwritten`);
	process.exit(1);
}
console.log(`${keypair.publicKey.toBase58()} saved to ${path}`);
