# Merkle batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fast agent's decisions are buffered on the server and recorded on-chain many per transaction, as one ML-DSA-44 signature over their Merkle root, with per-decision proofs in the log, audited and shown in the GUI.

**Architecture:** New `record_batch(root, size, signature)` instruction in `onchain_agent_guard` (tag 3 message, counter +1, `BatchRecorded` event). Server: `merkle.ts` (tree, proofs), `flushBatch` next to `recordDecision`, a per-agent `DecisionBatcher` (buffer + timer + serial chain) wired into `submitDecision` for agents in `BATCHED_AGENT_IDS` (answer `202 {queued:true}`). Audit checks every batch against its log entries and proofs; GUI shows the Merkle root and batches.

**Tech Stack:** Anchor 1.2.1 / Mollusk (Docker toolchain via `onchain/run-tests.sh`), Bun + `bun:test`, SvelteKit 3 / Svelte 5, `@solana/kit`, `@noble/post-quantum`.

**Spec:** `docs/superpowers/specs/2026-10-11-merkle-batch-design.md`

## Global Constraints

- Program ID stays `BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`; the `Agent` account layout does not change.
- `batch_message = 3 ‖ agent (32 B) ‖ counter (u64 LE) ‖ root (32 B) ‖ size (u32 LE)`, FIPS 204 context `onchain-agent-guard:v1`.
- leaf = `SHA-256(0x00 ‖ decisionHash)`, node = `SHA-256(0x01 ‖ left ‖ right)`, odd last node moves up unchanged; hex in, hex out.
- `decisionHash` stays SHA-256 of `JSON.stringify(record)`.
- Batch records: `{ agent, counter, index, ...submission, observedAt }` (that key order); single steps have no `index`/`batch`.
- `.env`: `BATCHED_AGENT_IDS` (comma list, default empty), `BATCH_FLUSH_MS` (default 10000), `BATCH_MAX_DECISIONS` (default 16).
- A refusal (`GuardError`) logs nothing; any other failure logs entries `unconfirmed: true`.
- GUI label after a batch: "Quantum-Safe Merkle Root (SHA-256)"; after a step: "Last decision (SHA-256)".
- Repo rules: commit messages in Polish without diacritics like the history (`obszar: opis`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; decisions in `spec/decisions/` in Polish; tabs in TS (server/agents), 2 spaces in `.svelte`/`blink.service.ts` as they are now.
- Do not commit the user's pre-existing uncommitted change in `scripts/demo.ts` separately from Task 7; Task 7 adds to it and commits the file as a whole only after asking the user (see Task 7).

## Review Focus

1. A batch whose proof list was cut short or whose index is out of order must fail the audit, not pass — Task 6 pins "wrong index" and "bad proof".
2. A kill while decisions sit in the buffer: the timer flush is refused and nothing is logged; the server must not crash on that background rejection — Task 5 pins "refused timer flush is swallowed".
3. `latestDecision` / `proposalAwaiting` after a batch: `last_decision` is a root, not any record's hash — must find the batch's last entry, not throw `DecisionNotInLogError` — Task 4 pins it.
4. The transaction feed must not show a `BatchRecorded` as a kill/resume operator action — Task 8 pins it in `onchain-feed.test.ts`.
5. A decision with `requiresApproval` from a batched agent with a non-empty buffer must land after the buffered ones (higher counter) — Task 5 pins it.

---

### Task 1: Program — `record_batch`

**Files:**
- Modify: `onchain/programs/onchain_agent_guard/src/message.rs`
- Modify: `onchain/programs/onchain_agent_guard/src/lib.rs`
- Modify: `onchain/programs/onchain_agent_guard/src/state.rs`
- Modify: `onchain/programs/onchain_agent_guard/src/error.rs`
- Modify: `onchain/programs/onchain_agent_guard/tests/guard.rs`
- Modify: `onchain/programs/onchain_agent_guard/tests/message_vector.rs`
- Modify: `onchain/fixtures/message-vector.json`
- Modify: `scripts/gen-guard-fixtures.ts`
- Modify: `src/lib/server/modules/agent/message.ts`, `message.test.ts`
- Modify: `src/lib/server/modules/agent/guard-errors.ts`
- Generated: `src/lib/server/modules/agent/onchain_agent_guard.idl.json` (copied by `onchain/run-tests.sh`)

**Interfaces:**
- Produces (Rust): `message::batch_message(agent: &Pubkey, counter: u64, root: &[u8; 32], size: u32) -> Vec<u8>`; instruction `record_batch(root: [u8; 32], size: u32, signature: Vec<u8>)` with accounts `[agent (mut), agent_key]`; event `BatchRecorded { agent: Pubkey, counter: u64, root: [u8; 32], size: u32 }`; error `GuardError::EmptyBatch` (code 6007).
- Produces (TS): `batchMessage(agent: Address, counter: bigint, root: Uint8Array, size: number): Uint8Array` in `agent/message.ts`; `GUARD_ERROR_CODES.EmptyBatch = 6007`.

- [ ] **Step 1: Extend the shared vector (failing on both sides)**

`onchain/fixtures/message-vector.json` gains three fields (root `0a…`, size 5):

```json
  "batchRoot": "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a",
  "batchSize": 5,
  "batchMessage": "03070707070707070707070707070707070707070707070707070707070707070703000000000000000a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a05000000"
```

(`03` + `07`×32 + counter 3 as u64 LE + `0a`×32 + size 5 as u32 LE.)

`message.test.ts`, add:

```ts
	it('builds the batch message of the shared vector', () => {
		expect(batchMessage(agent, counter, bytes(vector.batchRoot), vector.batchSize)).toEqual(bytes(vector.batchMessage));
	});

	it('rejects a batch root that is not 32 bytes', () => {
		expect(() => batchMessage(agent, counter, new Uint8Array(31), 1)).toThrow(RangeError);
	});
```

(import `batchMessage` next to `stepMessage`).

`message_vector.rs`, extend the test:

```rust
use onchain_agent_guard::message::{batch_message, resume_message, step_message, CONTEXT};
// …inside messages_match_the_shared_vector, after the resume assert:
    let root: [u8; 32] = hex(field(&vector, "batchRoot")).try_into().unwrap();
    let size = vector["batchSize"].as_u64().unwrap() as u32;
    assert_eq!(batch_message(&agent, counter, &root, size), hex(field(&vector, "batchMessage")));
```

- [ ] **Step 2: Run the TS test to see it fail**

Run: `bun test src/lib/server/modules/agent/message.test.ts`
Expected: FAIL — `batchMessage` is not exported.

- [ ] **Step 3: Implement `batchMessage` in TS**

`agent/message.ts`:

```ts
const BATCH_TAG = 3;
// …
/** Message for the batch of `size` decisions with Merkle root `root` that moves the agent's counter to `counter`. */
export function batchMessage(agent: Address, counter: bigint, root: Uint8Array, size: number): Uint8Array {
	if (root.length !== DECISION_HASH_LENGTH) {
		throw new RangeError(`batch root must be ${DECISION_HASH_LENGTH} bytes, got ${root.length}`);
	}
	return Uint8Array.from([...header(BATCH_TAG, agent, counter), ...root, ...getU32Encoder().encode(size)]);
}
```

(add `getU32Encoder` to the `@solana/kit` import). Run `bun test src/lib/server/modules/agent/message.test.ts` → PASS.

- [ ] **Step 4: Rust message, error, event, instruction**

`message.rs`:

```rust
const BATCH_TAG: u8 = 3;
// …
/// Message for the batch of `size` decisions with Merkle root `root` that moves the agent's counter to `counter`.
pub fn batch_message(agent: &Pubkey, counter: u64, root: &[u8; DECISION_HASH_LEN], size: u32) -> Vec<u8> {
    let mut message = header(BATCH_TAG, agent, counter);
    message.extend_from_slice(root);
    message.extend_from_slice(&size.to_le_bytes());
    message
}
```

`error.rs` — append at the end (codes of the existing errors must not move):

```rust
    #[msg("A batch holds at least one decision")]
    EmptyBatch,
```

`state.rs` — after `StepRecorded`:

```rust
#[event]
pub struct BatchRecorded {
    pub agent: Pubkey,
    pub counter: u64,
    pub root: [u8; 32],
    pub size: u32,
}
```

and on `Agent.last_decision` a doc comment: `/// The last step's decision hash, or the last batch's Merkle root.`

`lib.rs` — import `batch_message` and `BatchRecorded`; after `record_step`:

```rust
    /// Records `size` decisions at once: one ML-DSA-44 signature over their Merkle root, built off-chain. The program
    /// never sees the decisions; the log keeps each one with its proof.
    pub fn record_batch(ctx: Context<RecordStep>, root: [u8; 32], size: u32, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentKilled);
        require!(size > 0, GuardError::EmptyBatch);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key, &batch_message(&agent_address, counter, &root, size), &signature)?;
        agent.counter = counter;
        agent.last_decision = root;
        emit!(BatchRecorded { agent: agent_address, counter, root, size });
        Ok(())
    }
```

Doc comment on `struct RecordStep`: `/// Accounts of record_step and record_batch.`

`guard-errors.ts`: add `EmptyBatch: 6007` to `GUARD_ERROR_CODES`.

- [ ] **Step 5: Fixtures for the batch**

`scripts/gen-guard-fixtures.ts` — must match `BATCH_ROOT`/`BATCH_SIZE` in guard.rs:

```ts
import { batchMessage, resumeMessage, signGuardMessage, stepMessage } from '../src/lib/server/modules/agent/message';
// Must match BATCH_ROOT and BATCH_SIZE in guard.rs.
const BATCH_COUNTER = 1n;
const BATCH_ROOT = new Uint8Array(32).fill(0xb7);
const BATCH_SIZE = 5;
// …after the resume fixture:
write(`batch-${BATCH_COUNTER}.sig`, signGuardMessage(batchMessage(agent, BATCH_COUNTER, BATCH_ROOT, BATCH_SIZE), keys.secretKey));
```

- [ ] **Step 6: Mollusk tests**

`guard.rs` — constants and helper:

```rust
const BATCH_1_SIGNATURE: &[u8] = include_bytes!("fixtures/batch-1.sig");
/// Must match BATCH_ROOT and BATCH_SIZE in scripts/gen-guard-fixtures.ts.
const BATCH_ROOT: [u8; 32] = [0xb7; 32];
const BATCH_SIZE: u32 = 5;

fn batch(root: [u8; 32], size: u32, signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::RecordBatch { root, size, signature: signature.to_vec() }.data(),
        vec![AccountMeta::new(agent_address(), false), AccountMeta::new_readonly(AGENT_KEY, false)],
    )
}
```

Tests:

```rust
#[test]
fn valid_batch_advances_the_counter_by_one_and_records_the_root() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("batch 1", &[batch(BATCH_ROOT, BATCH_SIZE, BATCH_1_SIGNATURE)]), Ok(()));
    let agent = ledger.agent();
    assert_eq!(agent.counter, 1);
    assert_eq!(agent.last_decision, BATCH_ROOT);
}

#[test]
fn batch_with_another_root_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("batch 1 other root", &[batch([0xb8; 32], BATCH_SIZE, BATCH_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn batch_with_another_size_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("batch 1 other size", &[batch(BATCH_ROOT, BATCH_SIZE + 1, BATCH_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn empty_batch_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("empty batch", &[batch(BATCH_ROOT, 0, BATCH_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::EmptyBatch)
    );
}

#[test]
fn step_signature_does_not_pass_as_a_batch() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("step 1 signature as batch", &[batch(decision_hash(1), BATCH_SIZE, STEP_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn replayed_batch_signature_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("batch 1", &[batch(BATCH_ROOT, BATCH_SIZE, BATCH_1_SIGNATURE)]), Ok(()));
    assert_eq!(
        ledger.send("batch 1 replayed", &[batch(BATCH_ROOT, BATCH_SIZE, BATCH_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn batch_on_a_killed_agent_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(
        ledger.send("batch while killed", &[batch(BATCH_ROOT, BATCH_SIZE, BATCH_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentKilled)
    );
}

#[test]
fn step_after_a_batch_uses_the_next_counter() {
    let mut ledger = Ledger::registered();
    assert_eq!(ledger.send("batch 1", &[batch(BATCH_ROOT, BATCH_SIZE, BATCH_1_SIGNATURE)]), Ok(()));
    assert_eq!(ledger.send("step 2", &[step(2, STEP_2_SIGNATURE)]), Ok(()));
    assert_eq!(ledger.agent().counter, 2);
}
```

- [ ] **Step 7: Build, regenerate fixtures and IDL, run all Rust tests**

Run: `onchain/run-tests.sh 2>/dev/null`
Expected: all tests pass; the log line for `batch 1` shows ~270k CU (same as a step). `src/lib/server/modules/agent/onchain_agent_guard.idl.json` now lists `record_batch`, `BatchRecorded`, `EmptyBatch`.

- [ ] **Step 8: TS tests against the new IDL**

`idl.test.ts` stays as is for now (Task 2 adds the new discriminators). Run: `bun test src/lib/server/modules/agent`
Expected: PASS (error codes match the IDL including `EmptyBatch`).

- [ ] **Step 9: Commit**

```bash
git add onchain/ scripts/gen-guard-fixtures.ts src/lib/server/modules/agent/message.ts src/lib/server/modules/agent/message.test.ts src/lib/server/modules/agent/guard-errors.ts src/lib/server/modules/agent/onchain_agent_guard.idl.json
git commit -m "program: record_batch - jeden podpis ML-DSA-44 nad korzeniem Merkle paczki decyzji, zdarzenie BatchRecorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Check `git status` first: the fixtures under `tests/fixtures/` are tracked or ignored as before — follow what `git status` shows, do not add `target/`.)

---

### Task 2: TS chain client and guard port — `recordBatch`

**Files:**
- Modify: `src/lib/server/modules/agent/instructions.ts`, `instructions.test.ts`, `idl.test.ts`
- Modify: `src/lib/server/modules/agent/events.ts`, `events.test.ts`
- Modify: `src/lib/server/modules/agent/guard-client.ts`
- Modify: `src/lib/server/modules/agent-guard/guard.ts`
- Modify: `src/lib/server/modules/agent-guard/onchain-guard.ts`, `onchain-guard.test.ts`
- Modify: `src/lib/server/modules/fleet/testing/memory-guard.ts`
- Modify: `src/lib/server/modules/fleet/latest-decision.test.ts` (its hand-made `AgentGuard` gains `recordBatch: unused`)

**Interfaces:**
- Consumes: `batchMessage` (Task 1).
- Produces:
  - `DISCRIMINATORS.recordBatch`, `DISCRIMINATORS.batchRecorded`;
  - `recordBatchInstruction({ programAddress, agent, agentKey, root: Uint8Array, size: number, signature })`;
  - events.ts `GuardEvent` gains `{ name: 'BatchRecorded'; agent: Address; counter: bigint; root: Uint8Array; size: number }`;
  - guard-client `recordBatch(client, batch: { feePayer; agent; agentKey; root: Uint8Array; size: number; signature })`;
  - guard.ts: `GuardEvent` union gains `'BatchRecorded'`; `LandedTransaction` gains `root?: string; size?: number` (batches only); `AgentGuard.recordBatch(agentId: string, counter: number, root: string, size: number): Promise<GuardAccount>`;
  - `MemoryGuard.recordBatch` with the same rules as `recordStep`.

- [ ] **Step 1: Failing tests**

`instructions.test.ts`:

```ts
import { recordBatchInstruction /* …existing */ } from './instructions';
// in 'discriminators':
	it('names record_batch and BatchRecorded like Anchor', () => {
		expect(DISCRIMINATORS.recordBatch).toEqual(anchorDiscriminator('global', 'record_batch'));
		expect(DISCRIMINATORS.batchRecorded).toEqual(anchorDiscriminator('event', 'BatchRecorded'));
	});

describe('recordBatchInstruction', () => {
	it('encodes root, u32 LE size and the Borsh signature after the discriminator', () => {
		const signature = filled(ML_DSA_44_SIGNATURE_LENGTH, 6);
		const instruction = recordBatchInstruction({ programAddress: PROGRAM, agent: AGENT, agentKey: AGENT_KEY, root: filled(32, 0xb7), size: 5, signature });
		expect(instruction.accounts.map((account) => account.role)).toEqual([AccountRole.WRITABLE, AccountRole.READONLY]);
		expect(instruction.data).toEqual(
			Uint8Array.from([...DISCRIMINATORS.recordBatch, ...filled(32, 0xb7), 5, 0, 0, 0, ...[0x74, 0x09, 0, 0], ...signature])
		);
	});
});
```

(import `anchorDiscriminator`; `0x0974` = 2420.)

`idl.test.ts`: add `expect(Array.from(DISCRIMINATORS.recordBatch)).toEqual(instructionDiscriminator('record_batch')!);` and `expect(Array.from(DISCRIMINATORS.batchRecorded)).toEqual(eventDiscriminator('BatchRecorded')!);`.

`events.test.ts`:

```ts
import { getU32Encoder /* + existing */ } from '@solana/kit';
	it('decodes BatchRecorded with its root and size', () => {
		const root = new Uint8Array(32).fill(0xb7);
		const logs = invoked(PROGRAM, dataLine(DISCRIMINATORS.batchRecorded, ...agentAndCounter(5n), root, getU32Encoder().encode(16)));
		expect(parseGuardEvents(logs, PROGRAM)).toEqual([{ name: 'BatchRecorded', agent: AGENT, counter: 5n, root, size: 16 }]);
	});
```

`onchain-guard.test.ts` — add `recordBatch: async (_, batch) => land('recordBatch', batch)` to `fakeChain`'s `calls`, then:

```ts
import { batchMessage, GUARD_CONTEXT, resumeMessage, stepMessage } from '../agent/message';
const ROOT = 'b7'.repeat(32);
const ROOT_BYTES = new Uint8Array(getBase16Encoder().encode(ROOT));

describe('recordBatch', () => {
	test("signs the batch message for the counter with the agent's key and reports the landed batch", async () => {
		const chain = fakeChain();
		const landed: LandedTransaction[] = [];
		const account = await guardOver(chain, signer(OWNER), landed).recordBatch(AGENT_ID, 12, ROOT, 5);

		expect(account).toMatchObject({ counter: 12, lastDecision: ROOT });
		const { action, input } = chain.sent[0];
		expect(action).toBe('recordBatch');
		expect(input).toMatchObject({ feePayer: FEE_PAYER, agent: AGENT, agentKey: AGENT_KEY, root: ROOT_BYTES, size: 5 });
		const signed = batchMessage(AGENT, 12n, ROOT_BYTES, 5);
		expect(ml_dsa44.verify(input.signature as Uint8Array, signed, KEYS.publicKey, { context: GUARD_CONTEXT })).toBe(true);
		expect(landed).toEqual([{ agentId: AGENT_ID, event: 'BatchRecorded', counter: 12, signature: 'tx-signature', root: ROOT, size: 5 }]);
	});

	test('refuses a killed agent and a stale counter without sending', async () => {
		expect(await guardErrorCode(guardOver(fakeChain({ status: 'Killed' })).recordBatch(AGENT_ID, 12, ROOT, 5))).toBe('AgentKilled');
		const chain = fakeChain();
		expect(await guardErrorCode(guardOver(chain).recordBatch(AGENT_ID, 11, ROOT, 5))).toBe('CounterMismatch');
		expect(chain.sent).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to see them fail**

Run: `bun test src/lib/server/modules/agent src/lib/server/modules/agent-guard`
Expected: FAIL — `recordBatchInstruction`, `DISCRIMINATORS.recordBatch`, `recordBatch` missing.

- [ ] **Step 3: Implement**

`instructions.ts`: add to `DISCRIMINATORS` `recordBatch: anchorDiscriminator('global', 'record_batch')` and `batchRecorded: anchorDiscriminator('event', 'BatchRecorded')`; add:

```ts
export function recordBatchInstruction(input: {
	programAddress: Address;
	agent: Address;
	agentKey: Address;
	root: Uint8Array;
	size: number;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.agentKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.recordBatch, input.root, getU32Encoder().encode(input.size), borshBytes(input.signature))
	};
}
```

`events.ts`: add the union member, a decoder and a branch:

```ts
	| { name: 'BatchRecorded'; agent: Address; counter: bigint; root: Uint8Array; size: number }
// …
const batchRecordedDecoder = getStructDecoder([
	['agent', getAddressDecoder()],
	['counter', getU64Decoder()],
	['root', fixDecoderSize(getBytesDecoder(), DECISION_HASH_LENGTH)],
	['size', getU32Decoder()]
]);
// in decodeEvent, after the StepRecorded branch:
	if (equalBytes(discriminator, DISCRIMINATORS.batchRecorded)) {
		const event = batchRecordedDecoder.decode(data, DISCRIMINATOR_LENGTH);
		return { name: 'BatchRecorded', ...event, root: new Uint8Array(event.root) };
	}
```

`guard-client.ts`:

```ts
export function recordBatch(
	client: GuardClient,
	batch: { feePayer: TransactionSigner; agent: Address; agentKey: Address; root: Uint8Array; size: number; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = recordBatchInstruction({ programAddress: client.programAddress, ...batch });
	return sendV1(client.connection, batch.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}
```

`guard.ts`: `GuardEvent = 'StepRecorded' | 'BatchRecorded' | 'AgentKilled' | 'AgentResumed'`; in `LandedTransaction` after `decisionHash?`:

```ts
	/** Batches only: the Merkle root and the number of decisions under it. */
	root?: string;
	size?: number;
```

In `AgentGuard`, after `recordStep`:

```ts
	/**
	 * Records `size` decisions under Merkle root `root` as step `counter`, with one signature. Same refusals as
	 * recordStep.
	 */
	recordBatch(agentId: string, counter: number, root: string, size: number): Promise<GuardAccount>;
```

`onchain-guard.ts`: add `recordBatch` to `ChainCalls` and `PROGRAM_CHAIN_CALLS`; extract the shared preflight of `recordStep` into a private method and use it in both:

```ts
	/** The agent's state when it may take step `counter`: active, `counter` next, and the fee payer funded. */
	private async readStateForStep(agentId: string, counter: number): Promise<AgentState> {
		const state = await this.readState(agentId);
		if (state.status === 'Killed') throw new GuardError('AgentKilled', `agent ${agentId} is killed`);
		if (BigInt(counter) !== state.counter + 1n) {
			throw new GuardError('CounterMismatch', `agent ${agentId} is at step ${state.counter}, not ${counter - 1}`);
		}
		await this.assertCanPay(this.deps.feePayer, `step ${counter} of agent ${agentId}`);
		return state;
	}

	async recordBatch(agentId: string, counter: number, root: string, size: number): Promise<GuardAccount> {
		const identity = this.deps.identityOf(agentId);
		const state = await this.readStateForStep(agentId, counter);
		const rootBytes = new Uint8Array(getBase16Encoder().encode(root));
		const signature = signGuardMessage(batchMessage(identity.agent, BigInt(counter), rootBytes, size), identity.mldsaSecretKey);
		const batch = { feePayer: this.deps.feePayer, agent: identity.agent, agentKey: identity.agentKey, root: rootBytes, size, signature };
		const result = await this.chain.recordBatch(this.deps.client, batch);
		assertLanded(result, 'record_batch');
		this.deps.onLanded?.({ agentId, event: 'BatchRecorded', counter, signature: result.signature, root, size });
		return { ...toGuardAccount(state), counter, lastDecision: root };
	}
```

`memory-guard.ts`:

```ts
	async recordBatch(agentId: string, counter: number, root: string): Promise<GuardAccount> {
		return this.recordStep(agentId, counter, root);
	}
```

`latest-decision.test.ts` `guardHolding`: `return { readAgent: async () => account, recordStep: unused, recordBatch: unused, kill: unused, resume: unused };`

- [ ] **Step 4: Run tests and type check**

Run: `bun test src/lib/server && bun run check`
Expected: PASS, 0 errors (svelte-check also type-checks the server modules).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/agent src/lib/server/modules/agent-guard src/lib/server/modules/fleet/testing/memory-guard.ts src/lib/server/modules/fleet/latest-decision.test.ts
git commit -m "serwer: klient record_batch, zdarzenie BatchRecorded i AgentGuard.recordBatch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Merkle tree module

**Files:**
- Create: `src/lib/server/modules/fleet/merkle.ts`
- Test: `src/lib/server/modules/fleet/merkle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProofStep { hash: string; side: 'left' | 'right' }   // side of the sibling
  export function merkleRoot(decisionHashes: readonly string[]): string;            // throws RangeError on []
  export function merkleProof(decisionHashes: readonly string[], index: number): ProofStep[];
  export function verifyProof(decisionHash: string, proof: readonly ProofStep[], root: string): boolean;
  ```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { merkleProof, merkleRoot, verifyProof } from './merkle';

const hashOf = (n: number) => createHash('sha256').update(String(n)).digest('hex');
const hashes = (count: number) => Array.from({ length: count }, (_, n) => hashOf(n));
const sha256 = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest('hex');
const leaf = (hash: string) => sha256(Buffer.from([0]), Buffer.from(hash, 'hex'));
const node = (left: string, right: string) => sha256(Buffer.from([1]), Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));

describe('merkleRoot', () => {
	test('of one decision is its leaf, not the bare hash', () => {
		expect(merkleRoot([hashOf(0)])).toBe(leaf(hashOf(0)));
		expect(merkleRoot([hashOf(0)])).not.toBe(hashOf(0));
	});

	test('of three moves the odd leaf up unchanged', () => {
		const [a, b, c] = hashes(3);
		expect(merkleRoot([a, b, c])).toBe(node(node(leaf(a), leaf(b)), leaf(c)));
	});

	test('differs when the order of decisions differs', () => {
		const [a, b] = hashes(2);
		expect(merkleRoot([a, b])).not.toBe(merkleRoot([b, a]));
	});

	test('refuses an empty batch', () => {
		expect(() => merkleRoot([])).toThrow(RangeError);
	});
});

describe('merkleProof', () => {
	test.each([1, 2, 3, 5, 16, 17])('every decision of %i proves against the root', (count) => {
		const all = hashes(count);
		const root = merkleRoot(all);
		all.forEach((hash, index) => expect(verifyProof(hash, merkleProof(all, index), root)).toBe(true));
	});

	test('a proof does not hold for another decision or another root', () => {
		const all = hashes(5);
		const proof = merkleProof(all, 2);
		expect(verifyProof(all[3], proof, merkleRoot(all))).toBe(false);
		expect(verifyProof(all[2], proof, merkleRoot(hashes(6)))).toBe(false);
	});

	test('a proof cut short does not hold', () => {
		const all = hashes(8);
		expect(verifyProof(all[0], merkleProof(all, 0).slice(0, -1), merkleRoot(all))).toBe(false);
	});

	test('refuses an index outside the batch', () => {
		expect(() => merkleProof(hashes(3), 3)).toThrow(RangeError);
	});
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bun test src/lib/server/modules/fleet/merkle.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
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

export function merkleProof(decisionHashes: readonly string[], index: number): ProofStep[] {
	if (!Number.isInteger(index) || index < 0 || index >= decisionHashes.length) {
		throw new RangeError(`index ${index} is outside a batch of ${decisionHashes.length}`);
	}
	const proof: ProofStep[] = [];
	let position = index;
	for (const level of levels(decisionHashes).slice(0, -1)) {
		const sibling = position ^ 1;
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
```

Note: a node moved up unchanged produces no proof step at that level (`sibling < level.length` is false), which `verifyProof` handles since it only hashes the steps it gets.

- [ ] **Step 4: Run** — `bun test src/lib/server/modules/fleet/merkle.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet/merkle.ts src/lib/server/modules/fleet/merkle.test.ts
git commit -m "serwer: drzewo Merkle nad paczka decyzji - korzen, dowod wlaczenia, weryfikacja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `flushBatch`, log entry with proof, latest decision by root

**Files:**
- Modify: `src/lib/server/modules/fleet/fleet.ts` (types, `findDecision`)
- Modify: `src/lib/server/modules/fleet/record-decision.ts`
- Create: `src/lib/server/modules/fleet/flush-batch.test.ts`
- Modify: `src/lib/server/modules/fleet/latest-decision.test.ts`
- Modify: `src/lib/fleet-feed.ts` (`FeedEntry.batch`, type only here)

**Interfaces:**
- Consumes: `merkleRoot`, `merkleProof`, `ProofStep` (Task 3); `AgentGuard.recordBatch` (Task 2).
- Produces:
  - `DecisionRecord.index?: number`;
  - `DecisionLogEntry.batch?: { root: string; size: number; proof: ProofStep[] }`;
  - `export interface QueuedDecision { submission: DecisionSubmission; observedAt: string }` in `record-decision.ts`;
  - `export async function flushBatch(runtime: FleetRuntime, agentId: string, queued: readonly QueuedDecision[]): Promise<DecisionLogEntry[]>`;
  - `Fleet.findDecision(agentId, hash)` also matches `entry.batch?.root === hash` (returns the newest such entry, i.e. the batch's last index).

- [ ] **Step 1: Failing tests**

`flush-batch.test.ts` (same setup as `submit-decision.test.ts`):

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuardError, type AgentGuard } from '../agent-guard/guard';
import { Fleet } from './fleet';
import { merkleRoot, verifyProof } from './merkle';
import { flushBatch, hashDecisionRecord, type QueuedDecision } from './record-decision';
import { StepThrottle } from './step-throttle';
import type { FleetRuntime } from './submit-decision';
import { MemoryGuard } from './testing/memory-guard';
import { TEST_SEAL } from './testing/test-seal';

const OWNER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const AGENT = 'tick-01';
const NOW = new Date('2026-10-11T12:00:00.000Z');
const queued = (n: number): QueuedDecision => ({
	submission: { kind: 'tick', decision: { n }, summary: `TICK ${n}` },
	observedAt: new Date(NOW.getTime() + n).toISOString()
});

let rootDir: string;
let runtime: FleetRuntime;

beforeEach(() => {
	rootDir = mkdtempSync(join(tmpdir(), 'flush-'));
	const fleet = new Fleet(join(rootDir, 'fleet'));
	fleet.register({ id: AGENT, name: 'Tick', riskLevel: 'LOW', registeredAt: NOW.getTime() }, TEST_SEAL);
	runtime = { guard: new MemoryGuard(AGENT, OWNER), fleet, throttle: new StepThrottle(0), now: () => NOW };
});

afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

describe('flushBatch', () => {
	test('records the batch as one step under the Merkle root and logs every decision with its proof', async () => {
		const entries = await flushBatch(runtime, AGENT, [queued(0), queued(1), queued(2)]);

		const hashes = entries.map((entry) => entry.decisionHash);
		const root = merkleRoot(hashes);
		expect(await runtime.guard.readAgent(AGENT)).toMatchObject({ counter: 1, lastDecision: root });
		expect(runtime.fleet.decisions(AGENT)).toEqual(entries);
		entries.forEach((entry, index) => {
			expect(entry.record).toEqual({ agent: AGENT, counter: 1, index, ...queued(index).submission, observedAt: queued(index).observedAt });
			expect(entry.decisionHash).toBe(hashDecisionRecord(entry.record));
			expect(entry.batch).toMatchObject({ root, size: 3 });
			expect(verifyProof(entry.decisionHash, entry.batch!.proof, root)).toBe(true);
		});
	});

	test('does nothing for an empty buffer', async () => {
		expect(await flushBatch(runtime, AGENT, [])).toEqual([]);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(0);
	});

	test('logs nothing when the guard refuses the batch', async () => {
		await runtime.guard.kill(AGENT, OWNER);
		const error = await flushBatch(runtime, AGENT, [queued(0)]).catch((caught: unknown) => caught);
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(runtime.fleet.decisions(AGENT)).toEqual([]);
	});

	test('logs the decisions as unconfirmed when the guard fails without a verdict', async () => {
		const timingOut: AgentGuard = {
			...runtime.guard,
			readAgent: (agentId) => runtime.guard.readAgent(agentId),
			recordBatch: async () => {
				throw new Error('confirmation timed out');
			}
		};
		await flushBatch({ ...runtime, guard: timingOut }, AGENT, [queued(0), queued(1)]).catch(() => undefined);
		expect(runtime.fleet.decisions(AGENT).map((entry) => entry.unconfirmed)).toEqual([true, true]);
	});
});
```

`latest-decision.test.ts`, add (uses the file's `fleet`, `entry`, `guardHolding`, `runtimeWith`):

```ts
	test("after a batch, finds the batch's last decision by the root the chain holds", async () => {
		const root = 'cc'.repeat(32);
		fleet.appendDecision(AGENT, { ...entry(3, HASH_A), batch: { root, size: 2, proof: [] } });
		fleet.appendDecision(AGENT, { ...entry(3, HASH_B), batch: { root, size: 2, proof: [] } });
		expect((await latestDecision(runtimeWith(guardHolding(root)), AGENT))?.decisionHash).toBe(HASH_B);
	});
```

(If `entry()` there builds the record with its own hash, keep its signature; only the `decisionHash` matters for this lookup.)

- [ ] **Step 2: Run to see them fail**

Run: `bun test src/lib/server/modules/fleet/flush-batch.test.ts src/lib/server/modules/fleet/latest-decision.test.ts`
Expected: FAIL — `flushBatch` missing; latest-decision throws `DecisionNotInLogError`.

- [ ] **Step 3: Implement**

`fleet.ts`:

```ts
import type { ProofStep } from './merkle';
// DecisionRecord, after counter:
	/** In a batch: the record's place in the batch's Merkle tree, 0..size-1. Absent on a single step. */
	index?: number;
// DecisionLogEntry, after unconfirmed:
	/** Present when the record went on-chain in a batch: its root, the batch's size and the record's proof. */
	batch?: { root: string; size: number; proof: ProofStep[] };
```

and `findDecision`:

```ts
	/**
	 * The newest log entry with that hash, or in the batch with that root (the batch's last decision); for the hash the
	 * guard holds, the record of the last recorded step.
	 */
	findDecision(agentId: string, hash: string): DecisionLogEntry | undefined {
		return this.readLog(agentId)
			.reverse()
			.find((entry) => entry.decisionHash === hash || entry.batch?.root === hash);
	}
```

`record-decision.ts`:

```ts
import { merkleProof, merkleRoot } from './merkle';

/** A decision a batched agent submitted, waiting in the buffer for the next flush. */
export interface QueuedDecision {
	submission: DecisionSubmission;
	observedAt: string;
}

/**
 * Records the buffered decisions as the agent's next step: one signature over their Merkle root. Logs each record with
 * its proof, so anyone can check a single decision against the root on-chain without the rest of the batch.
 */
export async function flushBatch(
	runtime: FleetRuntime,
	agentId: string,
	queued: readonly QueuedDecision[]
): Promise<DecisionLogEntry[]> {
	if (queued.length === 0) return [];
	const account = await runtime.guard.readAgent(agentId);
	runtime.fleet.assertSealed(agentId);
	const counter = account.counter + 1;
	const records: DecisionRecord[] = queued.map(({ submission, observedAt }, index) => ({
		agent: agentId,
		counter,
		index,
		...submission,
		observedAt
	}));
	const hashes = records.map(hashDecisionRecord);
	const root = merkleRoot(hashes);
	const entries = records.map((record, index) => ({
		record,
		decisionHash: hashes[index],
		batch: { root, size: records.length, proof: merkleProof(hashes, index) }
	}));
	try {
		await runtime.guard.recordBatch(agentId, counter, root, records.length);
	} catch (error) {
		if (!(error instanceof GuardError)) {
			for (const entry of entries) runtime.fleet.appendDecision(agentId, { ...entry, unconfirmed: true });
		}
		throw error;
	}
	for (const entry of entries) runtime.fleet.appendDecision(agentId, entry);
	return entries;
}
```

`fleet-feed.ts` `FeedEntry`: add `/** Present when the decision went on-chain in a batch. */ batch?: { root: string; size: number };` and `index?: number` in `record`.

- [ ] **Step 4: Run** — `bun test src/lib/server && bun run check` → PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/modules/fleet src/lib/fleet-feed.ts
git commit -m "serwer: flushBatch - paczka decyzji jednym record_batch, w logu kazda decyzja z dowodem Merkle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `DecisionBatcher`, `submitDecision` 202, config and route

**Files:**
- Create: `src/lib/server/modules/fleet/decision-batcher.ts`, `decision-batcher.test.ts`
- Modify: `src/lib/server/modules/fleet/submit-decision.ts`, `submit-decision.test.ts`
- Modify: `src/lib/server/modules/fleet/runtime.ts`, `runtime.test.ts` (if it asserts the runtime's shape)
- Modify: `src/env.ts`
- Modify: `src/routes/api/agents/[id]/decisions/+server.ts`

**Interfaces:**
- Consumes: `flushBatch`, `QueuedDecision` (Task 4).
- Produces:
  ```ts
  export interface BatchPolicy { agentIds: ReadonlySet<string>; flushMs: number; maxDecisions: number }
  export type FlushBatch = (agentId: string, queued: QueuedDecision[]) => Promise<unknown>;
  export class DecisionBatcher {
    constructor(policy: BatchPolicy, flush: FlushBatch);
    batches(agentId: string): boolean;
    queued(agentId: string): number;
    enqueue(agentId: string, decision: QueuedDecision): void;
    flushNow(agentId: string): Promise<void>;
    serially<T>(agentId: string, task: () => Promise<T>): Promise<T>;
  }
  export function batchPolicyFrom(env: Record<string, string | undefined>): BatchPolicy;
  ```
  `FleetRuntime.batcher?: DecisionBatcher`; `submitDecision` returns `Promise<{ counter: number } | { queued: true }>`.

- [ ] **Step 1: Failing batcher tests**

```ts
import { describe, expect, test } from 'bun:test';
import { batchPolicyFrom, DecisionBatcher, type BatchPolicy } from './decision-batcher';
import type { QueuedDecision } from './record-decision';

const AGENT = 'tick-01';
const FLUSH_MS = 20;
const policy = (overrides: Partial<BatchPolicy> = {}): BatchPolicy => ({
	agentIds: new Set([AGENT]),
	flushMs: FLUSH_MS,
	maxDecisions: 3,
	...overrides
});
const decision = (n: number): QueuedDecision => ({ submission: { kind: 'tick', decision: { n }, summary: `#${n}` }, observedAt: '' });

function recordingFlush() {
	const flushed: number[][] = [];
	const flush = async (_: string, queued: QueuedDecision[]) => {
		flushed.push(queued.map((q) => q.submission.decision.n as number));
	};
	return { flushed, flush };
}

describe('DecisionBatcher', () => {
	test('batches only the agents in the policy', () => {
		const batcher = new DecisionBatcher(policy(), recordingFlush().flush);
		expect(batcher.batches(AGENT)).toBe(true);
		expect(batcher.batches('sentinel-01')).toBe(false);
	});

	test('flushes the buffer when the timer fires', async () => {
		const { flushed, flush } = recordingFlush();
		const batcher = new DecisionBatcher(policy(), flush);
		batcher.enqueue(AGENT, decision(1));
		batcher.enqueue(AGENT, decision(2));
		expect(batcher.queued(AGENT)).toBe(2);
		await Bun.sleep(FLUSH_MS * 3);
		expect(flushed).toEqual([[1, 2]]);
		expect(batcher.queued(AGENT)).toBe(0);
	});

	test('flushes at once when the buffer is full', async () => {
		const { flushed, flush } = recordingFlush();
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), flush);
		[1, 2, 3].forEach((n) => batcher.enqueue(AGENT, decision(n)));
		await batcher.serially(AGENT, async () => undefined);
		expect(flushed).toEqual([[1, 2, 3]]);
	});

	test('runs flushes and other tasks of one agent one at a time, in order', async () => {
		const order: string[] = [];
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), async () => {
			await Bun.sleep(10);
			order.push('flush');
		});
		batcher.enqueue(AGENT, decision(1));
		const flushing = batcher.flushNow(AGENT);
		const after = batcher.serially(AGENT, async () => void order.push('step'));
		await Promise.all([flushing, after]);
		expect(order).toEqual(['flush', 'step']);
	});

	test('a refused timer flush is reported, not thrown, and the next task still runs', async () => {
		const batcher = new DecisionBatcher(policy(), async () => {
			throw new Error('agent tick-01 is killed');
		});
		batcher.enqueue(AGENT, decision(1));
		await Bun.sleep(FLUSH_MS * 3);
		expect(await batcher.serially(AGENT, async () => 'ran')).toBe('ran');
	});

	test('flushNow passes a refusal to its caller', async () => {
		const batcher = new DecisionBatcher(policy({ flushMs: 60_000 }), async () => {
			throw new Error('refused');
		});
		batcher.enqueue(AGENT, decision(1));
		expect(batcher.flushNow(AGENT)).rejects.toThrow('refused');
	});
});

describe('batchPolicyFrom', () => {
	test('defaults: nobody batches, 10 s, 16 decisions', () => {
		expect(batchPolicyFrom({})).toEqual({ agentIds: new Set(), flushMs: 10_000, maxDecisions: 16 });
	});

	test('reads the comma-separated ids and the numbers', () => {
		const env = { BATCHED_AGENT_IDS: 'tick-01, fast-02', BATCH_FLUSH_MS: '2000', BATCH_MAX_DECISIONS: '8' };
		expect(batchPolicyFrom(env)).toEqual({ agentIds: new Set(['tick-01', 'fast-02']), flushMs: 2000, maxDecisions: 8 });
	});

	test('refuses a non-positive number', () => {
		expect(() => batchPolicyFrom({ BATCH_FLUSH_MS: '0' })).toThrow('BATCH_FLUSH_MS');
	});
});
```

- [ ] **Step 2: Run to see it fail** — `bun test src/lib/server/modules/fleet/decision-batcher.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `decision-batcher.ts`**

```ts
import type { QueuedDecision } from './record-decision';

// The buffer of a fast agent: its decisions wait here and go on-chain together, one record_batch per flush. A flush
// runs when the buffer is full or its timer fires. Flushes and single steps of one agent run one at a time, so they
// never race for the agent's next counter. Kept in memory: a restart loses what was not flushed, which never reached
// the chain either.

export interface BatchPolicy {
	agentIds: ReadonlySet<string>;
	flushMs: number;
	maxDecisions: number;
}

export type FlushBatch = (agentId: string, queued: QueuedDecision[]) => Promise<unknown>;

type Env = Record<string, string | undefined>;

const DEFAULT_FLUSH_MS = 10_000;
const DEFAULT_MAX_DECISIONS = 16;

export function batchPolicyFrom(env: Env): BatchPolicy {
	const ids = (env.BATCHED_AGENT_IDS ?? '').split(',').map((id) => id.trim()).filter((id) => id !== '');
	return {
		agentIds: new Set(ids),
		flushMs: positiveInteger(env, 'BATCH_FLUSH_MS', DEFAULT_FLUSH_MS),
		maxDecisions: positiveInteger(env, 'BATCH_MAX_DECISIONS', DEFAULT_MAX_DECISIONS)
	};
}

export class DecisionBatcher {
	private readonly buffers = new Map<string, QueuedDecision[]>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** Per agent, the tail of its chain of flushes and steps; never rejects. */
	private readonly tails = new Map<string, Promise<unknown>>();

	constructor(
		private readonly policy: BatchPolicy,
		private readonly flush: FlushBatch
	) {}

	batches(agentId: string): boolean {
		return this.policy.agentIds.has(agentId);
	}

	queued(agentId: string): number {
		return this.buffers.get(agentId)?.length ?? 0;
	}

	enqueue(agentId: string, decision: QueuedDecision): void {
		const buffer = this.buffers.get(agentId) ?? [];
		buffer.push(decision);
		this.buffers.set(agentId, buffer);
		if (buffer.length >= this.policy.maxDecisions) this.flushInBackground(agentId);
		else if (!this.timers.has(agentId)) {
			this.timers.set(agentId, setTimeout(() => this.flushInBackground(agentId), this.policy.flushMs));
		}
	}

	/** Flushes the agent's buffer after whatever of its work is already running; rejects with the flush's error. */
	flushNow(agentId: string): Promise<void> {
		return this.serially(agentId, () => this.flushBuffer(agentId));
	}

	serially<T>(agentId: string, task: () => Promise<T>): Promise<T> {
		const run = (this.tails.get(agentId) ?? Promise.resolve()).then(task);
		this.tails.set(agentId, run.catch(() => undefined));
		return run;
	}

	/** Takes the buffer when the flush starts, so decisions that arrived while it waited go with it. */
	private async flushBuffer(agentId: string): Promise<void> {
		clearTimeout(this.timers.get(agentId));
		this.timers.delete(agentId);
		const queued = this.buffers.get(agentId) ?? [];
		this.buffers.delete(agentId);
		if (queued.length > 0) await this.flush(agentId, queued);
	}

	/** No caller waits for a timer or full-buffer flush, so its failure is reported here. */
	private flushInBackground(agentId: string): void {
		this.flushNow(agentId).catch((error: unknown) =>
			console.warn(`agent ${agentId}: batch not recorded: ${error instanceof Error ? error.message : error}`)
		);
	}
}

function positiveInteger(env: Env, name: string, fallback: number): number {
	const raw = env[name];
	if (raw === undefined || raw === '') return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer, got "${raw}"`);
	return value;
}
```

Run `bun test src/lib/server/modules/fleet/decision-batcher.test.ts` → PASS.

- [ ] **Step 4: Failing `submitDecision` tests**

In `submit-decision.test.ts`, add:

```ts
import { DecisionBatcher } from './decision-batcher';
import { flushBatch } from './record-decision';

describe('batched agents', () => {
	function batched(): FleetRuntime {
		const withBatcher: FleetRuntime = { ...runtime };
		withBatcher.batcher = new DecisionBatcher(
			{ agentIds: new Set([AGENT]), flushMs: 60_000, maxDecisions: 16 },
			(agentId, queued) => flushBatch(withBatcher, agentId, queued)
		);
		return withBatcher;
	}

	test('queues the decision and answers at once, without the throttle or the chain', async () => {
		const fast = { ...batched(), throttle: new StepThrottle(10_000) };
		expect(await submitDecision(fast, AGENT, SUBMISSION)).toEqual({ queued: true });
		expect(await submitDecision(fast, AGENT, SUBMISSION)).toEqual({ queued: true });
		expect(fast.batcher!.queued(AGENT)).toBe(2);
		expect((await runtime.guard.readAgent(AGENT)).counter).toBe(0);
	});

	test('refuses a decision while the agent is killed, before queueing it', async () => {
		const fast = batched();
		await runtime.guard.kill(AGENT, OWNER);
		const error = await submitDecision(fast, AGENT, SUBMISSION).catch((caught: unknown) => caught);
		expect((error as GuardError).code).toBe('AgentKilled');
		expect(fast.batcher!.queued(AGENT)).toBe(0);
	});

	test('a proposal flushes the buffer first and lands after it as a single step', async () => {
		const fast = batched();
		await submitDecision(fast, AGENT, SUBMISSION);
		await submitDecision(fast, AGENT, SUBMISSION);
		expect(await submitDecision(fast, AGENT, PROPOSAL)).toEqual({ counter: 2 });

		const log = runtime.fleet.decisions(AGENT);
		expect(log.map((entry) => [entry.record.counter, entry.batch?.size ?? null])).toEqual([[1, 2], [1, 2], [2, null]]);
		expect((await runtime.guard.readAgent(AGENT)).lastDecision).toBe(log[2].decisionHash);
	});
});
```

Run: `bun test src/lib/server/modules/fleet/submit-decision.test.ts` → FAIL (`batcher` not used; returns `{counter}` after recording).

- [ ] **Step 5: Implement in `submit-decision.ts`**

```ts
import { GuardError, type AgentGuard, type GuardAccount } from '../agent-guard/guard';
import type { DecisionBatcher } from './decision-batcher';
// FleetRuntime, after throttle:
	/** Buffers the decisions of the agents in BATCHED_AGENT_IDS; without it every agent records one step per decision. */
	batcher?: DecisionBatcher;

export type SubmitResult = { counter: number } | { queued: true };

/**
 * Records the agent's decision as its next step, or for a batched agent queues it for the next batch. Refused while
 * its proposal waits for a verdict (before the throttle, so a waiting agent spends nothing) and while the agent is
 * killed.
 */
export async function submitDecision(runtime: FleetRuntime, agentId: string, submission: DecisionSubmission): Promise<SubmitResult> {
	assertInFleet(runtime, agentId);
	const account = await runtime.guard.readAgent(agentId);
	if (proposalAwaiting(runtime.fleet, agentId, account)) {
		throw new AwaitingApprovalError(`agent ${agentId} is waiting for the owner's verdict on its proposal`);
	}
	if (runtime.batcher?.batches(agentId)) return submitBatched(runtime, runtime.batcher, agentId, account, submission);
	runtime.throttle.claim(agentId, runtime.now().getTime());
	const { record } = await recordDecision(runtime, agentId, account, submission);
	return { counter: record.counter };
}

/**
 * Queues the decision, unless it is a proposal: the owner must see it on-chain before the agent goes on, so the buffer
 * is flushed first and the proposal follows as a single step.
 */
async function submitBatched(
	runtime: FleetRuntime,
	batcher: DecisionBatcher,
	agentId: string,
	account: GuardAccount,
	submission: DecisionSubmission
): Promise<SubmitResult> {
	if (account.status === 'Killed') throw new GuardError('AgentKilled', `agent ${agentId} is killed`);
	if (!submission.requiresApproval) {
		batcher.enqueue(agentId, { submission, observedAt: runtime.now().toISOString() });
		return { queued: true };
	}
	await batcher.flushNow(agentId);
	return batcher.serially(agentId, async () => {
		const { record } = await recordDecision(runtime, agentId, await runtime.guard.readAgent(agentId), submission);
		return { counter: record.counter };
	});
}
```

(Remove `AgentGuard` from the import if unused.)

- [ ] **Step 6: Wire the runtime, env and route**

`src/env.ts` — add to `defineEnvVars`:

```ts
	BATCHED_AGENT_IDS: { schema: optional, description: 'comma-separated agent ids whose decisions go on-chain in batches' },
	BATCH_FLUSH_MS: { schema: optional, description: 'how often a batched agent\'s buffer is flushed, ms' },
	BATCH_MAX_DECISIONS: { schema: optional, description: 'a batched agent\'s buffer flushes at once at this many decisions' }
```

`runtime.ts` `createFleetRuntime`:

```ts
import { batchPolicyFrom, DecisionBatcher } from './decision-batcher';
import { flushBatch } from './record-decision';
// …replace the return:
	const runtime: FleetRuntime = { guard, fleet, throttle: new StepThrottle(MIN_STEP_INTERVAL_MS), now };
	runtime.batcher = new DecisionBatcher(batchPolicyFrom(env), (agentId, queued) => flushBatch(runtime, agentId, queued));
	return runtime;
```

`decisions/+server.ts` POST:

```ts
const ACCEPTED = 202;
// …
		const result = await submitDecision(await getFleetRuntime(), params.id!, submission);
		return json(result, { status: 'queued' in result ? ACCEPTED : 200 });
```

and in its doc comment add: "202 with `{ queued: true }` for an agent in BATCHED_AGENT_IDS: the decision waits for the next batch."

- [ ] **Step 7: Run everything** — `bun test src/lib/server && bun run check` → PASS, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/env.ts src/lib/server/modules/fleet src/routes/api/agents
git commit -m "serwer: bufor decyzji szybkiego agenta - flush co BATCH_FLUSH_MS lub przy BATCH_MAX_DECISIONS, odpowiedz 202

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Audit of batches

**Files:**
- Modify: `src/lib/server/modules/fleet/audit.ts`, `audit.test.ts`
- Modify: `scripts/audit.ts` (print `batches`)

**Interfaces:**
- Consumes: `merkleRoot`, `verifyProof` (Task 3); `GuardEvent` `BatchRecorded` (Task 2); `DecisionLogEntry.batch` (Task 4).
- Produces: `AuditReport.batches: number`.

- [ ] **Step 1: Failing tests**

In `audit.test.ts`: every existing `toEqual({ steps, resumes, kills, logEntries, newer, problems })` gains `batches: 0`. Then add helpers and tests:

```ts
import { merkleProof, merkleRoot } from './merkle';

/** A batch of `size` decisions at `counter`, logged with proofs, and its on-chain event. */
function batchAt(counter: number, size: number) {
	const records = Array.from({ length: size }, (_, index) => ({
		agent: 'tick-01',
		counter,
		index,
		kind: 'tick',
		decision: {},
		summary: `TICK ${index}`,
		observedAt: `2026-10-11T12:00:0${index}.000Z`
	}));
	const hashes = records.map(hashDecisionRecord);
	const root = merkleRoot(hashes);
	const entries: DecisionLogEntry[] = records.map((record, index) => ({
		record,
		decisionHash: hashes[index],
		batch: { root, size, proof: merkleProof(hashes, index) }
	}));
	const event: GuardEvent = { name: 'BatchRecorded', agent: AGENT, counter: BigInt(counter), root: toBytes(root), size };
	return { entries, event, root };
}

function stateAtRoot(counter: number, root: string): AgentState {
	return { ...stateAfter(counter, undefined), lastDecision: toBytes(root) };
}

describe('batches', () => {
	it('finds no problem when every decision of the batch is logged with a valid proof', () => {
		const batch = batchAt(2, 3);
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(2, batch.root), events: [step(one), batch.event], log: [one, ...batch.entries] });
		expect(report).toEqual({ steps: 1, batches: 1, resumes: 0, kills: 0, logEntries: 4, newer: 0, problems: [] });
	});

	it('reports a decision missing from the batch', () => {
		const batch = batchAt(1, 3);
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(1, batch.root), events: [batch.event], log: batch.entries.slice(0, 2) });
		expect(report.problems).toContain('batch 1: 2 log entries, the batch holds 3');
	});

	it('reports log indexes that are not 0..size-1', () => {
		const batch = batchAt(1, 2);
		const swapped = [{ ...batch.entries[0] }, { ...batch.entries[1], record: { ...batch.entries[1].record, index: 0 } }];
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(1, batch.root), events: [batch.event], log: swapped });
		expect(report.problems).toContain('batch 1: log indexes are not 0..1');
	});

	it('reports a proof that does not lead to the root', () => {
		const batch = batchAt(1, 4);
		const broken = batch.entries.map((entry, index) => (index === 2 ? { ...entry, batch: { ...entry.batch!, proof: entry.batch!.proof.slice(1) } } : entry));
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(1, batch.root), events: [batch.event], log: broken });
		expect(report.problems).toContain('batch 1, decision 2: its proof does not lead to the root');
	});

	it('reports a batch on-chain that the log does not hold', () => {
		const batch = batchAt(1, 2);
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(1, batch.root), events: [batch.event], log: [] });
		expect(report.problems).toContain('batch 1: on-chain, but not in the log');
	});

	it('reports batch entries whose batch is not on-chain', () => {
		const batch = batchAt(1, 2);
		const report = auditHistory({ agent: AGENT, state: stateAtRoot(1, batch.root), events: [], log: batch.entries });
		expect(report.problems).toContain('log step 1: not recorded on-chain with this hash');
	});

	it('checks the account against the root of the latest batch', () => {
		const batch = batchAt(2, 2);
		const report = auditHistory({ agent: AGENT, state: stateAfter(2, one), events: [step(one), batch.event], log: [one, ...batch.entries] });
		expect(report.problems).toContain(`account: last decision is ${one.decisionHash}, the last step recorded ${batch.root}`);
	});
});
```

Run: `bun test src/lib/server/modules/fleet/audit.test.ts` → FAIL.

- [ ] **Step 2: Implement in `audit.ts`**

```ts
import { merkleRoot, verifyProof } from './merkle';
type BatchEvent = EventNamed<'BatchRecorded'>;
/** A step or a batch: what `last_decision` holds after it. */
type Recorded = { counter: bigint; hash: Uint8Array };
```

In `auditHistory`:

```ts
	const batches = eventsNamed(events, 'BatchRecorded');
	// …in the return object, after steps:
		batches: batches.length,
	// …problems:
			...counterProblems([...steps, ...batches, ...resumes], input.state.counter),
			...lastDecisionProblems(recordedHashes(steps, batches), input.state.lastDecision),
			...logHashProblems(log),
			...unloggedStepProblems(steps, log),
			...batchProblems(batches, log),
			...unrecordedLogProblems(log, steps, batches)
