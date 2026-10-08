// Sends noble ML-DSA-44 instructions to the deployed upstream example program on devnet as V1 transactions:
// register a fresh key (create its account + prepare the key), then verify a valid signature (must succeed) and
// the same signature over a tampered message (must fail on-chain with Custom(1)).
// Usage: node devnet-client.cjs <payer.json> <program id>
const fs = require('fs');
const {
  AccountRole, address, appendTransactionMessageInstructions, createKeyPairSignerFromBytes, createSolanaRpc,
  createSolanaRpcSubscriptions, createTransactionMessage, generateKeyPairSigner, getSignatureFromTransaction,
  getTransactionSize, pipe, sendAndConfirmTransactionFactory, setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageLoadedAccountsDataSizeLimit, setTransactionMessagePriorityFeeLamports,
  signTransactionMessageWithSigners,
} = require('@solana/kit');
const { getCreateAccountInstruction } = require('@solana-program/system');
const { ml_dsa44 } = require('@noble/post-quantum/ml-dsa.js');

const RPC_URL = 'https://api.devnet.solana.com';
const RPC_SUBSCRIPTIONS_URL = 'wss://api.devnet.solana.com';
// Same CU limit and priority fee as the Mollusk test, so transaction sizes are comparable.
const COMPUTE_UNIT_LIMIT = 1_400_000;
const PRIORITY_FEE_LAMPORTS = 10_000n;
// Unlike legacy, V1 budgets zero bytes when unset (devnet: MaxLoadedAccountsDataSizeExceeded). Both
// transactions load the 336 KB program data; verify also loads the 20.5 KB key account.
const LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 512 * 1024;
// getTransaction can return null for a few seconds after the send is confirmed.
const LEDGER_POLL_ATTEMPTS = 20;
const LEDGER_POLL_INTERVAL_MS = 1000;
// From upstream program/src/lib.rs: KEY_ACCOUNT_LEN, CONTEXT, instruction tags and the verify error.
const KEY_ACCOUNT_LEN = 20_552n;
const PROGRAM_CONTEXT = new TextEncoder().encode('solana-ml-dsa');
const TAG_REGISTER_SHAKE = 0;
const TAG_VERIFY_SHAKE = 1;
const VERIFY_FAILED_ERROR = 1;
const VERIFY_INSTRUCTION_INDEX = 0; // V1 carries the CU limit in its config, not in a compute budget instruction

const [payerPath, programIdBase58] = process.argv.slice(2);
const programAddress = address(programIdBase58);
const rpc = createSolanaRpc(RPC_URL);
const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc, rpcSubscriptions: createSolanaRpcSubscriptions(RPC_SUBSCRIPTIONS_URL),
});

const explorerUrl = (txSignature) => `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
const toJson = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v));

async function loadPayer() {
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(fs.readFileSync(payerPath, 'utf8'))));
}

function programInstruction(tag, payload, keyAccountMeta) {
  return { programAddress, accounts: [keyAccountMeta], data: Uint8Array.of(tag, ...payload) };
}

// Upstream layout: allocation is a preceding top-level System Program instruction; [0][public key: 1312].
async function registerInstructions(payer, keyAccount, publicKey) {
  const lamports = await rpc.getMinimumBalanceForRentExemption(KEY_ACCOUNT_LEN).send();
  return [
    getCreateAccountInstruction({ payer, newAccount: keyAccount, lamports, space: KEY_ACCOUNT_LEN, programAddress }),
    programInstruction(TAG_REGISTER_SHAKE, publicKey,
      { address: keyAccount.address, role: AccountRole.WRITABLE_SIGNER, signer: keyAccount }),
  ];
}

// Upstream layout: [1][signature: 2420][message], read-only key account.
function verifyInstruction(keyAccount, signature, message) {
  return programInstruction(TAG_VERIFY_SHAKE, [...signature, ...message],
    { address: keyAccount.address, role: AccountRole.READONLY });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchLandedTransaction(txSignature) {
  for (let attempt = 0; attempt < LEDGER_POLL_ATTEMPTS; attempt++) {
    const landed = await rpc.getTransaction(txSignature, {
      commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 1,
    }).send();
    if (landed) return landed;
    await sleep(LEDGER_POLL_INTERVAL_MS);
  }
  return null;
}

// skipPreflight: the tampered verification must land and fail on-chain, not be rejected by simulation.
// The send rejects when the transaction fails on-chain, so the outcome is read back from the ledger.
async function sendV1AndFetch(payer, instructions) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => setTransactionMessageComputeUnitLimit(COMPUTE_UNIT_LIMIT, m),
    (m) => setTransactionMessagePriorityFeeLamports(PRIORITY_FEE_LAMPORTS, m),
    (m) => setTransactionMessageLoadedAccountsDataSizeLimit(LOADED_ACCOUNTS_DATA_SIZE_LIMIT, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  const txSignature = getSignatureFromTransaction(transaction);
  const sendError = await sendAndConfirm(transaction, { commitment: 'confirmed', skipPreflight: true })
    .then(() => null, (error) => error);
  const landed = await fetchLandedTransaction(txSignature);
  if (!landed) throw sendError ?? new Error(`transaction ${txSignature} not found`);
  return {
    txSignature,
    txBytes: getTransactionSize(transaction),
    version: landed.version,
    err: landed.meta.err,
    computeUnits: landed.meta.computeUnitsConsumed,
  };
}

const isVerifyFailed = (err) => Number(err?.InstructionError?.[0]) === VERIFY_INSTRUCTION_INDEX
  && Number(err.InstructionError[1]?.Custom) === VERIFY_FAILED_ERROR;

function report(label, result) {
  console.log(`${label}: err=${toJson(result.err)} cu=${result.computeUnits} tx=${result.txBytes} B version=${result.version}`);
  console.log(`  ${explorerUrl(result.txSignature)}`);
}

async function main() {
  const payer = await loadPayer();
  const keyAccount = await generateKeyPairSigner();
  const mlDsaKeys = ml_dsa44.keygen();
  const message = new TextEncoder().encode(`aegis:devnet-test:v1:${new Date().toISOString()}`);
  const signature = ml_dsa44.sign(message, mlDsaKeys.secretKey, { context: PROGRAM_CONTEXT });
  const tamperedMessage = Uint8Array.from(message);
  tamperedMessage[tamperedMessage.length - 1] ^= 1;
  console.log(`key account: ${keyAccount.address}, message: ${message.length} B`);

  const registered = await sendV1AndFetch(payer, await registerInstructions(payer, keyAccount, mlDsaKeys.publicKey));
  report('register (create account + prepare key)', registered);
  if (registered.err !== null) {
    console.log('FAIL: register');
    process.exitCode = 1;
    return;
  }
  const valid = await sendV1AndFetch(payer, [verifyInstruction(keyAccount, signature, message)]);
  const tampered = await sendV1AndFetch(payer, [verifyInstruction(keyAccount, signature, tamperedMessage)]);
  report('verify valid', valid);
  report('verify tampered message', tampered);

  const passed = valid.err === null && isVerifyFailed(tampered.err);
  console.log(passed ? 'PASS: V1 register + valid verify accepted, tampered rejected on devnet' : 'FAIL');
  process.exitCode = passed ? 0 : 1;
}

main();
