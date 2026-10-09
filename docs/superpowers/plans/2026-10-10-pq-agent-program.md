# PQ-signed agent (onchain_agent_guard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One agent on devnet whose every step and every resume is authorized by an ML-DSA-44 signature verified on-chain by the Anchor program `onchain_agent_guard`, while the owner's Ed25519 wallet alone can kill it.

**Architecture:** An Anchor workspace in `onchain/` holds the program (two accounts: an immutable 20,552 B `AgentKey` with the prepared ML-DSA-44 key, a small `Agent` PDA with owner, status, counter and last decision; four instructions). A TypeScript module in `src/lib/server/modules/agent/` builds the same signed messages, the instructions and V1 transactions on `@solana/kit`, and runs the agent cycle. Bun scripts in `scripts/` give the owner CLI, the agent loop process and a devnet end-to-end check.

**Tech Stack:** Anchor 1.2.1, Agave 4.3.0 (Docker only), solana-ml-dsa (git rev below), Mollusk 0.16.0, Bun 1.4.2, TypeScript, `@solana/kit` 8.4.0, `@solana-program/system` 0.15.0, `@noble/post-quantum` 0.7.x.

**Spec:** `docs/superpowers/specs/2026-10-10-pq-agent-program-design.md`

**Deviations from the spec (small, decided while planning):**
- The agent's ML-DSA-44 secret key lives in one agent file (`AGENT_FILE`, default `.devnet/agent.json`) together with the owner, agent key and Agent addresses, instead of a separate key file path.
- An extra program error `InvalidKeyAccount` (key account bytes cannot be read as a prepared key), as in the spike.
- Extra small TS files beyond the spec's table: `decision.ts`, `guard-errors.ts`, `guard-client.ts`, `files.ts`, `cycle-ports.ts`, and `scripts/report.ts`, to keep each file to one responsibility.

## Global Constraints