```

Replace `lastDecisionProblems`/`latestStep` with:

```ts
function recordedHashes(steps: readonly StepEvent[], batches: readonly BatchEvent[]): Recorded[] {
	return [
		...steps.map((step) => ({ counter: step.counter, hash: step.decisionHash })),
		...batches.map((batch) => ({ counter: batch.counter, hash: batch.root }))
	];
}

/** The account keeps the newest step's hash or batch's root, so it must match what the history ends with. */
function lastDecisionProblems(recorded: readonly Recorded[], lastDecision: Uint8Array): string[] {
	const latest = recorded.reduce<Recorded | undefined>((newest, item) => (!newest || item.counter > newest.counter ? item : newest), undefined);
	if (!latest || toHex(latest.hash) === toHex(lastDecision)) return [];
	return [`account: last decision is ${toHex(lastDecision)}, the last step recorded ${toHex(latest.hash)}`];
}
```

Add:

```ts
/**
 * Every batch on-chain needs all its decisions in the log, at its counter and with its root: indexes 0..size-1, each
 * proof leading to the root, and the tree over them giving the root.
 */
function batchProblems(batches: readonly BatchEvent[], log: readonly DecisionLogEntry[]): string[] {
	return batches.flatMap((batch) => {
		const root = toHex(batch.root);
		const entries = log.filter((entry) => BigInt(entry.record.counter) === batch.counter && entry.batch?.root === root);
		if (entries.length === 0) return [`batch ${batch.counter}: on-chain, but not in the log`];
		return batchEntryProblems(batch, root, entries);
	});
}

