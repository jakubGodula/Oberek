// Sends noble-signed Falcon-512 verifications to the deployed upstream program on devnet:
// one valid (must succeed) and one with a tampered message (must fail on-chain with ERR_VERIFY_FAILED).
// Usage: node devnet-client.cjs <payer.json> <program id> <falcon.sk>
const fs = require('fs');
const {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, clusterApiUrl,
} = require('@solana/web3.js');
const { falcon512padded } = require('@noble/post-quantum/falcon.js');

const COMPUTE_UNIT_LIMIT = 195_000; // upstream's recommended budget for verify_with_prepared
const VERIFY_FAILED_ERROR = 3; // ERR_VERIFY_FAILED in upstream program/src/lib.rs
const VERIFY_INSTRUCTION_INDEX = 1; // after the compute budget instruction

const [payerPath, programIdBase58, falconSecretKeyPath] = process.argv.slice(2);
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(payerPath, 'utf8'))));
const programId = new PublicKey(programIdBase58);
const falconSecretKey = new Uint8Array(fs.readFileSync(falconSecretKeyPath));

const explorerUrl = (txSignature) => `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;

// Upstream instruction data layout: [falcon signature (666 B)][message].
function verifyInstruction(falconSignature, message) {
  return new TransactionInstruction({ programId, keys: [], data: Buffer.concat([falconSignature, message]) });
}

function programComputeUnits(logMessages) {
  const pattern = new RegExp(`^Program ${programId.toBase58()} consumed (\\d+) of`);
  const line = logMessages.find((log) => pattern.test(log));
  return line ? Number(line.match(pattern)[1]) : null;
}

// skipPreflight: the tampered transaction must land and fail on-chain, not be rejected by simulation.
async function sendAndFetch(instruction) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight })
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }), instruction);
  tx.sign(payer);
  const wire = tx.serialize();
  const txSignature = await connection.sendRawTransaction(wire, { skipPreflight: true });
  await connection.confirmTransaction({ signature: txSignature, blockhash, lastValidBlockHeight });
  const { meta } = await connection.getTransaction(txSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  return { txSignature, txBytes: wire.length, err: meta.err, computeUnits: programComputeUnits(meta.logMessages) };
}

const isVerifyFailed = (err) => err?.InstructionError?.[0] === VERIFY_INSTRUCTION_INDEX
  && err.InstructionError[1]?.Custom === VERIFY_FAILED_ERROR;

function report(label, result) {
  console.log(`${label}: err=${JSON.stringify(result.err)} cu=${result.computeUnits} tx=${result.txBytes} B`);
  console.log(`  ${explorerUrl(result.txSignature)}`);
}

async function main() {
  const message = new TextEncoder().encode(`aegis:devnet-test:v1:${new Date().toISOString()}`);
  const falconSignature = falcon512padded.sign(message, falconSecretKey);
  const tamperedMessage = Uint8Array.from(message);
  tamperedMessage[tamperedMessage.length - 1] ^= 1;

  const valid = await sendAndFetch(verifyInstruction(falconSignature, message));
  const tampered = await sendAndFetch(verifyInstruction(falconSignature, tamperedMessage));
  report('valid', valid);
  report('tampered', tampered);

  const passed = valid.err === null && isVerifyFailed(tampered.err);
  console.log(passed ? 'PASS: valid accepted, tampered rejected on devnet' : 'FAIL');
  process.exitCode = passed ? 0 : 1;
}

main();
