// Generates ML-DSA-44 test vectors with @noble/post-quantum for the Rust verifier.
const fs = require('fs');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');
const { randomBytes } = require('@noble/post-quantum/utils.js');

const VECTOR_COUNT = 200;
const MAX_MESSAGE_LEN = 300;
const CONTEXT = new TextEncoder().encode('aegis:resume:v1');
const hex = (b) => Buffer.from(b).toString('hex');

const keys = ml_dsa44.keygen();
const vectors = [];
for (let i = 0; i < VECTOR_COUNT; i++) {
  const msg = randomBytes(1 + (i * 7) % MAX_MESSAGE_LEN);
  const context = i % 2 === 0 ? CONTEXT : new Uint8Array(0);
  const sig = ml_dsa44.sign(msg, keys.secretKey, { context });
  vectors.push({ msg: hex(msg), context: hex(context), sig: hex(sig) });
}
fs.writeFileSync(process.argv[2], JSON.stringify({ pk: hex(keys.publicKey), vectors }));
console.log(`wrote ${vectors.length} vectors`);