function batchEntryProblems(batch: BatchEvent, root: string, entries: readonly DecisionLogEntry[]): string[] {
	const problems: string[] = [];
	if (entries.length !== batch.size) problems.push(`batch ${batch.counter}: ${entries.length} log entries, the batch holds ${batch.size}`);
	const ordered = [...entries].sort((a, b) => (a.record.index ?? -1) - (b.record.index ?? -1));
	if (ordered.some((entry, position) => entry.record.index !== position)) {
		problems.push(`batch ${batch.counter}: log indexes are not 0..${entries.length - 1}`);
	}
	for (const entry of ordered) {
		if (!verifyProof(entry.decisionHash, entry.batch!.proof, root)) {
			problems.push(`batch ${batch.counter}, decision ${entry.record.index}: its proof does not lead to the root`);
		}
	}
	if (merkleRoot(ordered.map((entry) => entry.decisionHash)) !== root) {
		problems.push(`batch ${batch.counter}: the log's decisions do not hash to the root`);
	}
	return problems;
}
```

Change `unrecordedLogProblems`:

```ts
/**
 * A log entry claims its step or batch was recorded on-chain, unless it is marked unconfirmed (the send may not have
 * landed). A batch entry is matched by its root.
 */
function unrecordedLogProblems(log: readonly DecisionLogEntry[], steps: readonly StepEvent[], batches: readonly BatchEvent[]): string[] {
	const recorded = new Set(recordedHashes(steps, batches).map((item) => stepKey(item.counter, toHex(item.hash))));
	return log
		.filter((entry) => !entry.unconfirmed && !recorded.has(stepKey(entry.record.counter, entry.batch?.root ?? entry.decisionHash)))
		.map((entry) => `log step ${entry.record.counter}: not recorded on-chain with this hash`);
}
```

`scripts/audit.ts` `printReport`: `on-chain: ${audit.steps} steps, ${audit.batches} batches, ${audit.resumes} resumes, …`.

- [ ] **Step 3: Run** — `bun test src/lib/server/modules/fleet/audit.test.ts && bun run check` → PASS. If the "indexes" test also triggers the proof/root messages, that is expected; it asserts with `toContain`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/modules/fleet/audit.ts src/lib/server/modules/fleet/audit.test.ts scripts/audit.ts
git commit -m "audyt: paczki - komplet decyzji w logu, indeksy, dowody Merkle i korzen zgodne z BatchRecorded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Agent client, Tick and the demo

**Files:**
- Modify: `agents/shared/runtime-client.ts`, `runtime-client.test.ts`
- Modify: `agents/tick/README.md` (one line on 202)
- Modify: `scripts/demo.ts`

**Interfaces:**
- Produces: `SubmitOutcome` gains `{ kind: 'queued' }`; `describeSubmitOutcome` → `'queued for the next batch'`.

- [ ] **Step 1: Failing test** in `runtime-client.test.ts` (uses the file's `answering` helper):

```ts
	it('reads 202 as queued for the next batch', async () => {
		const { fetchFn } = answering(202, { queued: true });
		const client = createRuntimeClient('http://server', 'tick-01', fetchFn);
		expect(await client.submit({ kind: 'tick', decision: {}, summary: 'TICK' })).toEqual({ kind: 'queued' });
		expect(describeSubmitOutcome({ kind: 'queued' })).toBe('queued for the next batch');
	});
