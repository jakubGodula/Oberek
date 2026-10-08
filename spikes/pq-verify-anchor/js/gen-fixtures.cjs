// Writes fresh noble ML-DSA-44 and Falcon-512 keys and signatures over one message for the Mollusk test.
const fs = require('fs');
const path = require('path');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const { falcon512padded } = require('@noble/post-quantum/falcon.js');

// Must match MLDSA_CONTEXT in programs/pq_verify/src/lib.rs. Falcon has no context: the message carries the domain.
const MLDSA_CONTEXT = new TextEncoder().encode('aegis:resume:v1');
const MESSAGE = new TextEncoder().encode('aegis:resume:v1 agent=7 nonce=42');

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });
const write = (name, bytes) => fs.writeFileSync(path.join(outDir, name), bytes);

const mlDsa = ml_dsa44.keygen();
write('mldsa.pk', mlDsa.publicKey);
write('mldsa.sig', ml_dsa44.sign(MESSAGE, mlDsa.secretKey, { context: MLDSA_CONTEXT }));
const falcon = falcon512padded.keygen();
write('falcon.pk', falcon.publicKey);
write('falcon.sig', falcon512padded.sign(MESSAGE, falcon.secretKey));
write('message.bin', MESSAGE);
console.log(`wrote noble fixtures to ${outDir}`);
