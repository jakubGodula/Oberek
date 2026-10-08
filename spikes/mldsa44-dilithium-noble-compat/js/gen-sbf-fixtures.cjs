// Writes a fresh noble ML-DSA-44 key and a signature over a fixed message for the Mollusk test.
// The context must match upstream's example program (`CONTEXT` in program/src/lib.rs).
const fs = require('fs');
const path = require('path');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');

const PROGRAM_CONTEXT = new TextEncoder().encode('solana-ml-dsa');
const MESSAGE = new TextEncoder().encode('aegis:resume:v1 agent=7 nonce=42');

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });
const keys = ml_dsa44.keygen();
const sig = ml_dsa44.sign(MESSAGE, keys.secretKey, { context: PROGRAM_CONTEXT });
fs.writeFileSync(path.join(outDir, 'noble.pk'), keys.publicKey);
fs.writeFileSync(path.join(outDir, 'noble.sig'), sig);
fs.writeFileSync(path.join(outDir, 'noble.msg'), MESSAGE);
console.log(`wrote noble fixtures to ${outDir}`);