```

(Match the exact call shape of `answering` in that file — read lines 1–30 first.) Run `bun test agents/shared` → FAIL.

- [ ] **Step 2: Implement** in `runtime-client.ts`:

```ts
	| { kind: 'queued' }
// …
/** The server answers 202 when the agent's decisions go on-chain in batches: this one waits for the next. */
const HTTP_ACCEPTED = 202;
// in submit, first thing after the unreachable check:
			if (answer.response.status === HTTP_ACCEPTED) return { kind: 'queued' };
// in describeSubmitOutcome:
		case 'queued':
			return 'queued for the next batch';
```

Run `bun test agents && bun run check` → PASS.

- [ ] **Step 3: Demo runs Tick batched**

Ask the user before editing `scripts/demo.ts`: it holds their uncommitted change (fleet and port preflight). With their OK, in `scripts/demo.ts` find where the server and Tick are spawned (the env passed to each) and add:
- to the server's env: `BATCHED_AGENT_IDS: <the Tick id from AGENT_IDS[1]>`;
- to Tick's env: `TICK_INTERVAL_MS: '1000'`;
as a named constant next to `DEMO_PACE`, e.g. `const TICK_BATCHED = { TICK_INTERVAL_MS: '1000' };`. Read the file first; keep the user's preflight lines as they are.

Note: SvelteKit reads server variables from `.env`, not the shell (see `src/env.ts`). Check whether `demo.ts` passes env to `vite dev` in a way SvelteKit picks up; if it does not, tell the user to add `BATCHED_AGENT_IDS=tick-01` to `.env` instead, and print that hint from `demo.ts` when the variable is not set.

`agents/tick/README.md`: "With the server's `BATCHED_AGENT_IDS` naming this agent, the server answers 202 and records TICKs in batches (one transaction per batch); the log line says `queued for the next batch`."

- [ ] **Step 4: Commit** (with the user's OK about `demo.ts`):

```bash
git add agents/shared agents/tick/README.md scripts/demo.ts
git commit -m "agenci: 202 jako zakolejkowana decyzja; demo uruchamia Tick co 1 s w paczkach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: GUI — Merkle root, batches in the feed, queued count

