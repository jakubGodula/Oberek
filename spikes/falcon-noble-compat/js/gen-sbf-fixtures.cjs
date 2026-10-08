// Writes a noble-generated Falcon-512 keypair and signature in the fixture layout
// read by upstream solana-falcon512 program/tests/tests.rs.
const fs = require('fs');
const path = require('path');
const { falcon512padded } = require('@noble/post-quantum/falcon.js');

// Must match MSG in upstream program/tests/tests.rs.
const UPSTREAM_TEST_MESSAGE = new TextEncoder().encode('deterministic falcon-512 verify benchmark');

const outDir = process.argv[2];
const keys = falcon512padded.keygen();
const signature = falcon512padded.sign(UPSTREAM_TEST_MESSAGE, keys.secretKey);

fs.writeFileSync(path.join(outDir, 'falcon.pk'), keys.publicKey);
fs.writeFileSync(path.join(outDir, 'falcon.sk'), keys.secretKey);
fs.writeFileSync(path.join(outDir, 'sample_sig.bin'), signature);
console.log(`wrote noble pk (${keys.publicKey.length} B) and signature (${signature.length} B) to ${outDir}`);
