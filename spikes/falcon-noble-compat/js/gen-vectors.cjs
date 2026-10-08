// Generates Falcon-512 test vectors with @noble/post-quantum for the Rust verifier.
const fs = require('fs');
const { falcon512, falcon512padded } = require('@noble/post-quantum/falcon.js');
const { randomBytes } = require('@noble/post-quantum/utils.js');

const VECTOR_COUNT = 200;
const SIGNATURE_LEN = 666;
const hex = (b) => Buffer.from(b).toString('hex');
const padTo = (sig, len) => { const out = new Uint8Array(len); out.set(sig); return out; };

const keys = falcon512.keygen();
const vectors = [];
for (let i = 0; i < VECTOR_COUNT; i++) {
  const msg = randomBytes(1 + (i % 64));
  const usePadded = i % 2 === 0;
  const sig = usePadded
    ? falcon512padded.sign(msg, keys.secretKey)
    : padTo(falcon512.sign(msg, keys.secretKey), SIGNATURE_LEN);
  vectors.push({ variant: usePadded ? 'padded' : 'compressed+zeropad', msg: hex(msg), sig: hex(sig) });
}
fs.writeFileSync(process.argv[2], JSON.stringify({ pk: hex(keys.publicKey), vectors }));
console.log(`wrote ${vectors.length} vectors`);