**Files:**
- Modify: `src/lib/fleet-feed.ts`, `src/lib/fleet-feed.test.ts`
- Modify: `src/lib/server/modules/fleet/onchain-feed.ts`, `onchain-feed.test.ts`
- Modify: `src/lib/components/DecisionFeed.svelte`
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `FeedEntry.batch`, `LandedTransaction.root/size`, `FleetRuntime.batcher`, `Fleet.findDecision` by root.
- Produces:
  - `FeedRow.batch: { root: string; size: number; index: number } | null`;
  - `TimelineRow` gains `{ type: 'batch'; key: string; counter: number; root: string; size: number; signature: string | null; rows: FeedRow[] }`;
  - `AgentStatusRecord.lastBatchSize: number | null` (size of the batch whose root `last_decision` holds; null after a single step and for mocks); `FleetDetails.queued: number`.

- [ ] **Step 1: Failing tests**

`onchain-feed.test.ts`:

```ts
	test("gives a batch's decisions the batch transaction's signature and keeps the batch out of the operator actions", () => {
		const root = 'cd'.repeat(32);
		const inBatch = (counter: number, index: number): DecisionLogEntry => ({
			...decision(counter),
			decisionHash: `${index}`.padStart(64, 'e'),
			batch: { root, size: 2, proof: [] }
		});
		const batchTx: LoggedTransaction = { agentId: SENTINEL, event: 'BatchRecorded', counter: 7, signature: 'sig-batch', root, size: 2, landedAt: NOW };
		const { entries, operatorActions } = withTransactions([inBatch(7, 1), inBatch(7, 0)], [batchTx]);
		expect(entries.map((entry) => entry.signature)).toEqual(['sig-batch', 'sig-batch']);
		expect(operatorActions).toEqual([]);
	});
```