- Work on branch `first_agent` in `/storage1/mydes/SolanaHackaton`. Commit messages carry **no** `Co-Authored-By` trailer (user's global CLAUDE.md).
- Do not modify `README.md`, `src/lib/server/modules/solana-blink/blink.service.ts`, `src/lib/server/modules/zk-pqc/pqc-crypto.service.ts`.
- Solana toolchain runs only in Docker (host glibc 2.31): images `falcon-sbf` (`spikes/falcon-noble-compat/Dockerfile.sbf`, Agave 4.3.0) and `pq-verify-anchor` (`spikes/pq-verify-anchor/Dockerfile.anchor`, Anchor CLI 1.2.1).
- Anchor 1.2.1, SBPF v3 (Anchor's default). `overflow-checks = false` only for the `solana-ml-dsa` package. `Cargo.lock` committed. `[programs.localnet]` kept in `Anchor.toml`. Build output must not contain `overflows the maximum allowed frame space`.
- `solana-ml-dsa` = `https://github.com/blueshift-gg/solana-ml-dsa`, rev `e61fac4920bd7ca21464ab4ed04afa2259227e0d`, SHAKE mode `VerifyingKey<false>` (FIPS 204, compatible with noble `ml_dsa44`).
- FIPS 204 context string: `onchain-agent-guard:v1` (program and client).
- Signed message: `tag (u8: 1 = step, 2 = resume) ‖ Agent address (32 B) ‖ new counter = counter + 1 (u64 LE) ‖ decision_hash (32 B, step only)`.
- `Agent` PDA seeds: `["agent", owner, agent_key]`. `AgentKey` account size: 20,552 B (8 B discriminator + 20,544 B prepared key).
- Every transaction is V1 and sets an explicit compute unit limit and loaded accounts data size limit (512 KiB). Register: 1,400,000 CU; record_step and resume: 400,000 CU; kill: 50,000 CU. Priority fee 10,000 lamports.
- TS tests: `~/.bun/bin/bun test src` from the repo root. Rust tests: `onchain/run-tests.sh`.
- Devnet payer: `spikes/falcon-noble-compat/.devnet/payer.json` (`ftbM4rfEotUq8EvPc6kJ1yBJ6iivjiok37sQwAoJ5cq`, ~7.39 SOL).

## Review Focus

1. `bun scripts/agent.ts register` when `.devnet/agent.json` already exists: must refuse before sending anything, because the file holds the only copy of an agent's ML-DSA-44 secret key (test in Task 7, `files.test.ts`).
2. RPC unreachable or `readAgent` throwing mid-loop: the cycle logs the error, returns `'failed'`, and the loop keeps ticking (test in Task 6, `agent-loop.test.ts`).
3. Wrong `GUARD_PROGRAM_ID` or an address that is not an `Agent` account: decoding must fail with a clear message instead of returning garbage state (test in Task 2, `instructions.test.ts`).
4. Transaction errors carrying `bigint` values (e.g. `{ Custom: 6000n }`) written to the decision log or printed: must not throw (tests in Task 2, `guard-errors.test.ts`, and Task 7, `files.test.ts`).
5. A decision hash that is not 32 bytes: `stepMessage` must throw instead of signing a message the program will never build (test in Task 1, `message.test.ts`).

## File Structure

```
onchain/
  Anchor.toml, Cargo.toml, Cargo.lock        Anchor workspace (toolchain settings from the spike)
  toolchain.sh                               Docker image build + `toolchain` runner, sourced by the scripts below
  run-tests.sh                               build, copy IDL, write fixtures, run Mollusk tests
  deploy-devnet.sh                           build and deploy/upgrade on devnet
  README.md                                  how to test and deploy; devnet results
  fixtures/message-vector.json               shared TS/Rust message test vector
  programs/onchain_agent_guard/
    Cargo.toml
    src/lib.rs        instructions + account contexts + signature verification
    src/state.rs      Agent, AgentKey, AgentStatus, events, AGENT_SEED
    src/error.rs      GuardError
    src/message.rs    signed message bytes + CONTEXT
    tests/guard.rs           Mollusk tests (instructions)
    tests/message_vector.rs  message parity test
    tests/fixtures/          generated, gitignored
src/lib/server/modules/agent/
  message.ts            signed message bytes, context, signing
  instructions.ts       discriminators, PDA, instruction builders, Agent decoding
  guard-errors.ts       GuardError codes, transaction error parsing/description
  onchain_agent_guard.idl.json   copied from `anchor build` by run-tests.sh
  decision.ts           tick decision record + canonical hash
  agent-loop.ts         one cycle + loop, dependencies injected (CyclePorts)
  transaction.ts        RPC connection + send V1 transaction, read outcome
  guard-client.ts       program operations: fetch, register, step, kill, resume
  files.ts              agent file, keypair file, JSONL append
  config.ts             environment → AgentConfig
  cycle-ports.ts        wires CyclePorts to guard-client and files
scripts/
  gen-guard-fixtures.ts  noble key + signatures for the Mollusk tests
  report.ts              prints a SendResult (shared by the two scripts below)
  agent.ts               CLI: register | run | kill | resume | status
  devnet-e2e.ts          devnet end-to-end check with assertions
.env.example, .gitignore (modified)
```

---

### Task 1: Signed message format (TypeScript) and shared test vector

**Files:**
- Modify: `package.json`, `bun.lock` (dependencies)
- Create: `onchain/fixtures/message-vector.json`
- Create: `src/lib/server/modules/agent/message.ts`
- Test: `src/lib/server/modules/agent/message.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GUARD_CONTEXT: Uint8Array` (`onchain-agent-guard:v1`)
  - `DECISION_HASH_LENGTH = 32`
  - `stepMessage(agent: Address, counter: bigint, decisionHash: Uint8Array): Uint8Array` — `counter` is the new value (current + 1)
  - `resumeMessage(agent: Address, counter: bigint): Uint8Array`
  - `signGuardMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array`

- [ ] **Step 1: Add dependencies**

Run: `cd /storage1/mydes/SolanaHackaton && ~/.bun/bin/bun add --exact @solana/kit@8.4.0 @solana-program/system@0.15.0`
Expected: `package.json` `dependencies` gains both packages; `bun.lock` updated.

- [ ] **Step 2: Write the shared vector**

Create `onchain/fixtures/message-vector.json`:

```json
{
  "context": "onchain-agent-guard:v1",
  "agent": "0707070707070707070707070707070707070707070707070707070707070707",
  "counter": 3,
  "decisionHash": "0909090909090909090909090909090909090909090909090909090909090909",
  "stepMessage": "01070707070707070707070707070707070707070707070707070707070707070703000000000000000909090909090909090909090909090909090909090909090909090909090909",
  "resumeMessage": "0207070707070707070707070707070707070707070707070707070707070707070300000000000000"
}
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/server/modules/agent/message.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getAddressDecoder, getBase16Encoder } from '@solana/kit';
import vector from '../../../../../onchain/fixtures/message-vector.json';
import { GUARD_CONTEXT, resumeMessage, signGuardMessage, stepMessage } from './message';

const bytes = (hex: string) => new Uint8Array(getBase16Encoder().encode(hex));
const agent = getAddressDecoder().decode(bytes(vector.agent));
const counter = BigInt(vector.counter);

describe('guard messages', () => {
	it('uses the shared context string', () => {
		expect(new TextDecoder().decode(GUARD_CONTEXT)).toBe(vector.context);
	});

	it('builds the step message of the shared vector', () => {
		expect(stepMessage(agent, counter, bytes(vector.decisionHash))).toEqual(bytes(vector.stepMessage));
	});

	it('builds the resume message of the shared vector', () => {
		expect(resumeMessage(agent, counter)).toEqual(bytes(vector.resumeMessage));
	});

	it('rejects a decision hash that is not 32 bytes', () => {
		expect(() => stepMessage(agent, counter, new Uint8Array(31))).toThrow(RangeError);
	});

	it('signs with the guard context', () => {
		const keys = ml_dsa44.keygen();
		const message = resumeMessage(agent, counter);
		const signature = signGuardMessage(message, keys.secretKey);
		expect(ml_dsa44.verify(signature, message, keys.publicKey, { context: GUARD_CONTEXT })).toBe(true);
		expect(ml_dsa44.verify(signature, message, keys.publicKey)).toBe(false);
	});
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent/message.test.ts`
Expected: FAIL, cannot resolve `./message`.

- [ ] **Step 5: Implement**

Create `src/lib/server/modules/agent/message.ts`:

```ts
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getAddressEncoder, getU64Encoder, type Address } from '@solana/kit';

// The bytes the agent's ML-DSA-44 key signs. Must match onchain/programs/onchain_agent_guard/src/message.rs; both
// sides are checked against onchain/fixtures/message-vector.json.

/** FIPS 204 context string (domain separation); the program verifies with the same one. */
export const GUARD_CONTEXT = new TextEncoder().encode('onchain-agent-guard:v1');
export const DECISION_HASH_LENGTH = 32;
const STEP_TAG = 1;
const RESUME_TAG = 2;

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

export function signGuardMessage(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
	return ml_dsa44.sign(message, secretKey, { context: GUARD_CONTEXT });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `~/.bun/bin/bun test src`
Expected: all pass, 0 fail (the 3 existing tests plus 5 new).

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock onchain/fixtures/message-vector.json src/lib/server/modules/agent/message.ts src/lib/server/modules/agent/message.test.ts
git commit -m "agent: format podpisywanej wiadomosci (TS) i wspolny wektor testowy"
```

---

### Task 2: Instruction builders, Agent decoding and error codes (TypeScript)

**Files:**
- Create: `src/lib/server/modules/agent/instructions.ts`
- Create: `src/lib/server/modules/agent/guard-errors.ts`
- Test: `src/lib/server/modules/agent/instructions.test.ts`
- Test: `src/lib/server/modules/agent/guard-errors.test.ts`

**Interfaces:**
- Consumes: `DECISION_HASH_LENGTH` from `message.ts`.
- Produces (`instructions.ts`):
  - `AGENT_KEY_ACCOUNT_SIZE = 20_552n`, `SYSTEM_PROGRAM_ADDRESS`
  - `anchorDiscriminator(namespace: 'global' | 'account', name: string): Uint8Array`
  - `DISCRIMINATORS: { registerAgent, recordStep, kill, resume, agent }` (each `Uint8Array`)
  - `type AgentStatus = 'Active' | 'Killed'`
  - `interface AgentState { owner: Address; agentKey: Address; status: AgentStatus; counter: bigint; lastDecision: Uint8Array; bump: number }`
  - `decodeAgent(data: Uint8Array): AgentState`
  - `findAgentAddress(programAddress: Address, owner: Address, agentKey: Address): Promise<Address>`
  - `registerAgentInstruction({ programAddress, owner: TransactionSigner, agentKey: Address, agent: Address, publicKey: Uint8Array })`
  - `recordStepInstruction({ programAddress, agent: Address, agentKey: Address, decisionHash: Uint8Array, signature: Uint8Array })`
  - `killInstruction({ programAddress, owner: TransactionSigner, agent: Address })`
  - `resumeInstruction({ programAddress, owner: TransactionSigner, agent: Address, agentKey: Address, signature: Uint8Array })`
- Produces (`guard-errors.ts`):
  - `GUARD_ERROR_CODES` (`AgentKilled: 6000` … `VerifyFailed: 6006`)
  - `customErrorCode(err: unknown): number | null`
  - `describeTransactionError(err: unknown): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/agent/instructions.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { AccountRole, generateKeyPairSigner, getAddressDecoder, getU64Encoder } from '@solana/kit';
import {
	DISCRIMINATORS,
	decodeAgent,
	findAgentAddress,
	killInstruction,
	recordStepInstruction,
	registerAgentInstruction
} from './instructions';

const filled = (length: number, value: number) => new Uint8Array(length).fill(value);
const addressOf = (value: number) => getAddressDecoder().decode(filled(32, value));
const PROGRAM = addressOf(9);
const AGENT = addressOf(7);
const AGENT_KEY = addressOf(3);
const ML_DSA_44_PUBLIC_KEY_LENGTH = 1312;
const ML_DSA_44_SIGNATURE_LENGTH = 2420;

describe('discriminators', () => {
	it('are the first 8 bytes of sha256 over the Anchor names', () => {
		expect(Array.from(DISCRIMINATORS.registerAgent)).toEqual([135, 157, 66, 195, 2, 113, 175, 30]);
		expect(Array.from(DISCRIMINATORS.recordStep)).toEqual([73, 169, 197, 19, 10, 159, 58, 199]);
		expect(Array.from(DISCRIMINATORS.kill)).toEqual([46, 229, 132, 89, 87, 194, 20, 217]);
		expect(Array.from(DISCRIMINATORS.resume)).toEqual([1, 166, 51, 170, 127, 32, 141, 206]);
		expect(Array.from(DISCRIMINATORS.agent)).toEqual([47, 166, 112, 147, 155, 197, 86, 7]);
	});
});

describe('findAgentAddress', () => {
	it('derives one address per owner and key', async () => {
		const first = await findAgentAddress(PROGRAM, addressOf(2), AGENT_KEY);
		expect(await findAgentAddress(PROGRAM, addressOf(2), AGENT_KEY)).toBe(first);
		expect(await findAgentAddress(PROGRAM, addressOf(4), AGENT_KEY)).not.toBe(first);
	});
});

describe('decodeAgent', () => {
	it('decodes the Anchor account layout', () => {
		const data = Uint8Array.from([
			...DISCRIMINATORS.agent,
			...filled(32, 1),
			...filled(32, 2),
			1,
			...getU64Encoder().encode(5n),
			...filled(32, 9),
			254
		]);
		expect(decodeAgent(data)).toEqual({
			owner: addressOf(1),
			agentKey: addressOf(2),
			status: 'Killed',
			counter: 5n,
			lastDecision: filled(32, 9),
			bump: 254
		});
	});

	it('rejects an account that is not an Agent', () => {
		expect(() => decodeAgent(filled(8 + 106, 0))).toThrow('not an onchain_agent_guard Agent');
	});
});

describe('instruction builders', () => {
	it('lays out register_agent', async () => {
		const owner = await generateKeyPairSigner();
		const instruction = registerAgentInstruction({
			programAddress: PROGRAM,
			owner,
			agentKey: AGENT_KEY,
			agent: AGENT,
			publicKey: filled(ML_DSA_44_PUBLIC_KEY_LENGTH, 5)
		});
		expect(instruction.data.length).toBe(8 + 4 + ML_DSA_44_PUBLIC_KEY_LENGTH);
		expect(instruction.accounts.map((account) => account.role)).toEqual([
			AccountRole.WRITABLE_SIGNER,
			AccountRole.WRITABLE,
			AccountRole.WRITABLE,
			AccountRole.READONLY
		]);
	});

	it('lays out record_step: discriminator, hash, u32 LE length, signature', () => {
		const instruction = recordStepInstruction({
			programAddress: PROGRAM,
			agent: AGENT,
			agentKey: AGENT_KEY,
			decisionHash: filled(32, 9),
			signature: filled(ML_DSA_44_SIGNATURE_LENGTH, 5)
		});
		expect(instruction.data.length).toBe(8 + 32 + 4 + ML_DSA_44_SIGNATURE_LENGTH);
		expect(Array.from(instruction.data.subarray(0, 8))).toEqual(Array.from(DISCRIMINATORS.recordStep));
		expect(Array.from(instruction.data.subarray(40, 44))).toEqual([0x74, 0x09, 0, 0]);
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[AGENT, AccountRole.WRITABLE],
			[AGENT_KEY, AccountRole.READONLY]
		]);
	});

	it('makes the owner sign kill', async () => {
		const owner = await generateKeyPairSigner();
		const instruction = killInstruction({ programAddress: PROGRAM, owner, agent: AGENT });
		expect(Array.from(instruction.data)).toEqual(Array.from(DISCRIMINATORS.kill));
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[owner.address, AccountRole.READONLY_SIGNER],
			[AGENT, AccountRole.WRITABLE]
		]);
	});
});
```

Create `src/lib/server/modules/agent/guard-errors.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { GUARD_ERROR_CODES, customErrorCode, describeTransactionError } from './guard-errors';

describe('guard errors', () => {
	it('reads the custom code of an instruction error', () => {
		expect(customErrorCode({ InstructionError: [0, { Custom: 6000 }] })).toBe(GUARD_ERROR_CODES.AgentKilled);
		expect(customErrorCode({ InstructionError: [0, { Custom: 6006n }] })).toBe(GUARD_ERROR_CODES.VerifyFailed);
	});

	it('returns null when there is no custom code', () => {
		expect(customErrorCode(null)).toBeNull();
		expect(customErrorCode({ InstructionError: [0, 'MissingRequiredSignature'] })).toBeNull();
	});

	it('names guard errors and prints others as JSON, bigints included', () => {
		expect(describeTransactionError({ InstructionError: [0, { Custom: 6006n }] })).toBe('VerifyFailed');
		expect(describeTransactionError({ InstructionError: [1, { Custom: 2001n }] })).toBe(
			'{"InstructionError":[1,{"Custom":2001}]}'
		);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent`
Expected: FAIL, cannot resolve `./instructions` and `./guard-errors`.

- [ ] **Step 3: Implement `guard-errors.ts`**

```ts
/** GuardError codes from onchain/programs/onchain_agent_guard/src/error.rs (Anchor numbers custom errors from 6000). */
export const GUARD_ERROR_CODES = {
	AgentKilled: 6000,
	AgentNotKilled: 6001,
	AgentNotActive: 6002,
	InvalidPublicKey: 6003,
	InvalidSignature: 6004,
	InvalidKeyAccount: 6005,
	VerifyFailed: 6006
} as const;

const GUARD_ERROR_NAMES = new Map<number, string>(
	Object.entries(GUARD_ERROR_CODES).map(([name, code]) => [code, name])
);

/** Custom program error code of a transaction error such as `{ InstructionError: [0, { Custom: 6000 }] }`. */
export function customErrorCode(err: unknown): number | null {
	const instructionError = (err as { InstructionError?: [unknown, unknown] } | null)?.InstructionError;
	const custom = (instructionError?.[1] as { Custom?: number | bigint } | undefined)?.Custom;
	return custom === undefined ? null : Number(custom);
}

export function describeTransactionError(err: unknown): string {
	const code = customErrorCode(err);
	const name = code === null ? undefined : GUARD_ERROR_NAMES.get(code);
	return name ?? JSON.stringify(err, (_, value) => (typeof value === 'bigint' ? Number(value) : value));
}
```

- [ ] **Step 4: Implement `instructions.ts`**

```ts
import { createHash } from 'node:crypto';
import {
	AccountRole,
	address,
	fixDecoderSize,
	getAddressDecoder,
	getAddressEncoder,
	getBytesDecoder,
	getProgramDerivedAddress,
	getStructDecoder,
	getU32Encoder,
	getU64Decoder,
	getU8Decoder,
	type Address,
	type TransactionSigner
} from '@solana/kit';
import { DECISION_HASH_LENGTH } from './message';

// Client side of onchain/programs/onchain_agent_guard: hand-written Anchor encoding (8 B discriminator + Borsh).
// idl.test.ts checks the discriminators and error codes against the IDL from `anchor build`.

/** 8 B Anchor discriminator + 20,544 B prepared ML-DSA-44 key (AgentKey in state.rs). */
export const AGENT_KEY_ACCOUNT_SIZE = 20_552n;
export const SYSTEM_PROGRAM_ADDRESS = address('11111111111111111111111111111111');
const AGENT_SEED = new TextEncoder().encode('agent');
const DISCRIMINATOR_LENGTH = 8;

export function anchorDiscriminator(namespace: 'global' | 'account', name: string): Uint8Array {
	return new Uint8Array(createHash('sha256').update(`${namespace}:${name}`).digest().subarray(0, DISCRIMINATOR_LENGTH));
}

export const DISCRIMINATORS = {
	registerAgent: anchorDiscriminator('global', 'register_agent'),
	recordStep: anchorDiscriminator('global', 'record_step'),
	kill: anchorDiscriminator('global', 'kill'),
	resume: anchorDiscriminator('global', 'resume'),
	agent: anchorDiscriminator('account', 'Agent')
};

const AGENT_STATUSES = ['Active', 'Killed'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentState {
	owner: Address;
	agentKey: Address;
	status: AgentStatus;
	counter: bigint;
	lastDecision: Uint8Array;
	bump: number;
}

const agentDecoder = getStructDecoder([
	['owner', getAddressDecoder()],
	['agentKey', getAddressDecoder()],
	['status', getU8Decoder()],
	['counter', getU64Decoder()],
	['lastDecision', fixDecoderSize(getBytesDecoder(), DECISION_HASH_LENGTH)],
	['bump', getU8Decoder()]
]);

export function decodeAgent(data: Uint8Array): AgentState {
	if (!equalBytes(data.subarray(0, DISCRIMINATOR_LENGTH), DISCRIMINATORS.agent)) {
		throw new Error('account is not an onchain_agent_guard Agent');
	}
	const raw = agentDecoder.decode(data, DISCRIMINATOR_LENGTH);
	const status = AGENT_STATUSES[raw.status];
	if (status === undefined) throw new Error(`unknown agent status ${raw.status}`);
	return { ...raw, status, lastDecision: new Uint8Array(raw.lastDecision) };
}

export async function findAgentAddress(programAddress: Address, owner: Address, agentKey: Address): Promise<Address> {
	const encoder = getAddressEncoder();
	const [agent] = await getProgramDerivedAddress({
		programAddress,
		seeds: [AGENT_SEED, encoder.encode(owner), encoder.encode(agentKey)]
	});
	return agent;
}

export function registerAgentInstruction(input: {
	programAddress: Address;
	owner: TransactionSigner;
	agentKey: Address;
	agent: Address;
	publicKey: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.WRITABLE_SIGNER, signer: input.owner },
			{ address: input.agentKey, role: AccountRole.WRITABLE },
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.registerAgent, borshBytes(input.publicKey))
	};
}

export function recordStepInstruction(input: {
	programAddress: Address;
	agent: Address;
	agentKey: Address;
	decisionHash: Uint8Array;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.agentKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.recordStep, input.decisionHash, borshBytes(input.signature))
	};
}

export function killInstruction(input: { programAddress: Address; owner: TransactionSigner; agent: Address }) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.READONLY_SIGNER, signer: input.owner },
			{ address: input.agent, role: AccountRole.WRITABLE }
		],
		data: DISCRIMINATORS.kill
	};
}

export function resumeInstruction(input: {
	programAddress: Address;
	owner: TransactionSigner;
	agent: Address;
	agentKey: Address;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.READONLY_SIGNER, signer: input.owner },
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.agentKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.resume, borshBytes(input.signature))
	};
}

/** Borsh `Vec<u8>`: u32 LE length, then the bytes. */
function borshBytes(bytes: Uint8Array): Uint8Array {
	return concatBytes(getU32Encoder().encode(bytes.length), bytes);
}

function concatBytes(...parts: ArrayLike<number>[]): Uint8Array {
	return Uint8Array.from(parts.flatMap((part) => Array.from(part)));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `~/.bun/bin/bun test src`
Expected: all pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/agent/instructions.ts src/lib/server/modules/agent/instructions.test.ts src/lib/server/modules/agent/guard-errors.ts src/lib/server/modules/agent/guard-errors.test.ts
git commit -m "agent: instrukcje programu, dekodowanie Agent i kody bledow (TS)"
```

---

### Task 3: Anchor workspace and `register_agent`

**Files:**
- Modify: `.gitignore`
- Create: `onchain/toolchain.sh`, `onchain/run-tests.sh`, `onchain/Anchor.toml`, `onchain/Cargo.toml`, `onchain/README.md`
- Create: `onchain/programs/onchain_agent_guard/Cargo.toml`
- Create: `onchain/programs/onchain_agent_guard/src/{lib.rs,state.rs,error.rs,message.rs}`
- Create: `scripts/gen-guard-fixtures.ts`
- Test: `onchain/programs/onchain_agent_guard/tests/guard.rs`, `onchain/programs/onchain_agent_guard/tests/message_vector.rs`
- Generated and committed: `onchain/Cargo.lock`, `src/lib/server/modules/agent/onchain_agent_guard.idl.json`

**Interfaces:**
- Consumes: `findAgentAddress` (Task 2), `stepMessage`, `resumeMessage`, `signGuardMessage` (Task 1), `onchain/fixtures/message-vector.json` (Task 1).
- Produces (Rust crate `onchain_agent_guard`):
  - `state::{Agent, AgentKey, AgentStatus, StepRecorded, AgentKilled, AgentResumed, MldsaPreparedKey, AGENT_SEED}`
  - `error::GuardError` (order fixed: AgentKilled, AgentNotKilled, AgentNotActive, InvalidPublicKey, InvalidSignature, InvalidKeyAccount, VerifyFailed)
  - `message::{CONTEXT, DECISION_HASH_LEN, step_message(&Pubkey, u64, &[u8; 32]) -> Vec<u8>, resume_message(&Pubkey, u64) -> Vec<u8>}`
  - instruction `register_agent(public_key: Vec<u8>)`
  - fixture files: `agent-key.pk`, `step-1.sig`, `step-2.sig`, `step-3.sig`, `resume-2.sig` (owner `[2; 32]`, agent key `[3; 32]`, decision hash of step n = `[n; 32]`)
  - test helpers in `guard.rs`: `Ledger`, `agent_address()`, `guard_error()`

- [ ] **Step 1: Ignore build output and secrets**

Append to `.gitignore`:

```gitignore

# Devnet keypairs, agent secret key and decision log
.devnet/

# Anchor workspace build output and generated test fixtures
/onchain/target/
/onchain/.anchor/
/onchain/programs/onchain_agent_guard/tests/fixtures/
```

- [ ] **Step 2: Shared Docker toolchain**

Create `onchain/toolchain.sh`:

```bash
# Docker toolchain for the onchain/ scripts: Agave 4.3.0 (spikes/falcon-noble-compat/Dockerfile.sbf) plus the Anchor
# CLI 1.2.1 (spikes/pq-verify-anchor/Dockerfile.anchor). The host's glibc 2.31 is too old for the native CLIs.
# Source it; it sets ONCHAIN_DIR, REPO_DIR and BUN.
ONCHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$ONCHAIN_DIR")"
AGAVE_IMAGE=falcon-sbf
ANCHOR_IMAGE=pq-verify-anchor
BUN="${BUN:-$HOME/.bun/bin/bun}"

build_images() {
  docker build -q -t "$AGAVE_IMAGE" - < "$REPO_DIR/spikes/falcon-noble-compat/Dockerfile.sbf" > /dev/null
  docker build -q -t "$ANCHOR_IMAGE" - < "$REPO_DIR/spikes/pq-verify-anchor/Dockerfile.anchor" > /dev/null
}

# Runs a command in the toolchain image as the host user, with the repo mounted at the same path. Host network:
# Docker's resolver once returned a devnet RPC node that refused connections while the host's worked.
toolchain() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/root \
    -v "$REPO_DIR:$REPO_DIR" -w "$PWD" "$ANCHOR_IMAGE" "$@"
}
```

- [ ] **Step 3: Generate the program keypair**

```bash
cd /storage1/mydes/SolanaHackaton
source onchain/toolchain.sh && build_images
mkdir -p onchain/.devnet
toolchain solana-keygen new --no-bip39-passphrase --silent --outfile onchain/.devnet/program-keypair.json
PROGRAM_ID=$(toolchain solana-keygen pubkey onchain/.devnet/program-keypair.json); echo "$PROGRAM_ID"
```

Expected: one base58 address. Keep `$PROGRAM_ID` in the shell for Step 4. `onchain/.devnet/program-keypair.json` is gitignored and the only copy: devnet deploys to this address need it.

- [ ] **Step 4: Workspace files**

Create `onchain/Anchor.toml` (then run `sed -i "s/<PROGRAM_ID>/$PROGRAM_ID/" onchain/Anchor.toml`):

```toml
# The programs entries stop the first `anchor build` from rewriting declare_id! with a freshly generated keypair.
[programs.localnet]
onchain_agent_guard = "<PROGRAM_ID>"

[programs.devnet]
onchain_agent_guard = "<PROGRAM_ID>"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"
```

Create `onchain/Cargo.toml`:

```toml
# Anchor 1.2.1 workspace template (anchor init) plus the verifier crate override at the end.
[workspace]
members = [
    "programs/*"
]
resolver = "2"

[workspace.package]
edition = "2021"
rust-version = "1.89"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
# With overflow checks solana-ml-dsa does not compile for SBPF v3 ("rustc-LLVM ERROR: Branch target out of insn
# range"); upstream builds it without them. The program's own code keeps them.
[profile.release.package.solana-ml-dsa]
overflow-checks = false
```

Create `onchain/programs/onchain_agent_guard/Cargo.toml`:

```toml
[package]
name = "onchain-agent-guard"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish = false

[lib]
crate-type = ["cdylib", "lib"]
name = "onchain_agent_guard"

[features]
default = []
cpi = ["no-entrypoint"]
no-entrypoint = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build"]
anchor-debug = []
custom-heap = []
custom-panic = []

[dependencies]
anchor-lang = "=1.2.1"
# Pod for the 20,544-byte array in the zero-copy key account (without it bytemuck stops at fixed sizes).
bytemuck = { version = "1", features = ["min_const_generics"] }
solana-ml-dsa = { git = "https://github.com/blueshift-gg/solana-ml-dsa", rev = "e61fac4920bd7ca21464ab4ed04afa2259227e0d" }

# Mollusk 0.16 matches Agave 4.3 (solana-program-runtime 4.3); 0.15.1 does not compile against it.
[dev-dependencies]
mollusk-svm = "0.16.0"
serde_json = "1"
solana-account = "4.3.1"
solana-address = "2.6.1"
solana-instruction = "3.4.1"
solana-system-interface = { version = "3.2.0", features = ["wincode"] }
solana-transaction-error = "3"

[lints.rust]
unexpected_cfgs = { level = "warn", check-cfg = ['cfg(target_os, values("solana"))'] }
```

- [ ] **Step 5: Fixture generator**

Create `scripts/gen-guard-fixtures.ts`:

```ts
// Writes a fresh noble ML-DSA-44 key and signatures for the Mollusk tests in
// onchain/programs/onchain_agent_guard/tests/guard.rs. Called by onchain/run-tests.sh.
// Usage: bun scripts/gen-guard-fixtures.ts <program id> <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { address, getAddressDecoder } from '@solana/kit';
import { findAgentAddress } from '../src/lib/server/modules/agent/instructions';
import { resumeMessage, signGuardMessage, stepMessage } from '../src/lib/server/modules/agent/message';

// Must match OWNER, AGENT_KEY and decision_hash() in guard.rs.
const OWNER = getAddressDecoder().decode(new Uint8Array(32).fill(2));
const AGENT_KEY = getAddressDecoder().decode(new Uint8Array(32).fill(3));
const STEP_COUNTERS = [1n, 2n, 3n];
const RESUME_COUNTER = 2n;
const decisionHash = (counter: bigint) => new Uint8Array(32).fill(Number(counter));

const [programId, outDir] = process.argv.slice(2);
if (!programId || !outDir) {
	console.error('Usage: bun scripts/gen-guard-fixtures.ts <program id> <out dir>');
	process.exit(2);
}

const agent = await findAgentAddress(address(programId), OWNER, AGENT_KEY);
const keys = ml_dsa44.keygen();
mkdirSync(outDir, { recursive: true });
const write = (name: string, bytes: Uint8Array) => writeFileSync(join(outDir, name), bytes);

write('agent-key.pk', keys.publicKey);
for (const counter of STEP_COUNTERS) {
	write(`step-${counter}.sig`, signGuardMessage(stepMessage(agent, counter, decisionHash(counter)), keys.secretKey));
}
write(`resume-${RESUME_COUNTER}.sig`, signGuardMessage(resumeMessage(agent, RESUME_COUNTER), keys.secretKey));
console.log(`wrote guard fixtures for agent ${agent} to ${outDir}`);
```

- [ ] **Step 6: Test runner**

Create `onchain/run-tests.sh` and `chmod +x onchain/run-tests.sh`:

```bash
#!/usr/bin/env bash
# Builds onchain_agent_guard, copies its IDL to the TypeScript module, writes fresh noble fixtures and runs the
# Mollusk tests. Usage: onchain/run-tests.sh   (Docker on x86_64 + Bun; append 2>/dev/null to hide cargo logs)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/toolchain.sh"

FIXTURES_DIR="$ONCHAIN_DIR/programs/onchain_agent_guard/tests/fixtures"
IDL_COPY="$REPO_DIR/src/lib/server/modules/agent/onchain_agent_guard.idl.json"
PROGRAM_ID=$(sed -n 's/^onchain_agent_guard = "\(.*\)"$/\1/p' "$ONCHAIN_DIR/Anchor.toml" | head -1)

build_images
"$BUN" "$REPO_DIR/scripts/gen-guard-fixtures.ts" "$PROGRAM_ID" "$FIXTURES_DIR"
cd "$ONCHAIN_DIR"
# --ignore-keys: target/deploy holds a generated keypair; the real one is onchain/.devnet/program-keypair.json.
toolchain anchor build --ignore-keys
cp target/idl/onchain_agent_guard.json "$IDL_COPY"
toolchain cargo test -p onchain-agent-guard -- --nocapture --test-threads=1
```

- [ ] **Step 7: Write the failing Rust tests**

Create `onchain/programs/onchain_agent_guard/tests/message_vector.rs`:

```rust
//! The signed message bytes must match the TypeScript client (message.test.ts checks the same vector).
use anchor_lang::prelude::Pubkey;
use onchain_agent_guard::message::{resume_message, step_message, CONTEXT};

const VECTOR: &str = include_str!("../../../fixtures/message-vector.json");

fn hex(text: &str) -> Vec<u8> {
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap()).collect()
}

fn field<'a>(vector: &'a serde_json::Value, name: &str) -> &'a str {
    vector[name].as_str().unwrap()
}

#[test]
fn messages_match_the_shared_vector() {
    let vector: serde_json::Value = serde_json::from_str(VECTOR).unwrap();
    let agent = Pubkey::new_from_array(hex(field(&vector, "agent")).try_into().unwrap());
    let counter = vector["counter"].as_u64().unwrap();
    let decision_hash: [u8; 32] = hex(field(&vector, "decisionHash")).try_into().unwrap();

    assert_eq!(CONTEXT, field(&vector, "context").as_bytes());
    assert_eq!(step_message(&agent, counter, &decision_hash), hex(field(&vector, "stepMessage")));
    assert_eq!(resume_message(&agent, counter), hex(field(&vector, "resumeMessage")));
}
```

Create `onchain/programs/onchain_agent_guard/tests/guard.rs`:

```rust
//! Mollusk tests for onchain_agent_guard with noble ML-DSA-44 fixtures from scripts/gen-guard-fixtures.ts (run
//! onchain/run-tests.sh). OWNER, AGENT_KEY and decision_hash() must match the constants in that script.
use anchor_lang::{prelude::Pubkey, AccountDeserialize, InstructionData};
use mollusk_svm::{program::keyed_account_for_system_program, Mollusk};
use onchain_agent_guard::{
    error::GuardError,
    instruction as program_ix,
    state::{Agent, AgentKey, AgentStatus, AGENT_SEED},
};
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{error::InstructionError, AccountMeta, Instruction};
use solana_system_interface::{instruction::create_account, program::ID as SYSTEM_PROGRAM};
use solana_transaction_error::TransactionError;

const CU_LIMIT: u32 = 1_400_000;
const WALLET_LAMPORTS: u64 = 10_000_000_000;
const ANCHOR_DISCRIMINATOR_LEN: usize = 8;
/// AGENT_KEY_ACCOUNT_SIZE in src/lib/server/modules/agent/instructions.ts.
const AGENT_KEY_ACCOUNT_LEN: usize = 20_552;
const REGISTER_INSTRUCTION_INDEX: u8 = 1; // after the System Program create_account

const PUBLIC_KEY: &[u8] = include_bytes!("fixtures/agent-key.pk");

const PROGRAM: Address = Address::new_from_array(onchain_agent_guard::ID.to_bytes());
const OWNER: Address = Address::new_from_array([2; 32]);
const AGENT_KEY: Address = Address::new_from_array([3; 32]);
const STRANGER: Address = Address::new_from_array([4; 32]);

fn agent_address() -> Address {
    let (agent, _) = Pubkey::find_program_address(
        &[AGENT_SEED, OWNER.as_ref(), AGENT_KEY.as_ref()],
        &onchain_agent_guard::ID,
    );
    Address::new_from_array(agent.to_bytes())
}

fn mollusk() -> Mollusk {
    let directory = std::env::var_os("SBF_OUT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy"));
    let elf = directory.join("onchain_agent_guard");
    let mut svm = Mollusk::new(&PROGRAM, elf.to_str().unwrap());
    svm.compute_budget.compute_unit_limit = u64::from(CU_LIMIT);
    svm
}

fn guard_error(instruction: u8, error: GuardError) -> Result<(), TransactionError> {
    Err(TransactionError::InstructionError(instruction, InstructionError::Custom(error.into())))
}

/// Accounts carried from one transaction to the next, as a validator would.
struct Ledger {
    svm: Mollusk,
    accounts: Vec<(Address, Account)>,
}

impl Ledger {
    fn new() -> Self {
        let wallet = || Account::new(WALLET_LAMPORTS, 0, &SYSTEM_PROGRAM);
        Self {
            svm: mollusk(),
            accounts: vec![
                (OWNER, wallet()),
                (STRANGER, wallet()),
                (AGENT_KEY, Account::default()),
                (agent_address(), Account::default()),
                keyed_account_for_system_program(),
            ],
        }
    }

    fn registered() -> Self {
        let mut ledger = Self::new();
        let register = ledger.register_instructions(PUBLIC_KEY);
        assert_eq!(ledger.send("register", &register), Ok(()));
        ledger
    }

    fn send(&mut self, label: &str, instructions: &[Instruction]) -> Result<(), TransactionError> {
        self.send_paid_by(OWNER, label, instructions)
    }

    /// Keeps the resulting accounts only when the transaction succeeds. The fee payer signs the whole transaction,
    /// so tests about a missing owner signature must pay with another wallet.
    fn send_paid_by(&mut self, payer: Address, label: &str, instructions: &[Instruction]) -> Result<(), TransactionError> {
        let result = self.svm.process_transaction_instructions(instructions, &self.accounts, Some(&payer));
        println!("{label}: {:?}, {} CU", result.raw_result, result.compute_units_consumed);
        if result.raw_result.is_ok() {
            self.accounts = result.resulting_accounts;
        }
        result.raw_result
    }

    fn agent(&self) -> Agent {
        let (_, account) = self.accounts.iter().find(|(address, _)| *address == agent_address()).unwrap();
        Agent::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn register_instructions(&self, public_key: &[u8]) -> Vec<Instruction> {
        let rent = self.svm.sysvars.rent.minimum_balance(AGENT_KEY_ACCOUNT_LEN);
        vec![
            create_account(&OWNER, &AGENT_KEY, rent, AGENT_KEY_ACCOUNT_LEN as u64, &PROGRAM),
            Instruction::new_with_bytes(
                PROGRAM,
                &program_ix::RegisterAgent { public_key: public_key.to_vec() }.data(),
                vec![
                    AccountMeta::new(OWNER, true),
                    AccountMeta::new(AGENT_KEY, false),
                    AccountMeta::new(agent_address(), false),
                    AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
                ],
            ),
        ]
    }
}

#[test]
fn agent_key_account_size_matches_the_client() {
    assert_eq!(ANCHOR_DISCRIMINATOR_LEN + std::mem::size_of::<AgentKey>(), AGENT_KEY_ACCOUNT_LEN);
}

#[test]
fn register_creates_an_active_agent_bound_to_owner_and_key() {
    let agent = Ledger::registered().agent();
    assert_eq!(agent.owner.as_ref(), OWNER.as_ref());
    assert_eq!(agent.agent_key.as_ref(), AGENT_KEY.as_ref());
    assert_eq!(agent.status, AgentStatus::Active);
    assert_eq!(agent.counter, 0);
    assert_eq!(agent.last_decision, [0; 32]);
}

#[test]
fn register_rejects_a_malformed_public_key() {
    let mut ledger = Ledger::new();
    let register = ledger.register_instructions(&PUBLIC_KEY[..100]);
    assert_eq!(
        ledger.send("register malformed key", &register),
        guard_error(REGISTER_INSTRUCTION_INDEX, GuardError::InvalidPublicKey)
    );
}
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `onchain/run-tests.sh 2>&1 | tail -20`
Expected: FAIL: `anchor build` cannot find `programs/onchain_agent_guard/src/lib.rs`.

- [ ] **Step 9: Implement the program**

Create `onchain/programs/onchain_agent_guard/src/message.rs`:

```rust
//! The bytes the agent's ML-DSA-44 key signs. Must match src/lib/server/modules/agent/message.ts; both sides are
//! checked against onchain/fixtures/message-vector.json.
use anchor_lang::prelude::Pubkey;

/// FIPS 204 context string (domain separation); the signer uses the same one.
pub const CONTEXT: &[u8] = b"onchain-agent-guard:v1";
pub const DECISION_HASH_LEN: usize = 32;
const STEP_TAG: u8 = 1;
const RESUME_TAG: u8 = 2;
const HEADER_LEN: usize = 1 + 32 + 8;

/// Message for the step that moves the agent's counter to `counter`.
pub fn step_message(agent: &Pubkey, counter: u64, decision_hash: &[u8; DECISION_HASH_LEN]) -> Vec<u8> {
    let mut message = header(STEP_TAG, agent, counter);
    message.extend_from_slice(decision_hash);
    message
}

/// Message for the resume that moves the agent's counter to `counter`.
pub fn resume_message(agent: &Pubkey, counter: u64) -> Vec<u8> {
    header(RESUME_TAG, agent, counter)
}

fn header(tag: u8, agent: &Pubkey, counter: u64) -> Vec<u8> {
    let mut message = Vec::with_capacity(HEADER_LEN + DECISION_HASH_LEN);
    message.push(tag);
    message.extend_from_slice(agent.as_ref());
    message.extend_from_slice(&counter.to_le_bytes());
    message
}
```

Create `onchain/programs/onchain_agent_guard/src/state.rs`:

```rust
use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::PreparedVerifyingKey;

pub const AGENT_SEED: &[u8] = b"agent";

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
pub type MldsaPreparedKey = PreparedVerifyingKey<false>;
pub const MLDSA_PREPARED_KEY_LEN: usize = MldsaPreparedKey::BYTE_LEN;

/// The agent's prepared ML-DSA-44 public key. Written once by `register_agent`, read by every signed instruction.
#[account(zero_copy)]
pub struct AgentKey {
    pub prepared: [u8; MLDSA_PREPARED_KEY_LEN],
}

/// PDA with seeds `[AGENT_SEED, owner, agent_key]`: the only mutable state of an agent.
#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner: Pubkey,
    pub agent_key: Pubkey,
    pub status: AgentStatus,
    /// Number of accepted steps and resumes; every signed message names the next value, so a signature works once.
    pub counter: u64,
    pub last_decision: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum AgentStatus {
    Active,
    Killed,
}

#[event]
pub struct StepRecorded {
    pub agent: Pubkey,
    pub counter: u64,
    pub decision_hash: [u8; 32],
}

#[event]
pub struct AgentKilled {
    pub agent: Pubkey,
    pub counter: u64,
}

#[event]
pub struct AgentResumed {
    pub agent: Pubkey,
    pub counter: u64,
}
```

Create `onchain/programs/onchain_agent_guard/src/error.rs` (the order fixes the codes 6000–6006 that `guard-errors.ts` mirrors):

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Agent is killed")]
    AgentKilled,
    #[msg("Agent is not killed")]
    AgentNotKilled,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Malformed ML-DSA-44 public key")]
    InvalidPublicKey,
    #[msg("Malformed ML-DSA-44 signature")]
    InvalidSignature,
    #[msg("Key account does not hold a valid prepared key")]
    InvalidKeyAccount,
    #[msg("ML-DSA-44 signature verification failed")]
    VerifyFailed,
}
```

Create `onchain/programs/onchain_agent_guard/src/lib.rs` (then run `sed -i "s/<PROGRAM_ID>/$PROGRAM_ID/" onchain/programs/onchain_agent_guard/src/lib.rs`):

```rust
//! On-chain guard for one server-side agent: holds the agent's ML-DSA-44 public key, accepts a step or a resume only
//! with a valid ML-DSA-44 signature over a message it builds itself, and lets the owner's wallet kill the agent.
use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::VerifyingKey;

pub mod error;
pub mod message;
pub mod state;

use error::GuardError;
use state::{Agent, AgentKey, AgentStatus, MldsaPreparedKey, AGENT_SEED};

declare_id!("<PROGRAM_ID>");

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
type MldsaVerifyingKey = VerifyingKey<false>;

#[program]
pub mod onchain_agent_guard {
    use super::*;

    pub fn register_agent(ctx: Context<RegisterAgent>, public_key: Vec<u8>) -> Result<()> {
        let public_key =
            MldsaVerifyingKey::ref_from_bytes(&public_key).map_err(|_| GuardError::InvalidPublicKey)?;
        {
            let mut key = ctx.accounts.agent_key.load_init()?;
            let prepared =
                MldsaPreparedKey::mut_from_bytes(&mut key.prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
            public_key.prepare_into(prepared);
        }
        ctx.accounts.agent.set_inner(Agent {
            owner: ctx.accounts.owner.key(),
            agent_key: ctx.accounts.agent_key.key(),
            status: AgentStatus::Active,
            counter: 0,
            last_decision: [0; 32],
            bump: ctx.bumps.agent,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Allocated by a preceding System Program `create_account` in the same transaction: `init` allocates through
    /// CPI, which caps account size at 10 KiB, and this account is 20,552 B.
    #[account(zero)]
    pub agent_key: AccountLoader<'info, AgentKey>,
    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [AGENT_SEED, owner.key().as_ref(), agent_key.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `onchain/run-tests.sh 2>&1 | tail -30`
Expected: `register: Ok(())` with ~1.09M CU printed; `test result: ok. 3 passed` (guard.rs) and `test result: ok. 1 passed` (message_vector.rs).

Run: `onchain/run-tests.sh 2>&1 | grep -c "overflows the maximum allowed frame space"`
Expected: `0`.

- [ ] **Step 11: README**

Create `onchain/README.md`:

```markdown
# onchain_agent_guard

Solana program (Anchor 1.2.1) that guards one server-side agent. It stores the agent's ML-DSA-44 public key, accepts
a step or a resume only with a valid ML-DSA-44 signature over a message it builds itself (FIPS 204 context
`onchain-agent-guard:v1`), and lets the owner's wallet kill the agent. Design:
`docs/superpowers/specs/2026-10-10-pq-agent-program-design.md`.

## Test

```sh
onchain/run-tests.sh    # Docker (x86_64) + Bun; append 2>/dev/null to hide cargo logs
```

Builds the program in Docker (the host's glibc 2.31 is too old for the Agave and Anchor CLIs), copies the IDL to
`src/lib/server/modules/agent/onchain_agent_guard.idl.json`, writes fresh noble fixtures with
`scripts/gen-guard-fixtures.ts` and runs the Mollusk tests in `programs/onchain_agent_guard/tests/`.

The program keypair is `onchain/.devnet/program-keypair.json`: gitignored and the only copy, so back it up.
```

- [ ] **Step 12: Commit**

```bash
git add .gitignore onchain/ scripts/gen-guard-fixtures.ts src/lib/server/modules/agent/onchain_agent_guard.idl.json
git status --short   # must not list onchain/.devnet, onchain/target or tests/fixtures
git commit -m "onchain: workspace Anchor i program onchain_agent_guard z register_agent"
```

---

### Task 4: `record_step`

**Files:**
- Modify: `onchain/programs/onchain_agent_guard/src/lib.rs`
- Test: `onchain/programs/onchain_agent_guard/tests/guard.rs`
- Regenerated: `src/lib/server/modules/agent/onchain_agent_guard.idl.json`

**Interfaces:**
- Consumes: `Ledger`, `agent_address()`, `guard_error()` (Task 3); `message::step_message`, `message::CONTEXT`.
- Produces: instruction `record_step(decision_hash: [u8; 32], signature: Vec<u8>)` with accounts `[agent (mut), agent_key]`; `fn verify_signature(agent_key: &AccountLoader<AgentKey>, signed: &[u8], signature: &[u8]) -> Result<()>` in `lib.rs`; test helpers `decision_hash(counter)`, `step_with(hash, signature)`, `step(counter, signature)`, `flipped(bytes, index)`.

- [ ] **Step 1: Write the failing tests**

In `guard.rs`, add after `const PUBLIC_KEY`:

```rust
const STEP_1_SIGNATURE: &[u8] = include_bytes!("fixtures/step-1.sig");
const SIGNED_INSTRUCTION_INDEX: u8 = 0;
```

Add after `guard_error`:

```rust
/// Must match decisionHash() in scripts/gen-guard-fixtures.ts.
fn decision_hash(counter: u64) -> [u8; 32] {
    [counter as u8; 32]
}

fn flipped(bytes: &[u8], index: usize) -> Vec<u8> {
    let mut out = bytes.to_vec();
    out[index] ^= 1;
    out
}

fn step_with(decision_hash: [u8; 32], signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::RecordStep { decision_hash, signature: signature.to_vec() }.data(),
        vec![AccountMeta::new(agent_address(), false), AccountMeta::new_readonly(AGENT_KEY, false)],
    )
}

/// The step that moves the counter to `counter`, with the fixture's decision hash for it.
fn step(counter: u64, signature: &[u8]) -> Instruction {
    step_with(decision_hash(counter), signature)
}
```

Add at the end of `guard.rs`:

```rust
#[test]
fn valid_step_advances_the_counter_and_records_the_decision() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
    let agent = ledger.agent();
    assert_eq!(agent.counter, 1);
    assert_eq!(agent.last_decision, decision_hash(1));
}

#[test]
fn step_with_a_tampered_signature_fails() {
    let mut ledger = Ledger::registered();
    let tampered = flipped(STEP_1_SIGNATURE, STEP_1_SIGNATURE.len() / 2);
    assert_eq!(
        ledger.send("step 1 tampered signature", &[step(1, &tampered)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn step_with_another_decision_hash_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("step 1 other hash", &[step_with(decision_hash(9), STEP_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn step_with_a_malformed_signature_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("step 1 short signature", &[step(1, &STEP_1_SIGNATURE[..100])]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::InvalidSignature)
    );
}

#[test]
fn replayed_step_signature_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
    assert_eq!(
        ledger.send("step 1 replayed", &[step(1, STEP_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `onchain/run-tests.sh 2>&1 | tail -20`
Expected: FAIL to compile: `program_ix::RecordStep` not found.

- [ ] **Step 3: Implement**

In `lib.rs`, replace the imports block with:

```rust
use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::{Signature, VerifyingKey};

pub mod error;
pub mod message;
pub mod state;

use error::GuardError;
use message::{step_message, CONTEXT as MLDSA_CONTEXT};
use state::{Agent, AgentKey, AgentStatus, MldsaPreparedKey, StepRecorded, AGENT_SEED};
```

Add inside `pub mod onchain_agent_guard`, after `register_agent`:

```rust
    pub fn record_step(ctx: Context<RecordStep>, decision_hash: [u8; 32], signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentKilled);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key, &step_message(&agent_address, counter, &decision_hash), &signature)?;
        agent.counter = counter;
        agent.last_decision = decision_hash;
        emit!(StepRecorded { agent: agent_address, counter, decision_hash });
        Ok(())
    }
```

Add after the `#[program]` module:

```rust
fn verify_signature(agent_key: &AccountLoader<AgentKey>, signed: &[u8], signature: &[u8]) -> Result<()> {
    let key = agent_key.load()?;
    let prepared = MldsaPreparedKey::ref_from_bytes(&key.prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    let signature = Signature::ref_from_bytes(signature).map_err(|_| GuardError::InvalidSignature)?;
    prepared
        .verify_with_context(signed, MLDSA_CONTEXT, signature)
        .map_err(|_| error!(GuardError::VerifyFailed))
}
```

Add after `RegisterAgent`:

```rust
#[derive(Accounts)]
pub struct RecordStep<'info> {
    #[account(mut, has_one = agent_key)]
    pub agent: Account<'info, Agent>,
    pub agent_key: AccountLoader<'info, AgentKey>,
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `onchain/run-tests.sh 2>&1 | tail -30`
Expected: `test result: ok. 8 passed` (guard.rs) and `ok. 1 passed` (message_vector.rs). Note the printed `step 1` CU (~260k). If it is above 350,000, raise `SIGNED_COMPUTE_UNIT_LIMIT` in Task 7 to the printed value + 25 %.

Run: `onchain/run-tests.sh 2>&1 | grep -c "overflows the maximum allowed frame space"`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add onchain/programs/onchain_agent_guard src/lib/server/modules/agent/onchain_agent_guard.idl.json onchain/Cargo.lock
git commit -m "onchain: record_step z weryfikacja ML-DSA-44 i licznikiem"
```

---

### Task 5: `kill` and `resume`, IDL check in TypeScript

**Files:**
- Modify: `onchain/programs/onchain_agent_guard/src/lib.rs`
- Test: `onchain/programs/onchain_agent_guard/tests/guard.rs`
- Test: `src/lib/server/modules/agent/idl.test.ts`
- Regenerated: `src/lib/server/modules/agent/onchain_agent_guard.idl.json`

**Interfaces:**
- Consumes: Task 3–4 test helpers; `verify_signature`; `DISCRIMINATORS` and `GUARD_ERROR_CODES` (Task 2).
- Produces: instruction `kill()` with accounts `[owner (signer), agent (mut)]`; instruction `resume(signature: Vec<u8>)` with accounts `[owner (signer), agent (mut), agent_key]`.

- [ ] **Step 1: Write the failing Rust tests**

In `guard.rs`, change the `use anchor_lang::...` line to:

```rust
use anchor_lang::{error::ErrorCode as AnchorError, prelude::Pubkey, AccountDeserialize, InstructionData};
```

Add after `const STEP_1_SIGNATURE`:

```rust
const STEP_2_SIGNATURE: &[u8] = include_bytes!("fixtures/step-2.sig");
const STEP_3_SIGNATURE: &[u8] = include_bytes!("fixtures/step-3.sig");
const RESUME_2_SIGNATURE: &[u8] = include_bytes!("fixtures/resume-2.sig");
```

Add after `step`:

```rust
fn anchor_error(instruction: u8, error: AnchorError) -> Result<(), TransactionError> {
    Err(TransactionError::InstructionError(instruction, InstructionError::Custom(error.into())))
}

fn kill(signer: Address) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::Kill.data(),
        vec![AccountMeta::new_readonly(signer, true), AccountMeta::new(agent_address(), false)],
    )
}

fn resume(signature: &[u8], owner_signs: bool) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::Resume { signature: signature.to_vec() }.data(),
        vec![
            AccountMeta::new_readonly(OWNER, owner_signs),
            AccountMeta::new(agent_address(), false),
            AccountMeta::new_readonly(AGENT_KEY, false),
        ],
    )
}
```

Add inside `impl Ledger`:

```rust
    /// Registered, one step taken (counter 1), then killed by the owner.
    fn killed_after_first_step() -> Self {
        let mut ledger = Self::registered();
        assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
        assert_eq!(ledger.send("kill", &[kill(OWNER)]), Ok(()));
        ledger
    }
```

Add at the end of `guard.rs`:

```rust
#[test]
fn owner_kills_the_agent() {
    let agent = Ledger::killed_after_first_step().agent();
    assert_eq!(agent.status, AgentStatus::Killed);
    assert_eq!(agent.counter, 1);
}

#[test]
fn step_on_a_killed_agent_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(
        ledger.send("step 2 while killed", &[step(2, STEP_2_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentKilled)
    );
}

#[test]
fn kill_by_a_non_owner_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("kill by stranger", &[kill(STRANGER)]),
        anchor_error(SIGNED_INSTRUCTION_INDEX, AnchorError::ConstraintHasOne)
    );
}

#[test]
fn kill_on_a_killed_agent_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(
        ledger.send("kill again", &[kill(OWNER)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentNotActive)
    );
}

#[test]
fn resume_without_the_owner_signature_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(
        ledger.send_paid_by(STRANGER, "resume unsigned by owner", &[resume(RESUME_2_SIGNATURE, false)]),
        anchor_error(SIGNED_INSTRUCTION_INDEX, AnchorError::AccountNotSigner)
    );
}

#[test]
fn resume_on_an_active_agent_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
    assert_eq!(
        ledger.send("resume while active", &[resume(RESUME_2_SIGNATURE, true)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentNotKilled)
    );
}

#[test]
fn resume_reactivates_the_agent_and_steps_continue() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(ledger.send("resume", &[resume(RESUME_2_SIGNATURE, true)]), Ok(()));
    let agent = ledger.agent();
    assert_eq!(agent.status, AgentStatus::Active);
    assert_eq!(agent.counter, 2);
    assert_eq!(ledger.send("step 3", &[step(3, STEP_3_SIGNATURE)]), Ok(()));
    assert_eq!(ledger.agent().counter, 3);
}

#[test]
fn replayed_resume_signature_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(ledger.send("resume", &[resume(RESUME_2_SIGNATURE, true)]), Ok(()));
    assert_eq!(ledger.send("kill", &[kill(OWNER)]), Ok(()));
    assert_eq!(
        ledger.send("resume replayed", &[resume(RESUME_2_SIGNATURE, true)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `onchain/run-tests.sh 2>&1 | tail -20`
Expected: FAIL to compile: `program_ix::Kill` / `program_ix::Resume` not found.

- [ ] **Step 3: Implement**

In `lib.rs`, extend the `message` and `state` imports:

```rust
use message::{resume_message, step_message, CONTEXT as MLDSA_CONTEXT};
use state::{Agent, AgentKey, AgentKilled, AgentResumed, AgentStatus, MldsaPreparedKey, StepRecorded, AGENT_SEED};
```

Add inside `pub mod onchain_agent_guard`, after `record_step`:

```rust
    pub fn kill(ctx: Context<Kill>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentNotActive);
        agent.status = AgentStatus::Killed;
        emit!(AgentKilled { agent: agent_address, counter: agent.counter });
        Ok(())
    }

    pub fn resume(ctx: Context<Resume>, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Killed, GuardError::AgentNotKilled);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key, &resume_message(&agent_address, counter), &signature)?;
        agent.counter = counter;
        agent.status = AgentStatus::Active;
        emit!(AgentResumed { agent: agent_address, counter });
        Ok(())
    }
```

Add after `RecordStep`:

```rust
/// Needs only the owner's wallet, so the owner can stop the agent while its server is down or compromised.
#[derive(Accounts)]
pub struct Kill<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
}

/// Needs both the owner's wallet and the agent's ML-DSA-44 signature: neither a compromised server nor a forged
/// Ed25519 signature resumes the agent alone.
#[derive(Accounts)]
pub struct Resume<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, has_one = agent_key)]
    pub agent: Account<'info, Agent>,
    pub agent_key: AccountLoader<'info, AgentKey>,
}
```

- [ ] **Step 4: Run the Rust tests to verify they pass**

Run: `onchain/run-tests.sh 2>&1 | tail -40`
Expected: `test result: ok. 16 passed` (guard.rs) and `ok. 1 passed` (message_vector.rs); `resume` prints ~260k CU, `kill` a few thousand.

Run: `onchain/run-tests.sh 2>&1 | grep -c "overflows the maximum allowed frame space"`
Expected: `0`.

- [ ] **Step 5: Write the TS IDL check**

Create `src/lib/server/modules/agent/idl.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import idl from './onchain_agent_guard.idl.json';
import { GUARD_ERROR_CODES } from './guard-errors';
import { DISCRIMINATORS } from './instructions';

// onchain/run-tests.sh copies the IDL from `anchor build`; this keeps the hand-written client in step with it.
const instructionDiscriminator = (name: string) =>
	idl.instructions.find((instruction) => instruction.name === name)?.discriminator;

describe('client matches the program IDL', () => {
	it('uses the IDL instruction discriminators', () => {
		expect(Array.from(DISCRIMINATORS.registerAgent)).toEqual(instructionDiscriminator('register_agent')!);
		expect(Array.from(DISCRIMINATORS.recordStep)).toEqual(instructionDiscriminator('record_step')!);
		expect(Array.from(DISCRIMINATORS.kill)).toEqual(instructionDiscriminator('kill')!);
		expect(Array.from(DISCRIMINATORS.resume)).toEqual(instructionDiscriminator('resume')!);
	});

	it('uses the IDL Agent account discriminator', () => {
		expect(Array.from(DISCRIMINATORS.agent)).toEqual(idl.accounts.find((account) => account.name === 'Agent')!.discriminator);
	});

	it('uses the IDL error codes', () => {
		expect(Object.fromEntries(idl.errors.map((error) => [error.name, error.code]))).toEqual(GUARD_ERROR_CODES);
	});
});
```

- [ ] **Step 6: Run the TS tests**

Run: `~/.bun/bin/bun test src`
Expected: all pass, 0 fail. (If the error names in the IDL are not PascalCase, fix the test's mapping, not `GUARD_ERROR_CODES`.)

- [ ] **Step 7: Commit**

```bash
git add onchain/programs/onchain_agent_guard src/lib/server/modules/agent/onchain_agent_guard.idl.json src/lib/server/modules/agent/idl.test.ts onchain/Cargo.lock
git commit -m "onchain: kill (portfel wlasciciela) i resume (wlasciciel + podpis ML-DSA-44); test IDL w TS"
```

---

### Task 6: Decision record and agent cycle

**Files:**
- Create: `src/lib/server/modules/agent/decision.ts`
- Create: `src/lib/server/modules/agent/agent-loop.ts`
- Test: `src/lib/server/modules/agent/decision.test.ts`
- Test: `src/lib/server/modules/agent/agent-loop.test.ts`

**Interfaces:**
- Consumes: `stepMessage` (Task 1); `AgentState`, `AgentStatus` (Task 2); `describeTransactionError` (Task 2).
- Produces:
  - `decision.ts`: `interface DecisionRecord { agent: Address; counter: number; decision: 'TICK'; observedAt: string }`, `tickDecision(agent: Address, counter: bigint, observedAt: Date): DecisionRecord`, `hashDecision(record: DecisionRecord): Uint8Array`
  - `agent-loop.ts`: `interface SentTransaction { signature: string; err: unknown }`, `interface DecisionLogEntry { record: DecisionRecord; decisionHash: string; transaction: string; err: unknown }`, `interface CyclePorts { agent; readAgent(); sign(message); sendStep(decisionHash, signature); appendLog(entry); now(); log(line) }`, `type CycleOutcome = 'paused' | 'recorded' | 'failed'`, `runCycle(ports: CyclePorts): Promise<CycleOutcome>`, `runLoop(ports: CyclePorts, tickMs: number, signal: AbortSignal): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/agent/decision.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { address, getBase16Decoder } from '@solana/kit';
import { hashDecision, tickDecision } from './decision';

const AGENT = address('11111111111111111111111111111111');
const OBSERVED_AT = new Date('2026-10-10T12:00:00.000Z');

describe('tick decision', () => {
	it('records the agent, the new counter and the time', () => {
		expect(tickDecision(AGENT, 1n, OBSERVED_AT)).toEqual({
			agent: AGENT,
			counter: 1,
			decision: 'TICK',
			observedAt: '2026-10-10T12:00:00.000Z'
		});
	});

	it('hashes the canonical JSON with SHA-256', () => {
		// sha256('{"agent":"11111111111111111111111111111111","counter":1,"decision":"TICK","observedAt":"2026-10-10T12:00:00.000Z"}')
		expect(getBase16Decoder().decode(hashDecision(tickDecision(AGENT, 1n, OBSERVED_AT)))).toBe(
			'822fb48cf7c564846470f7af54e8756a6ea74e67ebb8c2c552c411a53b21e64a'
		);
	});

	it('hashes the same regardless of key order in the record object', () => {
		const reordered = { observedAt: '2026-10-10T12:00:00.000Z', decision: 'TICK' as const, counter: 1, agent: AGENT };
		expect(hashDecision(reordered)).toEqual(hashDecision(tickDecision(AGENT, 1n, OBSERVED_AT)));
	});
});
```

Create `src/lib/server/modules/agent/agent-loop.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { getAddressDecoder } from '@solana/kit';
import { runCycle, runLoop, type CyclePorts, type DecisionLogEntry, type SentTransaction } from './agent-loop';
import { hashDecision, tickDecision } from './decision';
import type { AgentState, AgentStatus } from './instructions';
import { stepMessage } from './message';

const AGENT = getAddressDecoder().decode(new Uint8Array(32).fill(7));
const NOW = new Date('2026-10-10T12:00:00.000Z');
const FAKE_SIGNATURE = Uint8Array.of(1, 2, 3);
const LANDED: SentTransaction = { signature: 'tx-signature', err: null };

function agentState(status: AgentStatus, counter: bigint): AgentState {
	return { owner: AGENT, agentKey: AGENT, status, counter, lastDecision: new Uint8Array(32), bump: 255 };
}

function fakePorts(overrides: Partial<CyclePorts> = {}) {
	const calls = {
		signed: [] as Uint8Array[],
		steps: [] as { decisionHash: Uint8Array; signature: Uint8Array }[],
		logEntries: [] as DecisionLogEntry[],
		lines: [] as string[]
	};
	const ports: CyclePorts = {
		agent: AGENT,
		readAgent: async () => agentState('Active', 4n),
		sign: (message) => {
			calls.signed.push(message);
			return FAKE_SIGNATURE;
		},
		sendStep: async (decisionHash, signature) => {
			calls.steps.push({ decisionHash, signature });
			return LANDED;
		},
		appendLog: async (entry) => {
			calls.logEntries.push(entry);
		},
		now: () => NOW,
		log: (line) => {
			calls.lines.push(line);
		},
		...overrides
	};
	return { ports, calls };
}

describe('runCycle', () => {
	it('sends nothing while the agent is killed', async () => {
		const { ports, calls } = fakePorts({ readAgent: async () => agentState('Killed', 4n) });
		expect(await runCycle(ports)).toBe('paused');
		expect(calls.signed).toHaveLength(0);
		expect(calls.steps).toHaveLength(0);
	});

	it('signs and sends the tick decision for the next counter', async () => {
		const { ports, calls } = fakePorts();
		const expectedHash = hashDecision(tickDecision(AGENT, 5n, NOW));

		expect(await runCycle(ports)).toBe('recorded');
		expect(calls.signed).toEqual([stepMessage(AGENT, 5n, expectedHash)]);
		expect(calls.steps).toEqual([{ decisionHash: expectedHash, signature: FAKE_SIGNATURE }]);
		expect(calls.logEntries[0]?.record.counter).toBe(5);
		expect(calls.logEntries[0]?.transaction).toBe('tx-signature');
	});

	it('logs a step the program rejected and reports failure', async () => {
		const rejected: SentTransaction = { signature: 'tx-rejected', err: { InstructionError: [0, { Custom: 6006 }] } };
		const { ports, calls } = fakePorts({ sendStep: async () => rejected });
		expect(await runCycle(ports)).toBe('failed');
		expect(calls.logEntries[0]?.err).toEqual(rejected.err);
		expect(calls.lines.at(-1)).toContain('VerifyFailed');
	});

	it('survives an unreachable RPC', async () => {
		const { ports, calls } = fakePorts({
			readAgent: async () => {
				throw new Error('fetch failed');
			}
		});
		expect(await runCycle(ports)).toBe('failed');
		expect(calls.lines.at(-1)).toContain('fetch failed');
	});

	it('survives a send that throws', async () => {
		const { ports } = fakePorts({
			sendStep: async () => {
				throw new Error('blockhash not found');
			}
		});
		expect(await runCycle(ports)).toBe('failed');
	});
});

describe('runLoop', () => {
	it('keeps cycling through failures until aborted', async () => {
		const controller = new AbortController();
		let reads = 0;
		const { ports } = fakePorts({
			readAgent: async () => {
				reads += 1;
				if (reads === 3) controller.abort();
				throw new Error('fetch failed');
			}
		});
		await runLoop(ports, 0, controller.signal);
		expect(reads).toBe(3);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent`
Expected: FAIL, cannot resolve `./decision` and `./agent-loop`.

- [ ] **Step 3: Implement `decision.ts`**

```ts
import { createHash } from 'node:crypto';
import type { Address } from '@solana/kit';

// The agent's fixed rule: every cycle records a TICK. A real rule replaces tickDecision; the program only sees the
// 32-byte hash, so it does not change.

export interface DecisionRecord {
	agent: Address;
	counter: number;
	decision: 'TICK';
	observedAt: string;
}

export function tickDecision(agent: Address, counter: bigint, observedAt: Date): DecisionRecord {
	return { agent, counter: Number(counter), decision: 'TICK', observedAt: observedAt.toISOString() };
}

/** SHA-256 of the record as JSON with a fixed key order and no whitespace, so anyone can recompute it from the log. */
export function hashDecision(record: DecisionRecord): Uint8Array {
	const canonical = JSON.stringify({
		agent: record.agent,
		counter: record.counter,
		decision: record.decision,
		observedAt: record.observedAt
	});
	return new Uint8Array(createHash('sha256').update(canonical).digest());
}
```

- [ ] **Step 4: Implement `agent-loop.ts`**

```ts
import { getBase16Decoder, type Address } from '@solana/kit';
import { hashDecision, tickDecision, type DecisionRecord } from './decision';
import { describeTransactionError } from './guard-errors';
import type { AgentState } from './instructions';
import { stepMessage } from './message';

/** What the cycle needs to know about a sent transaction. */
export interface SentTransaction {
	signature: string;
	err: unknown;
}

export interface DecisionLogEntry {
	record: DecisionRecord;
	decisionHash: string;
	transaction: string;
	err: unknown;
}

/** Everything a cycle touches outside itself, injected so the cycle can be tested without a network. */
export interface CyclePorts {
	agent: Address;
	readAgent(): Promise<AgentState>;
	sign(message: Uint8Array): Uint8Array;
	sendStep(decisionHash: Uint8Array, signature: Uint8Array): Promise<SentTransaction>;
	appendLog(entry: DecisionLogEntry): Promise<void>;
	now(): Date;
	log(line: string): void;
}

export type CycleOutcome = 'paused' | 'recorded' | 'failed';

/**
 * One agent cycle: read the on-chain state (the only source of truth), skip while killed, otherwise sign and send the
 * next step. Never throws: a failure is logged and the next cycle starts again from the on-chain state.
 */
export async function runCycle(ports: CyclePorts): Promise<CycleOutcome> {
	try {
		return await recordNextStep(ports);
	} catch (error) {
		ports.log(`cycle failed: ${error instanceof Error ? error.message : String(error)}`);
		return 'failed';
	}
}

async function recordNextStep(ports: CyclePorts): Promise<CycleOutcome> {
	const state = await ports.readAgent();
	if (state.status === 'Killed') {
		ports.log('paused: agent is killed');
		return 'paused';
	}
	const counter = state.counter + 1n;
	const record = tickDecision(ports.agent, counter, ports.now());
	const decisionHash = hashDecision(record);
	const signature = ports.sign(stepMessage(ports.agent, counter, decisionHash));
	const sent = await ports.sendStep(decisionHash, signature);
	await ports.appendLog({
		record,
		decisionHash: getBase16Decoder().decode(decisionHash),
		transaction: sent.signature,
		err: sent.err
	});
	if (sent.err !== null) {
		ports.log(`step ${counter} failed: ${describeTransactionError(sent.err)} (${sent.signature})`);
		return 'failed';
	}
	ports.log(`step ${counter} recorded (${sent.signature})`);
	return 'recorded';
}

/** Runs a cycle every `tickMs` until `signal` aborts. */
export async function runLoop(ports: CyclePorts, tickMs: number, signal: AbortSignal): Promise<void> {
	while (!signal.aborted) {
		await runCycle(ports);
		await sleep(tickMs, signal);
	}
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `~/.bun/bin/bun test src`
Expected: all pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/modules/agent/decision.ts src/lib/server/modules/agent/decision.test.ts src/lib/server/modules/agent/agent-loop.ts src/lib/server/modules/agent/agent-loop.test.ts
git commit -m "agent: rekord decyzji TICK i cykl agenta z wstrzykiwanymi zaleznosciami"
```

---

### Task 7: Transactions, program client, files and configuration

**Files:**
- Create: `src/lib/server/modules/agent/transaction.ts`
- Create: `src/lib/server/modules/agent/guard-client.ts`
- Create: `src/lib/server/modules/agent/files.ts`
- Create: `src/lib/server/modules/agent/config.ts`
- Create: `src/lib/server/modules/agent/cycle-ports.ts`
- Create: `.env.example`
- Test: `src/lib/server/modules/agent/files.test.ts`
- Test: `src/lib/server/modules/agent/config.test.ts`

`transaction.ts`, `guard-client.ts` and `cycle-ports.ts` are network glue with no unit tests; the devnet scripts in Tasks 8–9 exercise them.

**Interfaces:**
- Consumes: Task 1 `signGuardMessage`; Task 2 builders, `findAgentAddress`, `decodeAgent`, `AGENT_KEY_ACCOUNT_SIZE`, `AgentState`; Task 6 `CyclePorts`, `DecisionLogEntry`.
- Produces:
  - `transaction.ts`: `interface SolanaConnection { rpc; sendAndConfirm }`, `interface SendResult { signature: Signature; err: unknown; computeUnits: bigint | null; transactionBytes: number }`, `connect(rpcUrl: string, rpcSubscriptionsUrl: string): SolanaConnection`, `sendV1(connection, feePayer: TransactionSigner, instructions: readonly Instruction[], computeUnitLimit: number): Promise<SendResult>`
  - `guard-client.ts`: `interface GuardClient { connection: SolanaConnection; programAddress: Address }`, `fetchAgent(client, agent): Promise<AgentState>`, `registerAgent(client, owner, publicKey): Promise<{ agent; agentKey; result: SendResult }>`, `recordStep(client, { feePayer, agent, agentKey, decisionHash, signature }): Promise<SendResult>`, `killAgent(client, owner, agent): Promise<SendResult>`, `resumeAgent(client, { owner, agent, agentKey, signature }): Promise<SendResult>`
  - `files.ts`: `interface AgentFile { owner: Address; agentKey: Address; agent: Address; mldsaSecretKey: Uint8Array }`, `assertAgentFileAbsent(path)`, `saveAgentFile(path, file)`, `loadAgentFile(path): AgentFile`, `loadKeypairSigner(path): Promise<KeyPairSigner>`, `appendJsonLine(path, value)`
  - `config.ts`: `interface AgentConfig { programAddress; rpcUrl; rpcSubscriptionsUrl; tickMs; agentFilePath; decisionLogPath; feePayerPath; ownerPath: string | undefined }`, `loadConfig(env?): AgentConfig`
  - `cycle-ports.ts`: `createCyclePorts({ client, feePayer, agentFile, appendLog, log? }): CyclePorts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/modules/agent/files.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddressDecoder } from '@solana/kit';
import { appendJsonLine, assertAgentFileAbsent, loadAgentFile, saveAgentFile, type AgentFile } from './files';

const addressOf = (value: number) => getAddressDecoder().decode(new Uint8Array(32).fill(value));
const tempPath = (name: string) => join(mkdtempSync(join(tmpdir(), 'agent-files-')), name);
const AGENT_FILE: AgentFile = {
	owner: addressOf(1),
	agentKey: addressOf(2),
	agent: addressOf(3),
	mldsaSecretKey: new Uint8Array(2560).fill(4)
};

describe('agent file', () => {
	it('round-trips', () => {
		const path = tempPath('agent.json');
		saveAgentFile(path, AGENT_FILE);
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});

	it('never overwrites an existing agent file', () => {
		const path = tempPath('agent.json');
		saveAgentFile(path, AGENT_FILE);
		expect(() => assertAgentFileAbsent(path)).toThrow('already exists');
		expect(() => saveAgentFile(path, { ...AGENT_FILE, mldsaSecretKey: new Uint8Array(2560) })).toThrow('already exists');
		expect(loadAgentFile(path)).toEqual(AGENT_FILE);
	});
});

describe('appendJsonLine', () => {
	it('appends one line per value and writes bigints as numbers', () => {
		const path = tempPath('decisions.jsonl');
		appendJsonLine(path, { err: { InstructionError: [0, { Custom: 6000n }] } });
		appendJsonLine(path, { ok: true });
		expect(readFileSync(path, 'utf8')).toBe('{"err":{"InstructionError":[0,{"Custom":6000}]}}\n{"ok":true}\n');
	});
});
```

Create `src/lib/server/modules/agent/config.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { loadConfig } from './config';

const PROGRAM_ID = '11111111111111111111111111111111';
const REQUIRED = { GUARD_PROGRAM_ID: PROGRAM_ID, FEE_PAYER_KEYPAIR: 'payer.json' };

describe('loadConfig', () => {
	it('applies defaults for devnet', () => {
		expect(loadConfig(REQUIRED)).toEqual({
			programAddress: PROGRAM_ID,
			rpcUrl: 'https://api.devnet.solana.com',
			rpcSubscriptionsUrl: 'wss://api.devnet.solana.com',
			tickMs: 30_000,
			agentFilePath: '.devnet/agent.json',
			decisionLogPath: '.devnet/decisions.jsonl',
			feePayerPath: 'payer.json',
			ownerPath: undefined
		});
	});

	it('names a missing required variable', () => {
		expect(() => loadConfig({ FEE_PAYER_KEYPAIR: 'payer.json' })).toThrow('GUARD_PROGRAM_ID');
		expect(() => loadConfig({ GUARD_PROGRAM_ID: PROGRAM_ID })).toThrow('FEE_PAYER_KEYPAIR');
	});

	it('rejects a tick that is not a positive integer', () => {
		expect(() => loadConfig({ ...REQUIRED, AGENT_TICK_MS: '0' })).toThrow('AGENT_TICK_MS');
		expect(() => loadConfig({ ...REQUIRED, AGENT_TICK_MS: 'soon' })).toThrow('AGENT_TICK_MS');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `~/.bun/bin/bun test src/lib/server/modules/agent`
Expected: FAIL, cannot resolve `./files` and `./config`.

- [ ] **Step 3: Implement `files.ts`**

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { address, createKeyPairSignerFromBytes, type Address, type KeyPairSigner } from '@solana/kit';

/** Everything the server needs to run one registered agent, including its ML-DSA-44 secret key. */
export interface AgentFile {
	owner: Address;
	agentKey: Address;
	agent: Address;
	mldsaSecretKey: Uint8Array;
}

/** The agent file holds the only copy of the agent's secret key: refuse before anything could replace it. */
export function assertAgentFileAbsent(path: string): void {
	if (existsSync(path)) {
		throw new Error(`${path} already exists; it holds the only copy of an agent's ML-DSA-44 secret key`);
	}
}

export function saveAgentFile(path: string, file: AgentFile): void {
	assertAgentFileAbsent(path);
	mkdirSync(dirname(path), { recursive: true });
	const json = { ...file, mldsaSecretKey: Buffer.from(file.mldsaSecretKey).toString('base64') };
	writeFileSync(path, JSON.stringify(json, null, 2), { mode: 0o600, flag: 'wx' });
}

export function loadAgentFile(path: string): AgentFile {
	const json = JSON.parse(readFileSync(path, 'utf8'));
	return {
		owner: address(json.owner),
		agentKey: address(json.agentKey),
		agent: address(json.agent),
		mldsaSecretKey: new Uint8Array(Buffer.from(json.mldsaSecretKey, 'base64'))
	};
}

/** Reads a Solana CLI keypair file (JSON array of 64 bytes). */
export function loadKeypairSigner(path: string): Promise<KeyPairSigner> {
	return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

/** Appends one JSON line; bigints (e.g. RPC error codes) are written as numbers. */
export function appendJsonLine(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? Number(item) : item)) + '\n');
}
```

- [ ] **Step 4: Implement `config.ts`**

```ts
import { address, type Address } from '@solana/kit';

export interface AgentConfig {
	programAddress: Address;
	rpcUrl: string;
	rpcSubscriptionsUrl: string;
	tickMs: number;
	agentFilePath: string;
	decisionLogPath: string;
	feePayerPath: string;
	/** Only the owner commands (register, kill, resume) need it. */
	ownerPath: string | undefined;
}

type Env = Record<string, string | undefined>;

const DEFAULTS = {
	rpcUrl: 'https://api.devnet.solana.com',
	rpcSubscriptionsUrl: 'wss://api.devnet.solana.com',
	tickMs: 30_000,
	agentFilePath: '.devnet/agent.json',
	decisionLogPath: '.devnet/decisions.jsonl'
};

export function loadConfig(env: Env = process.env): AgentConfig {
	return {
		programAddress: address(required(env, 'GUARD_PROGRAM_ID')),
		rpcUrl: env.SOLANA_RPC_URL ?? DEFAULTS.rpcUrl,
		rpcSubscriptionsUrl: env.SOLANA_WS_URL ?? DEFAULTS.rpcSubscriptionsUrl,
		tickMs: positiveInteger(env, 'AGENT_TICK_MS', DEFAULTS.tickMs),
		agentFilePath: env.AGENT_FILE ?? DEFAULTS.agentFilePath,
		decisionLogPath: env.AGENT_DECISION_LOG ?? DEFAULTS.decisionLogPath,
		feePayerPath: required(env, 'FEE_PAYER_KEYPAIR'),
		ownerPath: env.OWNER_KEYPAIR
	};
}

function required(env: Env, name: string): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set (see .env.example)`);
	return value;
}

function positiveInteger(env: Env, name: string, fallback: number): number {
	const raw = env[name];
	if (raw === undefined) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
	return value;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `~/.bun/bin/bun test src`
Expected: all pass, 0 fail.

- [ ] **Step 6: Implement `transaction.ts`**

```ts
import {
	appendTransactionMessageInstructions,
	assertIsSendableTransaction,
	createSolanaRpc,
	createSolanaRpcSubscriptions,
	createTransactionMessage,
	getSignatureFromTransaction,
	getTransactionSize,
	pipe,
	sendAndConfirmTransactionFactory,
	setTransactionMessageComputeUnitLimit,
	setTransactionMessageFeePayerSigner,
	setTransactionMessageLifetimeUsingBlockhash,
	setTransactionMessageLoadedAccountsDataSizeLimit,
	setTransactionMessagePriorityFeeLamports,
	signTransactionMessageWithSigners,
	type Instruction,
	type Rpc,
	type Signature,
	type SolanaRpcApi,
	type TransactionSigner
} from '@solana/kit';

// V1 transactions (needed for the ~2.7 KB ML-DSA-44 signatures), pattern from
// spikes/mldsa44-dilithium-noble-compat/js/devnet-client.cjs.

/** V1 budgets zero bytes when unset. Covers the ~340 KB program data plus the 20.5 KB key account. */
const LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 512 * 1024;
const PRIORITY_FEE_LAMPORTS = 10_000n;
// getTransaction can return null for a few seconds after the send is confirmed.
const LEDGER_POLL_ATTEMPTS = 20;
const LEDGER_POLL_INTERVAL_MS = 1000;

export interface SolanaConnection {
	rpc: Rpc<SolanaRpcApi>;
	sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>;
}

export interface SendResult {
	signature: Signature;
	/** `null` when the transaction succeeded, otherwise the on-chain error. */
	err: unknown;
	computeUnits: bigint | null;
	transactionBytes: number;
}

export function connect(rpcUrl: string, rpcSubscriptionsUrl: string): SolanaConnection {
	const rpc = createSolanaRpc(rpcUrl);
	const rpcSubscriptions = createSolanaRpcSubscriptions(rpcSubscriptionsUrl);
	return { rpc, sendAndConfirm: sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions }) };
}

/**
 * Sends one V1 transaction and reads its outcome from the ledger. skipPreflight lets a failing transaction land, so a
 * program error comes back as `err` (with its CU) instead of a simulation exception.
 */
export async function sendV1(
	connection: SolanaConnection,
	feePayer: TransactionSigner,
	instructions: readonly Instruction[],
	computeUnitLimit: number
): Promise<SendResult> {
	const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();
	const message = pipe(
		createTransactionMessage({ version: 1 }),
		(m) => setTransactionMessageFeePayerSigner(feePayer, m),
		(m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
		(m) => setTransactionMessageComputeUnitLimit(computeUnitLimit, m),
		(m) => setTransactionMessagePriorityFeeLamports(PRIORITY_FEE_LAMPORTS, m),
		(m) => setTransactionMessageLoadedAccountsDataSizeLimit(LOADED_ACCOUNTS_DATA_SIZE_LIMIT, m),
		(m) => appendTransactionMessageInstructions(instructions, m)
	);
	const transaction = await signTransactionMessageWithSigners(message);
	assertIsSendableTransaction(transaction);
	const signature = getSignatureFromTransaction(transaction);
	const sendError = await connection
		.sendAndConfirm(transaction, { commitment: 'confirmed', skipPreflight: true })
		.then(
			() => null,
			(error: unknown) => error
		);
	const landed = await fetchLandedTransaction(connection.rpc, signature);
	if (!landed) throw sendError ?? new Error(`transaction ${signature} not found`);
	return {
		signature,
		err: landed.meta?.err ?? null,
		computeUnits: landed.meta?.computeUnitsConsumed ?? null,
		transactionBytes: getTransactionSize(transaction)
	};
}

async function fetchLandedTransaction(rpc: Rpc<SolanaRpcApi>, signature: Signature) {
	for (let attempt = 0; attempt < LEDGER_POLL_ATTEMPTS; attempt++) {
		const landed = await rpc
			.getTransaction(signature, { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 1 })
			.send();
		if (landed) return landed;
		await new Promise((resolve) => setTimeout(resolve, LEDGER_POLL_INTERVAL_MS));
	}
	return null;
}
```

If `svelte-check` or Bun reports a type error on `sendAndConfirm(transaction, …)` or `maxSupportedTransactionVersion: 1`, fix the types against `@solana/kit` 8.4.0's declarations without changing behavior (the JS form is proven in the spike).

- [ ] **Step 7: Implement `guard-client.ts`**

```ts
import { fetchEncodedAccount, generateKeyPairSigner, type Address, type TransactionSigner } from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
	AGENT_KEY_ACCOUNT_SIZE,
	decodeAgent,
	findAgentAddress,
	killInstruction,
	recordStepInstruction,
	registerAgentInstruction,
	resumeInstruction,
	type AgentState
} from './instructions';
import { sendV1, type SendResult, type SolanaConnection } from './transaction';

/** Preparing the 1,312 B key costs ~1.09M CU. */
const REGISTER_COMPUTE_UNIT_LIMIT = 1_400_000;
/** ML-DSA-44 verification ~260k CU plus Anchor. */
const SIGNED_COMPUTE_UNIT_LIMIT = 400_000;
const KILL_COMPUTE_UNIT_LIMIT = 50_000;

export interface GuardClient {
	connection: SolanaConnection;
	programAddress: Address;
}

export async function fetchAgent(client: GuardClient, agent: Address): Promise<AgentState> {
	const account = await fetchEncodedAccount(client.connection.rpc, agent);
	if (!account.exists) throw new Error(`agent account ${agent} not found (not registered, or wrong cluster)`);
	if (account.programAddress !== client.programAddress) {
		throw new Error(`account ${agent} belongs to ${account.programAddress}, not to GUARD_PROGRAM_ID ${client.programAddress}`);
	}
	return decodeAgent(new Uint8Array(account.data));
}

/** Creates the 20,552 B key account and registers the agent in one transaction; the owner pays. */
export async function registerAgent(client: GuardClient, owner: TransactionSigner, publicKey: Uint8Array) {
	const agentKey = await generateKeyPairSigner();
	const agent = await findAgentAddress(client.programAddress, owner.address, agentKey.address);
	const lamports = await client.connection.rpc.getMinimumBalanceForRentExemption(AGENT_KEY_ACCOUNT_SIZE).send();
	const instructions = [
		getCreateAccountInstruction({
			payer: owner,
			newAccount: agentKey,
			lamports,
			space: AGENT_KEY_ACCOUNT_SIZE,
			programAddress: client.programAddress
		}),
		registerAgentInstruction({ programAddress: client.programAddress, owner, agentKey: agentKey.address, agent, publicKey })
	];
	const result = await sendV1(client.connection, owner, instructions, REGISTER_COMPUTE_UNIT_LIMIT);
	return { agent, agentKey: agentKey.address, result };
}

export function recordStep(
	client: GuardClient,
	step: { feePayer: TransactionSigner; agent: Address; agentKey: Address; decisionHash: Uint8Array; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = recordStepInstruction({ programAddress: client.programAddress, ...step });
	return sendV1(client.connection, step.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}

export function killAgent(client: GuardClient, owner: TransactionSigner, agent: Address): Promise<SendResult> {
	const instruction = killInstruction({ programAddress: client.programAddress, owner, agent });
	return sendV1(client.connection, owner, [instruction], KILL_COMPUTE_UNIT_LIMIT);
}

export function resumeAgent(
	client: GuardClient,
	resume: { owner: TransactionSigner; agent: Address; agentKey: Address; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = resumeInstruction({ programAddress: client.programAddress, ...resume });
	return sendV1(client.connection, resume.owner, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}
```

- [ ] **Step 8: Implement `cycle-ports.ts`**

```ts
import type { TransactionSigner } from '@solana/kit';
import type { CyclePorts, DecisionLogEntry } from './agent-loop';
import type { AgentFile } from './files';
import { fetchAgent, recordStep, type GuardClient } from './guard-client';
import { signGuardMessage } from './message';

export function createCyclePorts(input: {
	client: GuardClient;
	feePayer: TransactionSigner;
	agentFile: AgentFile;
	appendLog: (entry: DecisionLogEntry) => Promise<void>;
	log?: (line: string) => void;
}): CyclePorts {
	const { client, feePayer, agentFile } = input;
	return {
		agent: agentFile.agent,
		readAgent: () => fetchAgent(client, agentFile.agent),
		sign: (message) => signGuardMessage(message, agentFile.mldsaSecretKey),
		sendStep: (decisionHash, signature) =>
			recordStep(client, { feePayer, agent: agentFile.agent, agentKey: agentFile.agentKey, decisionHash, signature }),
		appendLog: input.appendLog,
		now: () => new Date(),
		log: input.log ?? ((line) => console.log(`${new Date().toISOString()} ${line}`))
	};
}
```

- [ ] **Step 9: `.env.example`**

```dotenv
# onchain_agent_guard on devnet: the address printed by onchain/deploy-devnet.sh
GUARD_PROGRAM_ID=
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
# Pays the agent's step fees. On devnet the same wallet is the owner (register, kill, resume).
FEE_PAYER_KEYPAIR=spikes/falcon-noble-compat/.devnet/payer.json
OWNER_KEYPAIR=spikes/falcon-noble-compat/.devnet/payer.json
AGENT_TICK_MS=30000
# Holds the agent's ML-DSA-44 secret key; gitignored.
AGENT_FILE=.devnet/agent.json
AGENT_DECISION_LOG=.devnet/decisions.jsonl
```

- [ ] **Step 10: Type-check and test**

Run: `~/.bun/bin/bun test src && ~/.bun/bin/bun run check 2>&1 | tail -5`
Expected: tests 0 fail; `svelte-check` reports no errors in `src/lib/server/modules/agent/` (pre-existing warnings elsewhere may remain).

- [ ] **Step 11: Commit**

```bash
git add src/lib/server/modules/agent/{transaction,guard-client,files,config,cycle-ports}.ts src/lib/server/modules/agent/{files,config}.test.ts .env.example
git commit -m "agent: transakcje V1, klient programu, pliki agenta i konfiguracja"
```

---

### Task 8: Devnet deploy and the CLI

**Files:**
- Create: `onchain/deploy-devnet.sh`
- Create: `scripts/report.ts`
- Create: `scripts/agent.ts`
- Modify: `onchain/README.md`
- Local only (gitignored): `.env`, `.devnet/agent.json`

**Interfaces:**
- Consumes: Task 7 everything; Task 6 `runLoop`; Task 1 `resumeMessage`, `signGuardMessage`.
- Produces: `scripts/report.ts`: `reportSend(label: string, result: SendResult): boolean` (prints outcome, CU, size, explorer link; returns `result.err === null`); CLI commands `register | run | kill | resume | status`.

- [ ] **Step 1: Deploy script**

Create `onchain/deploy-devnet.sh` and `chmod +x onchain/deploy-devnet.sh`:

```bash
#!/usr/bin/env bash
# Builds onchain_agent_guard and deploys it to devnet at the address of onchain/.devnet/program-keypair.json. Running
# it again upgrades the program in place (upgrade authority: the payer). Usage: onchain/deploy-devnet.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/toolchain.sh"

PAYER="$REPO_DIR/spikes/falcon-noble-compat/.devnet/payer.json"
PROGRAM_KEYPAIR="$ONCHAIN_DIR/.devnet/program-keypair.json"
DEPLOY_PRIORITY_MICROLAMPORTS=10000
DEPLOY_MAX_SIGN_ATTEMPTS=100

solana_devnet() { toolchain solana --url devnet --keypair "$PAYER" "$@"; }

build_images
cd "$ONCHAIN_DIR"
toolchain anchor build --ignore-keys
echo "payer balance: $(solana_devnet balance)"
# Not --use-rpc: the public devnet RPC drops buffer writes ("Max retries exceeded"); the TPU path works.
solana_devnet program deploy target/deploy/onchain_agent_guard.so --program-id "$PROGRAM_KEYPAIR" \
  --with-compute-unit-price "$DEPLOY_PRIORITY_MICROLAMPORTS" --max-sign-attempts "$DEPLOY_MAX_SIGN_ATTEMPTS"
PROGRAM_ID=$(toolchain solana-keygen pubkey "$PROGRAM_KEYPAIR")
echo "GUARD_PROGRAM_ID=$PROGRAM_ID"
echo "https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
```

- [ ] **Step 2: Deploy**

Run: `onchain/deploy-devnet.sh 2>&1 | tail -6`
Expected: `Program Id: <PROGRAM_ID>` equal to the `declare_id!` in `lib.rs`, then the `GUARD_PROGRAM_ID=` line. Payer balance drops by ~2.4 SOL (program rent; the buffer is refunded).

Then: `cp .env.example .env` and set `GUARD_PROGRAM_ID` to the printed address.

- [ ] **Step 3: Shared report helper**

Create `scripts/report.ts`:

```ts
import { describeTransactionError } from '../src/lib/server/modules/agent/guard-errors';
import type { SendResult } from '../src/lib/server/modules/agent/transaction';

/** Prints a sent transaction's outcome, CU, size and explorer link; returns whether it succeeded. */
export function reportSend(label: string, result: SendResult): boolean {
	const outcome = result.err === null ? 'ok' : describeTransactionError(result.err);
	console.log(`${label}: ${outcome}, ${result.computeUnits} CU, ${result.transactionBytes} B`);
	console.log(`  https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
	return result.err === null;
}
```

- [ ] **Step 4: CLI**

Create `scripts/agent.ts`:

```ts
// Owner and agent CLI for onchain_agent_guard. Run from the repo root; Bun reads .env (see .env.example).
// Usage: bun scripts/agent.ts <register|run|kill|resume|status>
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getBase16Decoder } from '@solana/kit';
import { runLoop } from '../src/lib/server/modules/agent/agent-loop';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { createCyclePorts } from '../src/lib/server/modules/agent/cycle-ports';
import {
	appendJsonLine,
	assertAgentFileAbsent,
	loadAgentFile,
	loadKeypairSigner,
	saveAgentFile
} from '../src/lib/server/modules/agent/files';
import {
	fetchAgent,
	killAgent,
	registerAgent,
	resumeAgent,
	type GuardClient
} from '../src/lib/server/modules/agent/guard-client';
import { resumeMessage, signGuardMessage } from '../src/lib/server/modules/agent/message';
import { connect } from '../src/lib/server/modules/agent/transaction';
import { reportSend } from './report';

const USAGE = 'Usage: bun scripts/agent.ts <register|run|kill|resume|status>';

const config = loadConfig();
const client: GuardClient = {
	connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl),
	programAddress: config.programAddress
};

function loadOwner() {
	if (!config.ownerPath) throw new Error('OWNER_KEYPAIR is not set (see .env.example)');
	return loadKeypairSigner(config.ownerPath);
}

const commands: Record<string, () => Promise<boolean>> = {
	async register() {
		assertAgentFileAbsent(config.agentFilePath);
		const owner = await loadOwner();
		const keys = ml_dsa44.keygen();
		const { agent, agentKey, result } = await registerAgent(client, owner, keys.publicKey);
		if (!reportSend('register', result)) return false;
		saveAgentFile(config.agentFilePath, { owner: owner.address, agentKey, agent, mldsaSecretKey: keys.secretKey });
		console.log(`agent ${agent} saved to ${config.agentFilePath}`);
		return true;
	},

	async run() {
		const feePayer = await loadKeypairSigner(config.feePayerPath);
		const agentFile = loadAgentFile(config.agentFilePath);
		const controller = new AbortController();
		process.on('SIGINT', () => controller.abort());
		const ports = createCyclePorts({
			client,
			feePayer,
			agentFile,
			appendLog: async (entry) => appendJsonLine(config.decisionLogPath, entry)
		});
		console.log(`agent ${agentFile.agent}: one step every ${config.tickMs} ms, Ctrl+C to stop`);
		await runLoop(ports, config.tickMs, controller.signal);
		return true;
	},

	async kill() {
		const owner = await loadOwner();
		const { agent } = loadAgentFile(config.agentFilePath);
		return reportSend('kill', await killAgent(client, owner, agent));
	},

	async resume() {
		const owner = await loadOwner();
		const agentFile = loadAgentFile(config.agentFilePath);
		const state = await fetchAgent(client, agentFile.agent);
		const signature = signGuardMessage(resumeMessage(agentFile.agent, state.counter + 1n), agentFile.mldsaSecretKey);
		const result = await resumeAgent(client, { owner, agent: agentFile.agent, agentKey: agentFile.agentKey, signature });
		return reportSend('resume', result);
	},

	async status() {
		const { agent } = loadAgentFile(config.agentFilePath);
		const state = await fetchAgent(client, agent);
		console.log({ agent, ...state, lastDecision: getBase16Decoder().decode(state.lastDecision) });
		return true;
	}
};

const command = commands[process.argv[2] ?? ''];
if (!command) {
	console.error(USAGE);
	process.exit(2);
}
process.exitCode = (await command()) ? 0 : 1;
```

- [ ] **Step 5: Smoke-test the CLI on devnet**

```bash
cd /storage1/mydes/SolanaHackaton
~/.bun/bin/bun scripts/agent.ts register      # expect: register: ok, ~1.09M CU, ~1.75 KB; agent … saved
~/.bun/bin/bun scripts/agent.ts register      # expect: error ".devnet/agent.json already exists", nothing sent
~/.bun/bin/bun scripts/agent.ts status        # expect: status 'Active', counter 0n
AGENT_TICK_MS=5000 timeout -s INT 22 ~/.bun/bin/bun scripts/agent.ts run   # expect: 3–4 "step N recorded" lines
~/.bun/bin/bun scripts/agent.ts kill          # expect: kill: ok
AGENT_TICK_MS=5000 timeout -s INT 8 ~/.bun/bin/bun scripts/agent.ts run    # expect: "paused: agent is killed"
~/.bun/bin/bun scripts/agent.ts resume        # expect: resume: ok, ~260k CU
~/.bun/bin/bun scripts/agent.ts status        # expect: status 'Active', counter = steps + 1
tail -1 .devnet/decisions.jsonl               # expect: last record with its hash and transaction signature
```

- [ ] **Step 6: README**

Append to `onchain/README.md`:

```markdown
## Deploy to devnet

```sh
onchain/deploy-devnet.sh      # builds, deploys or upgrades at onchain/.devnet/program-keypair.json, prints GUARD_PROGRAM_ID
cp .env.example .env          # then set GUARD_PROGRAM_ID
```

The payer is `spikes/falcon-noble-compat/.devnet/payer.json`; the program (~340 KB) locks ~2.4 SOL rent. The
upgrade authority stays with the payer until the demo deploy (`solana program set-upgrade-authority --final`).

## Agent CLI

```sh
bun scripts/agent.ts register   # new ML-DSA-44 key + Agent; writes .devnet/agent.json (refuses to overwrite it)
bun scripts/agent.ts run        # the agent loop: one TICK step every AGENT_TICK_MS, log in .devnet/decisions.jsonl
bun scripts/agent.ts kill       # owner's wallet only
bun scripts/agent.ts resume     # owner's wallet + the agent's ML-DSA-44 signature
bun scripts/agent.ts status
```
```

- [ ] **Step 7: Commit**

```bash
git add onchain/deploy-devnet.sh onchain/README.md scripts/report.ts scripts/agent.ts
git status --short   # must not list .env or .devnet/
git commit -m "agent: deploy na devnet i CLI (register, run, kill, resume, status)"
```

---

### Task 9: Devnet end-to-end script

**Files:**
- Create: `scripts/devnet-e2e.ts`
- Modify: `onchain/README.md`

**Interfaces:**
- Consumes: Tasks 1–8 (`loadConfig`, `connect`, `loadKeypairSigner`, `registerAgent`, `fetchAgent`, `recordStep`, `killAgent`, `resumeAgent`, `createCyclePorts`, `runCycle`, `customErrorCode`, `GUARD_ERROR_CODES`, `stepMessage`, `resumeMessage`, `signGuardMessage`, `reportSend`).
- Produces: `bun scripts/devnet-e2e.ts` exiting 0 with `PASS` or 1 with `FAIL: …`.

- [ ] **Step 1: Write the script**

Create `scripts/devnet-e2e.ts`:

```ts
// End-to-end check of onchain_agent_guard on devnet with a fresh agent: register → 3 steps → kill (steps rejected)
// → resume → step. Needs the program deployed (onchain/deploy-devnet.sh) and .env set; the fee payer is also the
// owner. Costs ~0.15 SOL (key account rent). Usage: bun scripts/devnet-e2e.ts
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { getBase16Decoder } from '@solana/kit';
import { runCycle, type DecisionLogEntry } from '../src/lib/server/modules/agent/agent-loop';
import { loadConfig } from '../src/lib/server/modules/agent/config';
import { createCyclePorts } from '../src/lib/server/modules/agent/cycle-ports';
import { loadKeypairSigner, type AgentFile } from '../src/lib/server/modules/agent/files';
import { customErrorCode, GUARD_ERROR_CODES } from '../src/lib/server/modules/agent/guard-errors';
import {
	fetchAgent,
	killAgent,
	recordStep,
	registerAgent,
	resumeAgent,
	type GuardClient
} from '../src/lib/server/modules/agent/guard-client';
import { resumeMessage, signGuardMessage, stepMessage } from '../src/lib/server/modules/agent/message';
import { connect } from '../src/lib/server/modules/agent/transaction';
import { reportSend } from './report';

const STEPS_BEFORE_KILL = 3;
const failures: string[] = [];

function check(label: string, passed: boolean, detail = ''): void {
	console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
	if (!passed) failures.push(label);
}

const config = loadConfig();
const client: GuardClient = {
	connection: connect(config.rpcUrl, config.rpcSubscriptionsUrl),
	programAddress: config.programAddress
};
const payer = await loadKeypairSigner(config.feePayerPath);
const keys = ml_dsa44.keygen();

const registered = await registerAgent(client, payer, keys.publicKey);
if (!reportSend('register', registered.result)) {
	console.log('FAIL: register');
	process.exit(1);
}
const agentFile: AgentFile = {
	owner: payer.address,
	agentKey: registered.agentKey,
	agent: registered.agent,
	mldsaSecretKey: keys.secretKey
};
const { agent, agentKey } = agentFile;
const readAgent = () => fetchAgent(client, agent);
const logEntries: DecisionLogEntry[] = [];
const ports = {
	...createCyclePorts({ client, feePayer: payer, agentFile, appendLog: async (entry) => void logEntries.push(entry) }),
	// Same transaction as the cycle's own sendStep, reported with CU and size.
	sendStep: async (decisionHash: Uint8Array, signature: Uint8Array) => {
		const result = await recordStep(client, { feePayer: payer, agent, agentKey, decisionHash, signature });
		reportSend('record_step', result);
		return result;
	}
};
console.log(`agent ${agent}`);

let state = await readAgent();
check('registered agent is Active with counter 0', state.status === 'Active' && state.counter === 0n);

for (let step = 1; step <= STEPS_BEFORE_KILL; step++) {
	check(`cycle ${step} recorded`, (await runCycle(ports)) === 'recorded');
}
state = await readAgent();
check('counter is 3', state.counter === 3n, `counter ${state.counter}`);
check(
	'last_decision is the hash of the third record',
	getBase16Decoder().decode(state.lastDecision) === logEntries.at(-1)?.decisionHash
);

check('kill', reportSend('kill', await killAgent(client, payer, agent)));
state = await readAgent();
check('agent is Killed', state.status === 'Killed');
check('cycle sends nothing while killed', (await runCycle(ports)) === 'paused');
const decisionHash = new Uint8Array(32);
const forced = await recordStep(client, {
	feePayer: payer,
	agent,
	agentKey,
	decisionHash,
	signature: signGuardMessage(stepMessage(agent, state.counter + 1n, decisionHash), keys.secretKey)
});
reportSend('record_step while killed', forced);
check('step while killed fails with AgentKilled', customErrorCode(forced.err) === GUARD_ERROR_CODES.AgentKilled);

const resumeSignature = signGuardMessage(resumeMessage(agent, state.counter + 1n), keys.secretKey);
check('resume', reportSend('resume', await resumeAgent(client, { owner: payer, agent, agentKey, signature: resumeSignature })));
state = await readAgent();
check('resumed agent is Active with counter 4', state.status === 'Active' && state.counter === 4n, `counter ${state.counter}`);

check('cycle after resume recorded', (await runCycle(ports)) === 'recorded');
state = await readAgent();
check('counter is 5', state.counter === 5n, `counter ${state.counter}`);

console.log(failures.length === 0 ? 'PASS' : `FAIL: ${failures.join('; ')}`);
process.exitCode = failures.length === 0 ? 0 : 1;
```

- [ ] **Step 2: Run it**

Run: `cd /storage1/mydes/SolanaHackaton && ~/.bun/bin/bun scripts/devnet-e2e.ts`
Expected: every line `ok`, last line `PASS`, exit code 0. `record_step` and `resume` ~260k CU and ~2.7 KB; `register` ~1.09M CU and ~1.75 KB.

If a check fails, use superpowers:systematic-debugging before changing code.

- [ ] **Step 3: Record results**

Append to `onchain/README.md`, filling the table from the script's output (date in Europe/Warsaw):

```markdown
## Devnet result (<date>, `bun scripts/devnet-e2e.ts`: PASS)

| Step | CU | V1 tx |
|---|---:|---:|
| register (create key account + prepare key + init Agent) | … | … B |
| record_step | … | … B |
| kill | … | … B |
| record_step while killed → AgentKilled | … | … B |
| resume | … | … B |

Program: `<GUARD_PROGRAM_ID>`, agent: `<agent address>` (explorer links from the run).
```

- [ ] **Step 4: Full verification**

Run: `onchain/run-tests.sh 2>/dev/null | grep "test result"` → both `ok`, 0 failed.
Run: `~/.bun/bin/bun test src` → 0 fail.

- [ ] **Step 5: Commit**

```bash
git add scripts/devnet-e2e.ts onchain/README.md
git commit -m "agent: skrypt e2e na devnecie (register, kroki, kill, resume) i wyniki"
```