`fleet-feed.test.ts`:

```ts
describe('batches in the timeline', () => {
	test('groups the decisions of one batch under one row, by counter among the others', () => {
		const root = 'cd'.repeat(32);
		const inBatch = (index: number): FeedEntry => ({
			record: { counter: 5, index, kind: 'tick', decision: {}, summary: `TICK ${index}`, observedAt: AT },
			decisionHash: `${index}`.padStart(64, 'e'),
			batch: { root, size: 2 },
			signature: 'sig-batch'
		});
		const single = { ...entry(6, 'tick', {}), decisionHash: 'f'.repeat(64) };
		const rows = toTimeline([single, inBatch(1), inBatch(0)], [], null);

		expect(rows.map((row) => row.type)).toEqual(['decision', 'batch']);
		const batch = rows[1] as Extract<TimelineRow, { type: 'batch' }>;
		expect(batch).toMatchObject({ key: root, counter: 5, root, size: 2, signature: 'sig-batch' });
		expect(batch.rows.map((row) => row.batch?.index)).toEqual([1, 0]);
	});
});
```

(import `TimelineRow`.) Run `bun test src/lib` → FAIL.

- [ ] **Step 2: Implement feed logic**

`onchain-feed.ts`:

```ts
	const stepSignatures = new Map(
		transactions.flatMap((transaction) => {
			if (transaction.event === 'StepRecorded') return [[transaction.decisionHash, transaction.signature] as const];
			if (transaction.event === 'BatchRecorded') return [[transaction.root, transaction.signature] as const];
			return [];
		})
	);
	// …entries:
			const signature = stepSignatures.get(entry.batch?.root ?? entry.decisionHash);
	// …operatorActions filter:
			(event === 'AgentKilled' || event === 'AgentResumed') && counter >= oldestCounter ? [{ event, counter, signature, landedAt }] : []
```

(the new filter narrows `event` so `OperatorAction` type-checks.) Note: `withTransactions` passes `entry` through with its `batch` (incl. `proof`); that is fine for the page.

`fleet-feed.ts`:

```ts
// FeedRow:
	/** Present when the decision went on-chain in a batch. */
	batch: { root: string; size: number; index: number } | null;
// toFeedRow:
		batch: entry.batch ? { ...entry.batch, index: record.index ?? 0 } : null,
// TimelineRow:
	| { type: 'batch'; key: string; counter: number; root: string; size: number; signature: string | null; rows: FeedRow[] }
```

(`{ ...entry.batch }` would copy `proof` if present — build explicitly: `{ root: entry.batch.root, size: entry.batch.size, index: record.index ?? 0 }`.)

`toTimeline`:

```ts
/** The decisions (newest first), a batch's decisions grouped under it, and the owner's actions, merged newest first by counter. */
export function toTimeline(entries: FeedEntry[], actions: OperatorAction[], pendingCounter: number | null): TimelineRow[] {
	const decisionRows = entries.map((entry) => toFeedRow(entry, pendingCounter));
	const rows: TimelineRow[] = [
		...decisionRows.filter((row) => !row.batch).map((row) => ({ type: 'decision' as const, row })),
		...batchRows(decisionRows.filter((row) => row.batch)),
		...actions.map((action) => ({ type: 'action' as const, key: action.signature, ...action }))
	];
	return rows.sort((a, b) => rankOf(b) - rankOf(a));
}

/** One row per batch root, its decisions in feed order. */
function batchRows(rows: FeedRow[]): TimelineRow[] {
	const byRoot = new Map<string, FeedRow[]>();
	for (const row of rows) byRoot.set(row.batch!.root, [...(byRoot.get(row.batch!.root) ?? []), row]);
	return [...byRoot].map(([root, members]) => ({
		type: 'batch' as const,
		key: root,
		counter: members[0].counter,
		root,
		size: members[0].batch!.size,
		signature: members[0].signature,
		rows: members
	}));
}
```

`rankOf`: `if (row.type === 'decision') return row.row.counter; if (row.type === 'batch') return row.counter;` then the existing action branch.

Run `bun test src/lib` → PASS.

- [ ] **Step 3: Feed component**

`DecisionFeed.svelte`: move the body of the `{:else}` decision card into a `{#snippet decision(row: FeedRow)}` (import `type FeedRow`), render it in the `decision` branch, and add a branch before `{:else}`:

```svelte
      {:else if timelineRow.type === 'batch'}
        <div class="p-3 rounded-xl bg-violet-500/[0.06] border border-violet-500/20">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-[10px] font-mono text-slate-500">#{timelineRow.counter}</span>
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-wider border text-violet-300 bg-violet-500/15 border-violet-500/40">
              MERKLE BATCH
            </span>
            <span class="text-[10px] font-mono text-slate-400">{timelineRow.size} decisions · root {timelineRow.root.slice(0, 12)}…</span>
          </div>
          <div class="space-y-1.5 pl-2 border-l border-violet-500/20">
            {#each timelineRow.rows as row (row.key)}
              {@render decision(row)}
            {/each}
          </div>
          {@render transaction(timelineRow.signature)}
        </div>
```

The `{#each rows as timelineRow (...)}` key expression becomes `timelineRow.type === 'decision' ? timelineRow.row.key : timelineRow.key`. Inside the snippet keep the per-row `transaction` link only when `!row.batch` (the batch shows it once).

- [ ] **Step 4: Agent record — last batch size and queued count**

`blink.service.ts`: `AgentStatusRecord` gains

```ts
  /** Decisions under the Merkle root `lastCommitmentRoot` holds; null when it is a single decision's hash. */
  lastBatchSize: number | null;
```

`FleetDetails` gains `/** Decisions waiting in the server's buffer for the next batch. */ queued: number;`. In `toAgentStatusRecord`: `const fleet = { …, queued: runtime.batcher?.queued(entry.id) ?? 0 };`; in the success branch `lastBatchSize: runtime.fleet.findDecision(entry.id, account.lastDecision)?.batch?.size ?? null,`; in the catch branch and in both mock agents and the fallback record around line 170: `lastBatchSize: null`. Blink `description` line:

```ts
        `${agent.lastBatchSize ? `Merkle root of ${agent.lastBatchSize} decisions` : 'Last decision'} (SHA-256): ${agent.lastCommitmentRoot.slice(0, 16)}...`,
```

- [ ] **Step 5: Page**

`+page.svelte` hash box (around line 339):

```svelte
            <!-- Last decision hash or Merkle root -->
            …
                  <Key class="w-3 h-3" />
                  {selectedAgent.lastBatchSize ? 'Quantum-Safe Merkle Root (SHA-256)' : 'Last decision (SHA-256)'}
            …
              <p class="text-[10px] text-slate-500 mt-1.5">
                {#if selectedAgent.lastBatchSize}
                  Batch of {selectedAgent.lastBatchSize} decisions signed once with ML-DSA-44 ·
                {/if}
                The <code class="text-violet-400">last_decision</code> field of the agent account in the <code class="text-violet-400">onchain_agent_guard</code> program (Solana Devnet)
              </p>
```

Crypto stack row: `{ label: 'Decision hash / Merkle root', value: 'SHA-256', note: 'last_decision field · one ML-DSA-44 signature per batch' }`.

Agent card (next to `{agent.actionsExecuted} tx`, line ~248): `{#if agent.fleet?.queued}<span class="text-[10px] text-violet-300 font-mono">· {agent.fleet.queued} queued</span>{/if}`.

`FEED_LIMIT` (line 21): `40`, so a full batch of 16 fits with the rows around it.

- [ ] **Step 6: Check and look at it**

Run: `bun test && bun run check` → PASS, 0 errors. Then `bun run dev` with a fleet configured (or after Task 10) and look at the page: a batched Tick shows the "Quantum-Safe Merkle Root (SHA-256)" box and MERKLE BATCH rows. Use the `run` or `visual-smoke` skill to screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/lib src/routes/+page.svelte
git commit -m "gui: korzen Merkle po paczce (Quantum-Safe Merkle Root SHA-256), paczki w logu on-chain, licznik decyzji w kolejce

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs — decision 007, README, `.env.example`

**Files:**
- Create: `spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md`
- Modify: `README.md`, `.env.example`

- [ ] **Step 1: Decision 007** (Polish, same layout as `spec/decisions/006-zapieczetowany-log-decyzji-ml-kem.md` — read it first and mirror its headings). Content to cover:
  - Kontekst: szybki agent podejmuje decyzje częściej niż jedna transakcja na decyzję; decyzja 004 („Dlaczego nie ma korzenia Merkle”) zapowiadała powrót korzenia, gdy wiele decyzji trafi do jednej transakcji.
  - Decyzja: `record_batch(root, size, signature)` z tagiem 3; serwer buforuje decyzje agentów z `BATCHED_AGENT_IDS` i co `BATCH_FLUSH_MS` lub przy `BATCH_MAX_DECISIONS` wysyła jedną transakcję; format drzewa (prefiksy 0x00/0x01, nieparzysty węzeł w górę bez duplikacji); każda decyzja w logu z dowodem.
  - Co chroni: jeden podpis ML-DSA-44 na N decyzji, ten sam koszt CU co krok; ujawnienie pojedynczej decyzji z dowodem bez reszty paczki; audyt sprawdza każdy dowód.
  - Czego nie chroni: decyzje w buforze nie są on-chain do flushu; restart serwera gubi niezapisany bufor (agent dostał 202); propozycje do zatwierdzenia idą pojedynczo.
  - Zastępuje: akapit „Dlaczego nie ma korzenia Merkle” w decyzji 004; reszta 004 obowiązuje.

- [ ] **Step 2: README**
  - In "No DMS": replace "with no SHA3 commitments and no Merkle root" with "with no SHA3 commitments; a Merkle root appears only for batched agents (below)".
  - New short section after the decision-log paragraph:

    ```markdown
    Batched agents: agents listed in `BATCHED_AGENT_IDS` get `202` for each decision; the server buffers them and every
    `BATCH_FLUSH_MS` (or at `BATCH_MAX_DECISIONS`) records the whole buffer with one `record_batch`: one ML-DSA-44
    signature over the SHA-256 Merkle root of the batch. Each decision is logged with its Merkle proof, so it can be shown
    and checked against the root on-chain without the rest of the batch; `scripts/audit.ts` checks every proof. Decisions
    still in the buffer when the server stops are lost; they never reached the chain.
    Decision: [spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md](spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md).
    ```

- [ ] **Step 3: `.env.example`**

```
# Agents whose decisions go on-chain in batches (comma-separated ids, e.g. tick-01): the server answers 202, buffers
# them and records each buffer with one record_batch. Empty: every decision is its own step.
BATCHED_AGENT_IDS=
# BATCH_FLUSH_MS=10000
# BATCH_MAX_DECISIONS=16
```

- [ ] **Step 4: Commit**

```bash
git add spec/decisions/007-korzen-merkle-dla-paczki-decyzji.md README.md .env.example
git commit -m "docs: decyzja 007 - korzen Merkle dla paczki decyzji (zastepuje akapit decyzji 004), README, .env.example

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Upgrade on devnet and live check

Outward-facing: confirm with the user before the deploy.

- [ ] **Step 1: Authority and balance**

```bash
source onchain/toolchain.sh && build_images
toolchain solana --url devnet program show BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs
toolchain solana --url devnet --keypair spikes/falcon-noble-compat/.devnet/payer.json address
toolchain solana --url devnet --keypair spikes/falcon-noble-compat/.devnet/payer.json balance
```

Expected: the program's Authority equals the payer's address; balance ≥ ~3 SOL (program data size × rent for the buffer; `program show` prints Data Length — budget `Data Length × 6,960 lamports/byte ×2` roughly). If short, ask the user to fund it (https://faucet.solana.com).

- [ ] **Step 2: Upgrade** — with the user's OK: `onchain/deploy-devnet.sh`. Expected: it prints `GUARD_PROGRAM_ID=BL6Fjh4p…` (same ID).

- [ ] **Step 3: Live run** — add `BATCHED_AGENT_IDS=tick-01` to `.env`, run `bun scripts/demo.ts`; within ~30 s Tick logs `queued for the next batch`, the server lands batches (transaction log `BatchRecorded`), the page shows "Quantum-Safe Merkle Root (SHA-256)" and MERKLE BATCH rows. Stop the demo (Ctrl+C).

- [ ] **Step 4: Audit** — `bun scripts/audit.ts tick-01` → `history OK`, with `N batches` in the on-chain line. Also `bun scripts/audit.ts sentinel-01` → still `history OK` (non-batched agent unaffected).

- [ ] **Step 5: Report** to the user with the explorer link of one batch transaction; nothing to commit unless the live run exposed a bug (fix it TDD-style and commit).
