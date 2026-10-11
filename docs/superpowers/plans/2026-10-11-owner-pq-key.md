# Owner's ML-DSA-44 Key Activates Every Agent: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No agent of `onchain_agent_guard` can take a step until the owner's ML-DSA-44 key approves it on-chain; then
the devnet program is made immutable.

**Architecture:** `register_owner` prepares the owner's ML-DSA-44 key once per wallet into an `OwnerKey` account and a
permanent `OwnerRecord` PDA. `register_agent` now creates the agent `Pending`. `activate_agent` verifies the owner's
signature over the agent address and sets it `Active`. The TS client, CLI and setup send both transactions back to
back; the server and agent loop treat `Pending` like a pause.

**Tech Stack:** Anchor 1.2.1 (Docker toolchain via `onchain/toolchain.sh`), `solana-ml-dsa`, Mollusk 0.16, Bun,
`@solana/kit`, `@noble/post-quantum`.

**Spec:** `docs/superpowers/specs/2026-10-11-owner-pq-key-design.md`

## Global Constraints

- Branch `owner_pq_key`; commit messages in Polish, lowercase prefix (`onchain:`, `agent:`, `docs:` …), no
  `Co-Authored-By` trailer.
- FIPS 204 context string stays `onchain-agent-guard:v1`; SHAKE mode (`VerifyingKey<false>`).
- `AgentStatus` order: `Active` = 0, `Killed` = 1, `Pending` = 2 (appended; existing accounts must still decode).
- New `GuardError`s appended in this order: `AgentNotPending` (6007), `AgentPending` (6008).
- Key accounts (`AgentKey`, `OwnerKey`) are 20,552 B, created by a preceding System Program `create_account`.
- Seeds: agent `["agent", owner, agent_key]` (unchanged), owner record `["owner", owner]`.
- Activation message: tag 3, agent address, counter 0 (u64 LE).
- Compute limits: register / register_owner 1,400,000 CU; activate 400,000 CU (same as step/resume).
- Owner ML-DSA key file: env `OWNER_MLDSA_FILE`, default `.devnet/owner-mldsa.json`, mode 0600, written before its
  transaction is sent and never overwritten.
- TS tests: `~/.bun/bin/bun test src agents scripts` (baseline 282 pass). Program tests: `onchain/run-tests.sh
  2>/dev/null` (Docker). `bun run check` already reports 86 errors on this branch: the count must not grow.
- No `solana program set-upgrade-authority --final` without the user's explicit go in chat (irreversible).

## Review Focus

1. Activation sent while the owner key file belongs to a different wallet than `OWNER_KEYPAIR`: must stop with a clear
   message before sending, not fail on-chain. (Task 6, `loadOwnerKeyFileOf`.)
2. `register` succeeds but `activate` fails (RPC drop, 429): the agent file must stay, the CLI must print the exact
   retry command, and the fleet must show the agent paused, not crash. (Tasks 4 and 6.)
3. An owner record of another wallet that holds the very same public key: activation must still fail (seeds check,
   not the signature, is what stops it). (Task 2, `activation_with_another_owners_record_fails`.)
4. Server kill/resume on a `Pending` agent: must refuse before sending, not pay a fee for an on-chain failure.
   (Task 4.)
5. Re-running setup after the owner key is registered: must not try to register it again or ask for its rent.
   (Task 6, setup-plan tests.)

---

### Task 1: Activation message on both sides

**Files:**
- Modify: `onchain/fixtures/message-vector.json`
- Modify: `onchain/programs/onchain_agent_guard/src/message.rs`
- Modify: `onchain/programs/onchain_agent_guard/tests/message_vector.rs`
- Modify: `src/lib/server/modules/agent/message.ts`
- Test: `src/lib/server/modules/agent/message.test.ts`

**Interfaces:**
- Produces: Rust `pub fn activate_message(agent: &Pubkey) -> Vec<u8>`; TS `export function activateMessage(agent: Address): Uint8Array`.

- [ ] **Step 1: Add the vector case.** In `onchain/fixtures/message-vector.json` add after `resumeMessage`:

```json
  "activateMessage": "0307070707070707070707070707070707070707070707070707070707070707070000000000000000"
```

- [ ] **Step 2: Write the failing TS test.** In `message.test.ts` import `activateMessage` and add:

```ts
	it('builds the activate message of the shared vector, always for counter 0', () => {
		expect(activateMessage(agent)).toEqual(bytes(vector.activateMessage));
	});
```

- [ ] **Step 3: Write the failing Rust test.** In `tests/message_vector.rs` import `activate_message` and add to
  `messages_match_the_shared_vector`:

```rust
    assert_eq!(activate_message(&agent), hex(field(&vector, "activateMessage")));
```

- [ ] **Step 4: Run TS test, expect FAIL.** `~/.bun/bin/bun test src/lib/server/modules/agent/message.test.ts` →
  fails: `activateMessage` is not exported.

- [ ] **Step 5: Implement TS.** In `message.ts` after `RESUME_TAG`:

```ts
const ACTIVATE_TAG = 3;
/** Activation happens once, while the agent's counter is still 0. */
const ACTIVATION_COUNTER = 0n;
```

and after `resumeMessage`:

```ts
/** Message the owner's ML-DSA-44 key signs to activate a registered agent. */
export function activateMessage(agent: Address): Uint8Array {
	return header(ACTIVATE_TAG, agent, ACTIVATION_COUNTER);
}
```

Update the file's top comment: "The bytes the agent's and the owner's ML-DSA-44 keys sign."

- [ ] **Step 6: Implement Rust.** In `message.rs` after `RESUME_TAG`:

```rust
const ACTIVATE_TAG: u8 = 3;
/// Activation happens once, while the agent's counter is still 0.
const ACTIVATION_COUNTER: u64 = 0;
```

and after `resume_message`:

```rust
/// Message the owner's ML-DSA-44 key signs to activate a registered agent.
pub fn activate_message(agent: &Pubkey) -> Vec<u8> {
    header(ACTIVATE_TAG, agent, ACTIVATION_COUNTER)
}
```

- [ ] **Step 7: Run TS test, expect PASS.** Same command as Step 4.
- [ ] **Step 8: Run Rust tests.** `onchain/run-tests.sh 2>/dev/null` → `messages_match_the_shared_vector ... ok`, all
  guard tests still ok. (It also regenerates fixtures and the IDL copy; commit those only if they changed.)
- [ ] **Step 9: Commit.**

```bash
git add onchain/fixtures/message-vector.json onchain/programs/onchain_agent_guard/src/message.rs \
  onchain/programs/onchain_agent_guard/tests/message_vector.rs src/lib/server/modules/agent/message.ts \
  src/lib/server/modules/agent/message.test.ts
git commit -m "onchain: wiadomosc aktywacji agenta (tag 3, licznik 0) po stronie programu i klienta, sprawdzana wspolnym wektorem"
```

---

### Task 2: Program: owner key, Pending agents, activation

**Files:**
- Modify: `onchain/programs/onchain_agent_guard/src/state.rs`
- Modify: `onchain/programs/onchain_agent_guard/src/error.rs`
- Modify: `onchain/programs/onchain_agent_guard/src/lib.rs`
- Modify: `scripts/gen-guard-fixtures.ts`
- Test: `onchain/programs/onchain_agent_guard/tests/guard.rs`
- Generated (commit): `tests/fixtures/*`, `src/lib/server/modules/agent/onchain_agent_guard.idl.json`

**Interfaces:**
- Consumes: `activate_message` (Task 1).
- Produces: instructions `register_owner(public_key: Vec<u8>)` with accounts `[owner (mut, signer), owner_key (mut),
  owner_record (mut), system_program]`; `activate_agent(signature: Vec<u8>)` with accounts `[agent (mut),
  owner_record, owner_key]`; account `OwnerRecord { owner, owner_key, bump }`; event `AgentActivated { agent, counter }`;
  errors `AgentNotPending` 6007, `AgentPending` 6008; IDL updated for Task 3.

- [ ] **Step 1: Fixtures for the owner.** In `scripts/gen-guard-fixtures.ts` import `activateMessage` and add after
  the resume signature:

```ts
const ownerKeys = ml_dsa44.keygen();
write('owner-key.pk', ownerKeys.publicKey);
write('activate.sig', signGuardMessage(activateMessage(agent), ownerKeys.secretKey));
```

Update its top comment to "a fresh noble ML-DSA-44 agent key, owner key and signatures".

- [ ] **Step 2: Write the failing Mollusk tests.** In `tests/guard.rs`:

Imports: add `OwnerRecord, OWNER_SEED` to the `state` import.

Constants (after `RESUME_2_SIGNATURE`):

```rust
const OWNER_PUBLIC_KEY: &[u8] = include_bytes!("fixtures/owner-key.pk");
const ACTIVATE_SIGNATURE: &[u8] = include_bytes!("fixtures/activate.sig");
/// OWNER_KEY_ACCOUNT_SIZE in src/lib/server/modules/agent/instructions.ts.
const OWNER_KEY_ACCOUNT_LEN: usize = 20_552;
const OWNER_KEY: Address = Address::new_from_array([6; 32]);
/// The stranger's own owner key account; it holds the same public key as OWNER_KEY.
const STRANGER_OWNER_KEY: Address = Address::new_from_array([8; 32]);
/// A second key account the owner tries to register after OWNER_KEY.
const REPLACEMENT_OWNER_KEY: Address = Address::new_from_array([10; 32]);
```

Helpers (next to `agent_address_for`):

```rust
fn owner_record_address(owner: Address) -> Address {
    let (record, _) = Pubkey::find_program_address(&[OWNER_SEED, owner.as_ref()], &onchain_agent_guard::ID);
    Address::new_from_array(record.to_bytes())
}

fn activate_with(owner_record: Address, owner_key: Address, signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::ActivateAgent { signature: signature.to_vec() }.data(),
        vec![
            AccountMeta::new(agent_address(), false),
            AccountMeta::new_readonly(owner_record, false),
            AccountMeta::new_readonly(owner_key, false),
        ],
    )
}

fn activate(signature: &[u8]) -> Instruction {
    activate_with(owner_record_address(OWNER), OWNER_KEY, signature)
}
```

In `Ledger::new()` add to `accounts`:

```rust
                (OWNER_KEY, Account::default()),
                (owner_record_address(OWNER), Account::default()),
                (STRANGER_OWNER_KEY, Account::default()),
                (owner_record_address(STRANGER), Account::default()),
                (REPLACEMENT_OWNER_KEY, Account::default()),
```

Replace `registered()` with the three stages:

```rust
    /// The owner's ML-DSA-44 key is registered; no agent yet.
    fn with_owner_key() -> Self {
        let mut ledger = Self::new();
        let register = ledger.register_owner_instructions(OWNER, OWNER_KEY);
        assert_eq!(ledger.send("register owner", &register), Ok(()));
        ledger
    }

    /// The agent is registered and waits for the owner's activation.
    fn pending() -> Self {
        let mut ledger = Self::with_owner_key();
        let register = ledger.register_instructions(PUBLIC_KEY);
        assert_eq!(ledger.send("register", &register), Ok(()));
        ledger
    }

    /// Registered and activated by the owner's ML-DSA-44 signature.
    fn registered() -> Self {
        let mut ledger = Self::pending();
        assert_eq!(ledger.send("activate", &[activate(ACTIVATE_SIGNATURE)]), Ok(()));
        ledger
    }
```

Replace `agent()` with a generic reader plus two shorthands:

```rust
    fn account<T: AccountDeserialize>(&self, address: Address) -> T {
        let (_, account) = self.accounts.iter().find(|(key, _)| *key == address).unwrap();
        T::try_deserialize(&mut account.data.as_slice()).unwrap()
    }

    fn agent(&self) -> Agent {
        self.account(agent_address())
    }

    fn owner_record(&self) -> OwnerRecord {
        self.account(owner_record_address(OWNER))
    }
```

Factor the key account creation and add the owner registration (replace the body of `register_instructions_for`):

```rust
    fn create_key_account(&self, payer: Address, key_account: Address, size: usize) -> Instruction {
        let rent = self.svm.sysvars.rent.minimum_balance(size);
        create_account(&payer, &key_account, rent, size as u64, &PROGRAM)
    }

    fn register_instructions_for(&self, owner: Address, agent_key: Address, public_key: &[u8]) -> Vec<Instruction> {
        vec![
            self.create_key_account(owner, agent_key, AGENT_KEY_ACCOUNT_LEN),
            Instruction::new_with_bytes(
                PROGRAM,
                &program_ix::RegisterAgent { public_key: public_key.to_vec() }.data(),
                vec![
                    AccountMeta::new(owner, true),
                    AccountMeta::new(agent_key, false),
                    AccountMeta::new(agent_address_for(owner, agent_key), false),
                    AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
                ],
            ),
        ]
    }

    fn register_owner_instructions(&self, owner: Address, owner_key: Address) -> Vec<Instruction> {
        vec![
            self.create_key_account(owner, owner_key, OWNER_KEY_ACCOUNT_LEN),
            Instruction::new_with_bytes(
                PROGRAM,
                &program_ix::RegisterOwner { public_key: OWNER_PUBLIC_KEY.to_vec() }.data(),
                vec![
                    AccountMeta::new(owner, true),
                    AccountMeta::new(owner_key, false),
                    AccountMeta::new(owner_record_address(owner), false),
                    AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
                ],
            ),
        ]
    }
```

Rename the test `register_creates_an_active_agent_bound_to_owner_and_key` to
`register_creates_a_pending_agent_bound_to_owner_and_key`, build it from `Ledger::pending()` and expect
`AgentStatus::Pending`. Then add:

```rust
#[test]
fn owner_key_account_size_matches_the_client() {
    assert_eq!(ANCHOR_DISCRIMINATOR_LEN + std::mem::size_of::<OwnerKey>(), OWNER_KEY_ACCOUNT_LEN);
}

#[test]
fn register_owner_binds_the_owner_to_its_key() {
    let record = Ledger::with_owner_key().owner_record();
    assert_eq!(record.owner.as_ref(), OWNER.as_ref());
    assert_eq!(record.owner_key.as_ref(), OWNER_KEY.as_ref());
}

#[test]
fn register_owner_again_cannot_replace_the_key() {
    let mut ledger = Ledger::with_owner_key();
    let again = ledger.register_owner_instructions(OWNER, REPLACEMENT_OWNER_KEY);
    assert!(ledger.send("register owner again", &again).is_err());
    assert_eq!(ledger.owner_record().owner_key.as_ref(), OWNER_KEY.as_ref());
}

#[test]
fn step_on_a_pending_agent_fails() {
    let mut ledger = Ledger::pending();
    assert_eq!(
        ledger.send("step 1 while pending", &[step(1, STEP_1_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentPending)
    );
}

#[test]
fn kill_on_a_pending_agent_fails() {
    let mut ledger = Ledger::pending();
    assert_eq!(
        ledger.send("kill while pending", &[kill(OWNER)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentNotActive)
    );
}

#[test]
fn activation_makes_the_agent_active_at_counter_0_and_steps_follow() {
    let mut ledger = Ledger::registered();
    let agent = ledger.agent();
    assert_eq!(agent.status, AgentStatus::Active);
    assert_eq!(agent.counter, 0);
    assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
}

#[test]
fn activation_needs_no_owner_wallet_signature() {
    let mut ledger = Ledger::pending();
    assert_eq!(ledger.send_paid_by(STRANGER, "activate paid by stranger", &[activate(ACTIVATE_SIGNATURE)]), Ok(()));
    assert_eq!(ledger.agent().status, AgentStatus::Active);
}

#[test]
fn activation_with_a_tampered_signature_fails() {
    let mut ledger = Ledger::pending();
    let tampered = flipped(ACTIVATE_SIGNATURE, ACTIVATE_SIGNATURE.len() / 2);
    assert_eq!(
        ledger.send("activate tampered", &[activate(&tampered)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::VerifyFailed)
    );
}

#[test]
fn activation_with_an_agent_key_as_the_owner_key_fails() {
    let mut ledger = Ledger::pending();
    assert!(ledger.send("activate with agent key as owner key", &[activate_with(owner_record_address(OWNER), AGENT_KEY, ACTIVATE_SIGNATURE)]).is_err());
    assert_eq!(ledger.agent().status, AgentStatus::Pending);
}

/// The stranger's record holds the same public key, so only the seeds check can stop this.
#[test]
fn activation_with_another_owners_record_fails() {
    let mut ledger = Ledger::pending();
    let register = ledger.register_owner_instructions(STRANGER, STRANGER_OWNER_KEY);
    assert_eq!(ledger.send_paid_by(STRANGER, "stranger registers owner", &register), Ok(()));
    let foreign = activate_with(owner_record_address(STRANGER), STRANGER_OWNER_KEY, ACTIVATE_SIGNATURE);
    assert!(ledger.send("activate with stranger's record", &[foreign]).is_err());
    assert_eq!(ledger.agent().status, AgentStatus::Pending);
}

#[test]
fn second_activation_fails() {
    let mut ledger = Ledger::registered();
    assert_eq!(
        ledger.send("activate again", &[activate(ACTIVATE_SIGNATURE)]),
        guard_error(SIGNED_INSTRUCTION_INDEX, GuardError::AgentNotPending)
    );
}
```

Also add `OwnerKey` to the `state` import (used by the size test). Update the file's top comment: "OWNER, AGENT_KEY
and decision_hash() must match the constants in that script; the owner key fixture signs only the activation."

- [ ] **Step 3: Run, expect FAIL.** `onchain/run-tests.sh 2>/dev/null` → does not compile: `OwnerRecord`,
  `OWNER_SEED`, `OwnerKey`, `RegisterOwner`, `ActivateAgent`, `AgentPending` unknown.

- [ ] **Step 4: State.** In `state.rs` add after `AGENT_SEED`:

```rust
pub const OWNER_SEED: &[u8] = b"owner";
```

after `AgentKey`:

```rust
/// The owner's prepared ML-DSA-44 public key. Its own type, so an agent's key account cannot stand in for it.
#[account(zero_copy)]
pub struct OwnerKey {
    pub prepared: [u8; MLDSA_PREPARED_KEY_LEN],
}

/// PDA with seeds `[OWNER_SEED, owner]`: the one ML-DSA-44 key that activates the owner's agents. Created with `init`,
/// so it cannot be replaced.
#[account]
#[derive(InitSpace)]
pub struct OwnerRecord {
    pub owner: Pubkey,
    pub owner_key: Pubkey,
    pub bump: u8,
}
```

append to `AgentStatus`:

```rust
    /// Registered, waiting for the owner's ML-DSA-44 activation. Appended so older accounts still decode.
    Pending,
```

and add the event:

```rust
#[event]
pub struct AgentActivated {
    pub agent: Pubkey,
    pub counter: u64,
}
```

- [ ] **Step 5: Errors.** Append to `GuardError` in `error.rs`:

```rust
    #[msg("Agent is not waiting for activation")]
    AgentNotPending,
    #[msg("Agent is waiting for the owner's activation")]
    AgentPending,
```

- [ ] **Step 6: Instructions.** In `lib.rs`:

Update the module doc comment: "holds the agent's ML-DSA-44 public key, starts it only after the owner's ML-DSA-44
key activates it, accepts a step or a resume only with a valid ML-DSA-44 signature …".

Imports:

```rust
use message::{activate_message, resume_message, step_message, CONTEXT as MLDSA_CONTEXT};
use state::{
    Agent, AgentActivated, AgentKey, AgentKilled, AgentResumed, AgentStatus, MldsaPreparedKey, OwnerKey, OwnerRecord,
    StepRecorded, AGENT_SEED, MLDSA_PREPARED_KEY_LEN, OWNER_SEED,
};
```

In `#[program]`, add before `register_agent`:

```rust
    pub fn register_owner(ctx: Context<RegisterOwner>, public_key: Vec<u8>) -> Result<()> {
        prepare_key(&public_key, &mut ctx.accounts.owner_key.load_init()?.prepared)?;
        ctx.accounts.owner_record.set_inner(OwnerRecord {
            owner: ctx.accounts.owner.key(),
            owner_key: ctx.accounts.owner_key.key(),
            bump: ctx.bumps.owner_record,
        });
        Ok(())
    }
```

Replace `register_agent`'s key preparation block with `prepare_key(&public_key, &mut ctx.accounts.agent_key.load_init()?.prepared)?;`
and set `status: AgentStatus::Pending`.

Add after `register_agent`:

```rust
    pub fn activate_agent(ctx: Context<ActivateAgent>, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Pending, GuardError::AgentNotPending);
        verify_signature(&ctx.accounts.owner_key.load()?.prepared, &activate_message(&agent_address), &signature)?;
        agent.status = AgentStatus::Active;
        emit!(AgentActivated { agent: agent_address, counter: agent.counter });
        Ok(())
    }
```

In `record_step`, before the existing `require!`:

```rust
        require!(agent.status != AgentStatus::Pending, GuardError::AgentPending);
```

In `record_step` and `resume`, the verify call becomes
`verify_signature(&ctx.accounts.agent_key.load()?.prepared, …)`.

Replace `verify_signature` and add `prepare_key`:

```rust
fn prepare_key(public_key: &[u8], prepared: &mut [u8; MLDSA_PREPARED_KEY_LEN]) -> Result<()> {
    let public_key = MldsaVerifyingKey::ref_from_bytes(public_key).map_err(|_| GuardError::InvalidPublicKey)?;
    let prepared = MldsaPreparedKey::mut_from_bytes(prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    public_key.prepare_into(prepared);
    Ok(())
}

fn verify_signature(prepared: &[u8; MLDSA_PREPARED_KEY_LEN], signed: &[u8], signature: &[u8]) -> Result<()> {
    let prepared = MldsaPreparedKey::ref_from_bytes(prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    let signature = Signature::ref_from_bytes(signature).map_err(|_| GuardError::InvalidSignature)?;
    prepared
        .verify_with_context(signed, MLDSA_CONTEXT, signature)
        .map_err(|_| error!(GuardError::VerifyFailed))
}
```

Accounts structs (before `RegisterAgent`, and after it):

```rust
#[derive(Accounts)]
pub struct RegisterOwner<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Allocated by a preceding System Program `create_account`, like `RegisterAgent::agent_key`.
    #[account(zero)]
    pub owner_key: AccountLoader<'info, OwnerKey>,
    #[account(
        init,
        payer = owner,
        space = 8 + OwnerRecord::INIT_SPACE,
        seeds = [OWNER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub owner_record: Account<'info, OwnerRecord>,
    pub system_program: Program<'info, System>,
}

/// No wallet signer: the owner's ML-DSA-44 signature is the authorization, so anyone may pay the fee.
#[derive(Accounts)]
pub struct ActivateAgent<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,
    #[account(seeds = [OWNER_SEED, agent.owner.as_ref()], bump = owner_record.bump, has_one = owner_key)]
    pub owner_record: Account<'info, OwnerRecord>,
    pub owner_key: AccountLoader<'info, OwnerKey>,
}
```

If the borrow checker rejects a `load()?`/`load_init()?` temporary as an argument, bind it first
(`let key = ctx.accounts.owner_key.load()?;` then `&key.prepared`) in a block that ends before `set_inner`/the status
write, as the old `register_agent` did.

- [ ] **Step 7: Run, expect PASS.** `onchain/run-tests.sh 2>/dev/null` → all tests ok. Note the printed CU for
  `register owner` (~1.09M) and `activate` (~262k) for Task 7.

- [ ] **Step 8: Commit** (includes regenerated fixtures and IDL).

```bash
git add onchain/programs/onchain_agent_guard scripts/gen-guard-fixtures.ts src/lib/server/modules/agent/onchain_agent_guard.idl.json
git commit -m "onchain: klucz ML-DSA-44 wlasciciela (register_owner, OwnerRecord nie do podmiany), agent startuje jako Pending, activate_agent z podpisem wlasciciela"
```

---

### Task 3: TS client encoding and sending

**Files:**
- Modify: `src/lib/server/modules/agent/instructions.ts`
- Modify: `src/lib/server/modules/agent/events.ts`
- Modify: `src/lib/server/modules/agent/guard-errors.ts`
- Modify: `src/lib/server/modules/agent/guard-client.ts`
- Test: `instructions.test.ts`, `events.test.ts`, `idl.test.ts` (same directory)

**Interfaces:**
- Consumes: IDL from Task 2.
- Produces:
  - `OWNER_KEY_ACCOUNT_SIZE: bigint`
  - `findOwnerRecordAddress(programAddress: Address, owner: Address): Promise<Address>`
  - `registerOwnerInstruction(input: { programAddress: Address; owner: TransactionSigner; ownerKey: Address; ownerRecord: Address; publicKey: Uint8Array })`
  - `activateAgentInstruction(input: { programAddress: Address; agent: Address; ownerRecord: Address; ownerKey: Address; signature: Uint8Array })`
  - `AgentStatus = 'Active' | 'Killed' | 'Pending'`
  - `GuardEvent` gains `{ name: 'AgentActivated'; agent: Address; counter: bigint }`
  - `GUARD_ERROR_CODES.AgentNotPending = 6007`, `.AgentPending = 6008`
  - `registerOwner(client: GuardClient, registration: { owner: TransactionSigner; ownerKey: TransactionSigner; ownerRecord: Address; publicKey: Uint8Array }): Promise<SendResult>`
  - `activateAgent(client: GuardClient, activation: { feePayer: TransactionSigner; agent: Address; ownerRecord: Address; ownerKey: Address; signature: Uint8Array }): Promise<SendResult>`

- [ ] **Step 1: Failing tests.**

`idl.test.ts`, inside the instruction test:

```ts
		expect(Array.from(DISCRIMINATORS.registerOwner)).toEqual(instructionDiscriminator('register_owner')!);
		expect(Array.from(DISCRIMINATORS.activateAgent)).toEqual(instructionDiscriminator('activate_agent')!);
```

inside the event test:

```ts
		expect(Array.from(DISCRIMINATORS.agentActivated)).toEqual(eventDiscriminator('AgentActivated')!);
```

`instructions.test.ts`: import `activateAgentInstruction`, `findOwnerRecordAddress`, `registerOwnerInstruction`; add
to the discriminator test:

```ts
		expect(Array.from(DISCRIMINATORS.registerOwner)).toEqual([207, 189, 74, 108, 245, 244, 166, 237]);
		expect(Array.from(DISCRIMINATORS.activateAgent)).toEqual([252, 139, 87, 21, 195, 152, 29, 217]);
```

and new tests:

```ts
describe('findOwnerRecordAddress', () => {
	it('derives one record per owner', async () => {
		const first = await findOwnerRecordAddress(PROGRAM, addressOf(2));
		expect(await findOwnerRecordAddress(PROGRAM, addressOf(2))).toBe(first);
		expect(await findOwnerRecordAddress(PROGRAM, addressOf(4))).not.toBe(first);
	});
});
```

in `describe('decodeAgent')`:

```ts
	it('decodes a Pending agent', () => {
		const data = Uint8Array.from([
			...DISCRIMINATORS.agent,
			...filled(32, 1),
			...filled(32, 2),
			2,
			...getU64Encoder().encode(0n),
			...filled(32, 0),
			255
		]);
		expect(decodeAgent(data).status).toBe('Pending');
	});
```

in `describe('instruction builders')`:

```ts
	it('lays out register_owner like register_agent, with the owner record', async () => {
		const owner = await generateKeyPairSigner();
		const OWNER_KEY = addressOf(6);
		const OWNER_RECORD = addressOf(8);
		const instruction = registerOwnerInstruction({
			programAddress: PROGRAM,
			owner,
			ownerKey: OWNER_KEY,
			ownerRecord: OWNER_RECORD,
			publicKey: filled(ML_DSA_44_PUBLIC_KEY_LENGTH, 5)
		});
		expect(Array.from(instruction.data.subarray(0, 8))).toEqual(Array.from(DISCRIMINATORS.registerOwner));
		expect(instruction.data.length).toBe(8 + 4 + ML_DSA_44_PUBLIC_KEY_LENGTH);
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[owner.address, AccountRole.WRITABLE_SIGNER],
			[OWNER_KEY, AccountRole.WRITABLE],
			[OWNER_RECORD, AccountRole.WRITABLE],
			[SYSTEM_PROGRAM_ADDRESS, AccountRole.READONLY]
		]);
	});

	it('lays out activate_agent with no wallet signer', () => {
		const OWNER_KEY = addressOf(6);
		const OWNER_RECORD = addressOf(8);
		const instruction = activateAgentInstruction({
			programAddress: PROGRAM,
			agent: AGENT,
			ownerRecord: OWNER_RECORD,
			ownerKey: OWNER_KEY,
			signature: filled(ML_DSA_44_SIGNATURE_LENGTH, 5)
		});
		expect(Array.from(instruction.data.subarray(0, 8))).toEqual(Array.from(DISCRIMINATORS.activateAgent));
		expect(instruction.data.length).toBe(8 + 4 + ML_DSA_44_SIGNATURE_LENGTH);
		expect(instruction.accounts.map((account) => [account.address, account.role])).toEqual([
			[AGENT, AccountRole.WRITABLE],
			[OWNER_RECORD, AccountRole.READONLY],
			[OWNER_KEY, AccountRole.READONLY]
		]);
	});
```

(import `SYSTEM_PROGRAM_ADDRESS` from `./instructions`).

`events.test.ts`, new test:

```ts
	it('decodes AgentActivated', () => {
		const logs = invoked(PROGRAM, dataLine(DISCRIMINATORS.agentActivated, ...agentAndCounter(0n)));
		expect(parseGuardEvents(logs, PROGRAM)).toEqual([{ name: 'AgentActivated', agent: AGENT, counter: 0n }]);
	});
```

- [ ] **Step 2: Run, expect FAIL.** `~/.bun/bin/bun test src/lib/server/modules/agent` → missing exports,
  discriminators undefined, error-code map mismatch in `idl.test.ts`.

- [ ] **Step 3: Implement `instructions.ts`.**

```ts
/** 8 B Anchor discriminator + 20,544 B prepared ML-DSA-44 key (OwnerKey in state.rs). */
export const OWNER_KEY_ACCOUNT_SIZE = 20_552n;
const OWNER_SEED = new TextEncoder().encode('owner');
```

`DISCRIMINATORS` gains:

```ts
	registerOwner: anchorDiscriminator('global', 'register_owner'),
	activateAgent: anchorDiscriminator('global', 'activate_agent'),
	agentActivated: anchorDiscriminator('event', 'AgentActivated'),
```

`const AGENT_STATUSES = ['Active', 'Killed', 'Pending'] as const;`

After `findAgentAddress`:

```ts
export async function findOwnerRecordAddress(programAddress: Address, owner: Address): Promise<Address> {
	const [record] = await getProgramDerivedAddress({ programAddress, seeds: [OWNER_SEED, getAddressEncoder().encode(owner)] });
	return record;
}

export function registerOwnerInstruction(input: {
	programAddress: Address;
	owner: TransactionSigner;
	ownerKey: Address;
	ownerRecord: Address;
	publicKey: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.owner.address, role: AccountRole.WRITABLE_SIGNER, signer: input.owner },
			{ address: input.ownerKey, role: AccountRole.WRITABLE },
			{ address: input.ownerRecord, role: AccountRole.WRITABLE },
			{ address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.registerOwner, borshBytes(input.publicKey))
	};
}

/** No wallet signer: the owner's ML-DSA-44 signature authorizes it, the fee payer only pays. */
export function activateAgentInstruction(input: {
	programAddress: Address;
	agent: Address;
	ownerRecord: Address;
	ownerKey: Address;
	signature: Uint8Array;
}) {
	return {
		programAddress: input.programAddress,
		accounts: [
			{ address: input.agent, role: AccountRole.WRITABLE },
			{ address: input.ownerRecord, role: AccountRole.READONLY },
			{ address: input.ownerKey, role: AccountRole.READONLY }
		],
		data: concatBytes(DISCRIMINATORS.activateAgent, borshBytes(input.signature))
	};
}
```

- [ ] **Step 4: Implement `events.ts`.** Add `| { name: 'AgentActivated'; agent: Address; counter: bigint }` to
  `GuardEvent` and in `decodeEvent`:

```ts
	if (equalBytes(discriminator, DISCRIMINATORS.agentActivated)) {
		return { name: 'AgentActivated', ...counterEventDecoder.decode(data, DISCRIMINATOR_LENGTH) };
	}
```

- [ ] **Step 5: Implement `guard-errors.ts`.** Append `AgentNotPending: 6007, AgentPending: 6008` to
  `GUARD_ERROR_CODES`.

- [ ] **Step 6: Implement `guard-client.ts`.** Import `activateAgentInstruction`, `OWNER_KEY_ACCOUNT_SIZE`,
  `registerOwnerInstruction`. Change the register comment to "Preparing a 1,312 B key (agent or owner) costs ~1.09M
  CU." Add:

```ts
/** Creates a 20,552 B key account owned by the program; the payer pays its rent. */
async function createKeyAccountInstruction(client: GuardClient, payer: TransactionSigner, account: TransactionSigner, space: bigint) {
	const lamports = await client.connection.rpc.getMinimumBalanceForRentExemption(space).send();
	return getCreateAccountInstruction({ payer, newAccount: account, lamports, space, programAddress: client.programAddress });
}
```

Use it in `registerAgent` (`await createKeyAccountInstruction(client, owner, agentKey, AGENT_KEY_ACCOUNT_SIZE)`), and
add:

```ts
/** Creates the owner's key account and its permanent record in one transaction; once per owner wallet. */
export async function registerOwner(
	client: GuardClient,
	registration: { owner: TransactionSigner; ownerKey: TransactionSigner; ownerRecord: Address; publicKey: Uint8Array }
): Promise<SendResult> {
	const { owner, ownerKey, ownerRecord, publicKey } = registration;
	const instructions = [
		await createKeyAccountInstruction(client, owner, ownerKey, OWNER_KEY_ACCOUNT_SIZE),
		registerOwnerInstruction({ programAddress: client.programAddress, owner, ownerKey: ownerKey.address, ownerRecord, publicKey })
	];
	return sendV1(client.connection, owner, instructions, REGISTER_COMPUTE_UNIT_LIMIT);
}

export function activateAgent(
	client: GuardClient,
	activation: { feePayer: TransactionSigner; agent: Address; ownerRecord: Address; ownerKey: Address; signature: Uint8Array }
): Promise<SendResult> {
	const instruction = activateAgentInstruction({ programAddress: client.programAddress, ...activation });
	return sendV1(client.connection, activation.feePayer, [instruction], SIGNED_COMPUTE_UNIT_LIMIT);
}
```

- [ ] **Step 7: Run, expect PASS.** `~/.bun/bin/bun test src/lib/server/modules/agent` → all pass.
- [ ] **Step 8: Commit.**

```bash
git add src/lib/server/modules/agent
git commit -m "agent: klient register_owner i activate_agent, status Pending, zdarzenie AgentActivated, nowe kody bledow"
```

---

### Task 4: Pending is a pause for the agent loop, the server guard and the page

**Files:**
- Modify: `src/lib/server/modules/agent/agent-loop.ts`
- Modify: `src/lib/server/modules/agent-guard/guard.ts`
- Modify: `src/lib/server/modules/agent-guard/onchain-guard.ts`
- Modify: `src/lib/server/modules/solana-blink/blink.service.ts`
- Test: `agent-loop.test.ts`, `agent-guard/onchain-guard.test.ts`

**Interfaces:**
- Consumes: `AgentStatus` with `'Pending'` (Task 3), `GUARD_ERROR_CODES.AgentPending`.
- Produces: `GuardStatus = 'Active' | 'Killed' | 'Pending'`; `GuardErrorCode` gains `'AgentPending'` (HTTP 409).

- [ ] **Step 1: Failing tests.**

`agent-loop.test.ts`, in `describe('runCycle')`:

```ts
	it('sends nothing while the agent awaits the owner activation, and says how to activate', async () => {
		const { ports, calls } = fakePorts({ readAgent: async () => agentState('Pending', 0n) });
		expect(await runCycle(ports)).toBe('paused');
		expect(calls.signed).toHaveLength(0);
		expect(calls.steps).toHaveLength(0);
		expect(calls.lines.join('\n')).toContain('bun scripts/agent.ts activate');
	});
```

`onchain-guard.test.ts`, next to the killed-agent tests:

```ts
	test('refuses a step without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 1, DECISION_HASH))).toBe('AgentPending');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a kill without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).kill(AGENT_ID, OWNER))).toBe('AgentNotActive');
		expect(chain.sent).toEqual([]);
	});

	test('refuses a resume without sending while the agent awaits activation', async () => {
		const chain = fakeChain({ status: 'Pending', counter: 0n });
		expect(await guardErrorCode(guardOver(chain).resume(AGENT_ID, OWNER))).toBe('AgentNotKilled');
		expect(chain.sent).toEqual([]);
	});

	test('reports the program refusing a pending agent as AgentPending', async () => {
		const chain = fakeChain();
		chain.failOnChainWith(PROGRAM_ERROR(6008));
		expect(await guardErrorCode(guardOver(chain).recordStep(AGENT_ID, 12, DECISION_HASH))).toBe('AgentPending');
	});
```

- [ ] **Step 2: Run, expect FAIL.** `~/.bun/bin/bun test src/lib/server/modules/agent/agent-loop.test.ts src/lib/server/modules/agent-guard`
  → the loop tries to sign, the guard sends.

- [ ] **Step 3: Implement the loop.** In `agent-loop.ts` `recordNextStep`, replace the `if (state.status === 'Killed')`
  block with:

```ts
	if (state.status !== 'Active') {
		ports.log(PAUSE_REASONS[state.status]);
		return 'paused';
	}
```

and add at module level:

```ts
const PAUSE_REASONS: Record<Exclude<AgentStatus, 'Active'>, string> = {
	Killed: 'paused: agent is killed',
	Pending: 'paused: agent awaits the owner activation (bun scripts/agent.ts activate)'
};
```

(import `type AgentStatus` from `./instructions`). Update the `runCycle` doc: "skip while killed or not yet activated".

- [ ] **Step 4: Implement the guard.** `guard.ts`: `export type GuardStatus = 'Active' | 'Killed' | 'Pending';`,
  add `| 'AgentPending'` to `GuardErrorCode` and `AgentPending: 409` to `HTTP_STATUS_BY_GUARD_ERROR`. In the
  `recordStep` doc add "and with AgentPending until the owner activates it".

`onchain-guard.ts`: add `[GUARD_ERROR_CODES.AgentPending, 'AgentPending']` to `GUARD_ERROR_BY_PROGRAM_CODE`. In
`recordStep`, before the `Killed` check:

```ts
		if (state.status === 'Pending') throw new GuardError('AgentPending', `agent ${agentId} awaits the owner activation`);
```

In `kill`: `if (state.status !== 'Active') throw new GuardError('AgentNotActive', `agent ${agentId} is ${state.status.toLowerCase()}, not active`);`
In `resume`: `if (state.status !== 'Killed') throw new GuardError('AgentNotKilled', `agent ${agentId} is not killed`);`

- [ ] **Step 5: Implement the card.** `blink.service.ts` `cardStatus`: `if (guardStatus !== 'Active') return 'PAUSED';`
  and its doc: "A killed or not yet activated agent shows as PAUSED …".

- [ ] **Step 6: Run, expect PASS.** `~/.bun/bin/bun test src agents scripts` → all pass. `~/.bun/bin/bun run check 2>&1 | tail -2`
  → still 86 errors.
- [ ] **Step 7: Commit.**

```bash
git add src/lib/server/modules/agent src/lib/server/modules/agent-guard src/lib/server/modules/solana-blink/blink.service.ts
git commit -m "agent: Pending jako pauza w petli agenta, w strazniku serwera (AgentPending, bez wysylki kill/resume) i na karcie"
```

---

### Task 5: Owner key file and its config

**Files:**
- Modify: `src/lib/server/modules/agent/files.ts`
- Modify: `src/lib/server/modules/agent/config.ts`
- Modify: `.env.example`
- Test: `files.test.ts`, `config.test.ts`

**Interfaces:**
- Produces: `interface OwnerKeyFile { owner: Address; ownerKey: Address; mldsaSecretKey: Uint8Array }`;
  `assertOwnerKeyFileAbsent(path: string): void`; `saveOwnerKeyFile(path: string, file: OwnerKeyFile): void`;
  `loadOwnerKeyFile(path: string): OwnerKeyFile`;
  `sendWithOwnerKeyFileWriteAhead<T extends { err: unknown }>(path: string, file: OwnerKeyFile, send: () => Promise<T>): Promise<T>`;
  `AgentConfig.ownerMldsaPath: string`.

- [ ] **Step 1: Failing tests.** `files.test.ts`: import the four new functions and `type OwnerKeyFile`; add:

```ts
const OWNER_KEY_FILE: OwnerKeyFile = { owner: addressOf(1), ownerKey: addressOf(6), mldsaSecretKey: new Uint8Array(2560).fill(7) };

describe('owner key file', () => {
	it('round-trips', () => {
		const path = tempPath('owner-mldsa.json');
		saveOwnerKeyFile(path, OWNER_KEY_FILE);
		expect(loadOwnerKeyFile(path)).toEqual(OWNER_KEY_FILE);
	});

	it('never overwrites an existing owner key file', () => {
		const path = tempPath('owner-mldsa.json');
		saveOwnerKeyFile(path, OWNER_KEY_FILE);
		expect(() => assertOwnerKeyFileAbsent(path)).toThrow("the owner's ML-DSA-44 secret key");
		expect(() => saveOwnerKeyFile(path, { ...OWNER_KEY_FILE, mldsaSecretKey: new Uint8Array(2560) })).toThrow('already exists');
		expect(loadOwnerKeyFile(path)).toEqual(OWNER_KEY_FILE);
	});

	it('is written before the send and kept when the send throws', async () => {
		const path = tempPath('owner-mldsa.json');
		const send = async () => {
			expect(loadOwnerKeyFile(path)).toEqual(OWNER_KEY_FILE);
			throw new Error('HTTP error (429): Too Many Requests');
		};
		await expect(sendWithOwnerKeyFileWriteAhead(path, OWNER_KEY_FILE, send)).rejects.toThrow('429');
		expect(loadOwnerKeyFile(path)).toEqual(OWNER_KEY_FILE);
	});

	it('is removed when the registration failed on-chain', async () => {
		const path = tempPath('owner-mldsa.json');
		const failed = { err: { InstructionError: [1, { Custom: 6003 }] } };
		await sendWithOwnerKeyFileWriteAhead(path, OWNER_KEY_FILE, async () => failed);
		expect(existsSync(path)).toBe(false);
	});
});
```

`config.test.ts`: add `ownerMldsaPath: '.devnet/owner-mldsa.json'` to the defaults expectation and:

```ts
	it('reads the owner ML-DSA key file path', () => {
		expect(loadConfig({ ...REQUIRED, OWNER_MLDSA_FILE: 'keys/owner.json' }).ownerMldsaPath).toBe('keys/owner.json');
	});
```

- [ ] **Step 2: Run, expect FAIL.** `~/.bun/bin/bun test src/lib/server/modules/agent/files.test.ts src/lib/server/modules/agent/config.test.ts`.

- [ ] **Step 3: Implement `files.ts`.** Keep the agent-file exports and their behaviour; route both file kinds
  through private helpers:

```ts
/** The owner's ML-DSA-44 key that activates every agent of `owner`. */
export interface OwnerKeyFile {
	owner: Address;
	ownerKey: Address;
	mldsaSecretKey: Uint8Array;
}

const AGENT_KEY_HOLDER = "an agent's";
const OWNER_KEY_HOLDER = "the owner's";

function assertKeyFileAbsent(path: string, holder: string): void {
	if (existsSync(path)) throw new Error(`${path} already exists; it holds the only copy of ${holder} ML-DSA-44 secret key`);
}

function writeKeyFile(path: string, file: { mldsaSecretKey: Uint8Array }): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = { ...file, mldsaSecretKey: Buffer.from(file.mldsaSecretKey).toString('base64') };
	writeFileSync(path, JSON.stringify(json, null, 2), { mode: 0o600, flag: 'wx' });
}

function readKeyFile(path: string): { fields: Record<string, string>; mldsaSecretKey: Uint8Array } {
	const { mldsaSecretKey, ...fields } = JSON.parse(readFileSync(path, 'utf8'));
	return { fields, mldsaSecretKey: new Uint8Array(Buffer.from(mldsaSecretKey, 'base64')) };
}

/** Saves before `send`, so a send that throws after landing cannot lose the key; removes it only on an on-chain failure. */
async function sendWithWriteAhead<TResult extends { err: unknown }>(path: string, save: () => void, send: () => Promise<TResult>): Promise<TResult> {
	save();
	const result = await send();
	if (result.err !== null) unlinkSync(path);
	return result;
}

export function assertAgentFileAbsent(path: string): void {
	assertKeyFileAbsent(path, AGENT_KEY_HOLDER);
}

export function saveAgentFile(path: string, file: AgentFile): void {
	assertAgentFileAbsent(path);
	writeKeyFile(path, file);
}

export function sendWithAgentFileWriteAhead<TResult extends { err: unknown }>(path: string, file: AgentFile, send: () => Promise<TResult>): Promise<TResult> {
	return sendWithWriteAhead(path, () => saveAgentFile(path, file), send);
}

export function loadAgentFile(path: string): AgentFile {
	const { fields, mldsaSecretKey } = readKeyFile(path);
	return { owner: address(fields.owner), agentKey: address(fields.agentKey), agent: address(fields.agent), mldsaSecretKey };
}

export function assertOwnerKeyFileAbsent(path: string): void {
	assertKeyFileAbsent(path, OWNER_KEY_HOLDER);
}

export function saveOwnerKeyFile(path: string, file: OwnerKeyFile): void {
	assertOwnerKeyFileAbsent(path);
	writeKeyFile(path, file);
}

export function sendWithOwnerKeyFileWriteAhead<TResult extends { err: unknown }>(path: string, file: OwnerKeyFile, send: () => Promise<TResult>): Promise<TResult> {
	return sendWithWriteAhead(path, () => saveOwnerKeyFile(path, file), send);
}

export function loadOwnerKeyFile(path: string): OwnerKeyFile {
	const { fields, mldsaSecretKey } = readKeyFile(path);
	return { owner: address(fields.owner), ownerKey: address(fields.ownerKey), mldsaSecretKey };
}
```

Keep the existing doc comments on the agent-file functions.

- [ ] **Step 4: Implement `config.ts`.** Add to `AgentConfig`:

```ts
	/** The owner's ML-DSA-44 key file; register-owner writes it, register and activate read it. */
	ownerMldsaPath: string;
```

`DEFAULTS.ownerMldsaPath = '.devnet/owner-mldsa.json'`, and in `loadConfig`:
`ownerMldsaPath: env.OWNER_MLDSA_FILE ?? DEFAULTS.ownerMldsaPath`.

`.env.example`, after `OWNER_KEYPAIR`:

```sh
# The owner's ML-DSA-44 key, which activates every agent (written by bun scripts/agent.ts register-owner). No wallet
# signs ML-DSA yet, so it lives on the server next to the owner's wallet.
OWNER_MLDSA_FILE=.devnet/owner-mldsa.json
```

- [ ] **Step 5: Run, expect PASS.** Same as Step 2, then the full `~/.bun/bin/bun test src agents scripts`.
- [ ] **Step 6: Commit.**

```bash
git add src/lib/server/modules/agent/files.ts src/lib/server/modules/agent/files.test.ts src/lib/server/modules/agent/config.ts src/lib/server/modules/agent/config.test.ts .env.example
git commit -m "agent: plik klucza ML-DSA-44 wlasciciela (zapis przed wysylka, bez nadpisywania) i OWNER_MLDSA_FILE"
```

---

### Task 6: CLI, setup and the devnet end-to-end script

**Files:**
- Modify: `scripts/agent.ts`
- Modify: `scripts/setup.ts`
- Modify: `scripts/setup-plan.ts`
- Modify: `scripts/devnet-e2e.ts`
- Test: `scripts/setup-plan.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 5.
- Produces: commands `bun scripts/agent.ts register-owner | activate`; `lamportsNeeded(agents: readonly AgentProgress[], ownerKeyRegistered: boolean): bigint`; `LAMPORTS_FOR_OWNER_KEY`.

- [ ] **Step 1: Failing tests.** In `setup-plan.test.ts` import `LAMPORTS_FOR_OWNER_KEY`; pass `true` as the second
  argument in the two existing `lamportsNeeded` calls, and add:

```ts
test('funding also covers the owner key until it is registered', () => {
	expect(lamportsNeeded([fresh], false)).toBe(LAMPORTS_PER_AGENT + LAMPORTS_FOR_OWNER_KEY);
	expect(lamportsNeeded([done], false)).toBe(LAMPORTS_FOR_OWNER_KEY);
});
```

- [ ] **Step 2: Run, expect FAIL.** `~/.bun/bin/bun test scripts/setup-plan.test.ts`.

- [ ] **Step 3: Implement `setup-plan.ts`.**

```ts
/** ~0.15 SOL of rent for the owner's 20.5 KB key account and its record. */
export const LAMPORTS_FOR_OWNER_KEY = 200_000_000n;

/** Only registration costs SOL; importing is local. The owner key is registered once, before any agent. */
export function lamportsNeeded(agents: readonly AgentProgress[], ownerKeyRegistered: boolean): bigint {
	const forAgents = BigInt(agents.filter((agent) => stepsFor(agent).includes('register')).length) * LAMPORTS_PER_AGENT;
	return ownerKeyRegistered ? forAgents : forAgents + LAMPORTS_FOR_OWNER_KEY;
}
```

- [ ] **Step 4: Run, expect PASS.** Same command.

- [ ] **Step 5: `scripts/agent.ts`.** Usage line: `<register-owner|register|activate|run|kill|resume|status>`.
  Imports: `existsSync` from `fs`; `activateAgent`, `registerOwner` from guard-client; `findOwnerRecordAddress` from
  instructions; `activateMessage`, `signGuardMessage` from message; `assertOwnerKeyFileAbsent`, `loadOwnerKeyFile`,
  `sendWithOwnerKeyFileWriteAhead`, `type OwnerKeyFile` from files; `type Address`, `type TransactionSigner` from kit.
  Add helpers after `loadOwner`:

```ts
/** The owner key file must exist and belong to OWNER_KEYPAIR: checked before anything is sent. */
function loadOwnerKeyFileOf(owner: Address): OwnerKeyFile {
	const path = config.ownerMldsaPath;
	if (!existsSync(path)) throw new Error(`${path} not found; run bun scripts/agent.ts register-owner first`);
	const file = loadOwnerKeyFile(path);
	if (file.owner !== owner) throw new Error(`${path} belongs to ${file.owner}, not to OWNER_KEYPAIR ${owner}`);
	return file;
}

async function sendActivation(owner: TransactionSigner, agent: Address, ownerKeyFile: OwnerKeyFile): Promise<boolean> {
	const signature = signGuardMessage(activateMessage(agent), ownerKeyFile.mldsaSecretKey);
	const ownerRecord = await findOwnerRecordAddress(config.programAddress, owner.address);
	const activation = { feePayer: owner, agent, ownerRecord, ownerKey: ownerKeyFile.ownerKey, signature };
	return reportSend('activate', await activateAgent(client, activation));
}
```

New commands (before `register`):

```ts
	async 'register-owner'() {
		assertOwnerKeyFileAbsent(config.ownerMldsaPath);
		const owner = await loadOwner();
		const keys = ml_dsa44.keygen();
		const ownerKey = await generateKeyPairSigner();
		const ownerRecord = await findOwnerRecordAddress(config.programAddress, owner.address);
		const file = { owner: owner.address, ownerKey: ownerKey.address, mldsaSecretKey: keys.secretKey };
		const register = () => registerOwner(client, { owner, ownerKey, ownerRecord, publicKey: keys.publicKey });
		const result = await sendWithOwnerKeyFileWriteAhead(config.ownerMldsaPath, file, register).catch((error) => {
			console.error(`owner key registration outcome unknown: ${config.ownerMldsaPath} kept; check ${ownerRecord} on the explorer`);
			throw error;
		});
		if (!reportSend('register-owner', result)) return false;
		console.log(`owner key ${ownerKey.address} (record ${ownerRecord}) saved to ${config.ownerMldsaPath}`);
		return true;
	},
```

In `register`: right after `const owner = await loadOwner();` add `const ownerKeyFile = loadOwnerKeyFileOf(owner.address);`.
Replace its ending (`console.log(...saved...); return true;`) with:

```ts
		console.log(`agent ${agent} saved to ${config.agentFilePath}`);
		if (await sendActivation(owner, agent, ownerKeyFile)) return true;
		console.error(`agent registered but not active; retry: AGENT_FILE=${config.agentFilePath} bun scripts/agent.ts activate`);
		return false;
```

New command after `register`:

```ts
	async activate() {
		const owner = await loadOwner();
		const { agent } = loadAgentFile(config.agentFilePath);
		return sendActivation(owner, agent, loadOwnerKeyFileOf(owner.address));
	},
```

- [ ] **Step 6: `scripts/setup.ts`.** Top comment: "… the payer wallet, its SOL, the owner's ML-DSA-44 key and the
  two agents (registered and activated on chain, imported into the fleet)". Replace the funding/agents lines with:

```ts
await ensureFunded(rpc, payer, lamportsNeeded(AGENTS.map(progressOf), existsSync(config.ownerMldsaPath)));
ensureOwnerKey();
for (const agent of AGENTS) setUpAgent(agent);
```

and add:

```ts
/** Once per owner wallet, before any agent: every agent needs the owner's ML-DSA-44 activation. */
function ensureOwnerKey(): void {
	if (existsSync(config.ownerMldsaPath)) return log(`owner key ${config.ownerMldsaPath} exists`);
	runBun(['scripts/agent.ts', 'register-owner']);
}
```

- [ ] **Step 7: `scripts/devnet-e2e.ts`.** After the `register` report, activate the fresh agent with the owner key
  file (it must exist: run setup first). Imports: `activateAgent` from guard-client, `findOwnerRecordAddress` from
  instructions, `activateMessage` from message, `loadOwnerKeyFile` from files. Insert before `const agentFile`:

```ts
const ownerKeyFile = loadOwnerKeyFile(config.ownerMldsaPath);
let state = await fetchAgent(client, registeredAgent);
check('registered agent is Pending with counter 0', state.status === 'Pending' && state.counter === 0n);
const activated = await activateAgent(client, {
	feePayer: payer,
	agent: registeredAgent,
	ownerRecord: await findOwnerRecordAddress(config.programAddress, payer.address),
	ownerKey: ownerKeyFile.ownerKey,
	signature: signGuardMessage(activateMessage(registeredAgent), ownerKeyFile.mldsaSecretKey)
});
if (!reportSend('activate', activated)) {
	console.log('FAIL: activate');
	process.exit(1);
}
```

Then change the later `let state = await readAgent();` to `state = await readAgent();` and its check label to
`'activated agent is Active with counter 0'`. Update the header comment: "register → activate → 3 steps → …" and
"needs the owner key file (bun scripts/setup.ts)".

- [ ] **Step 8: Run all TS tests and the usage line.** `~/.bun/bin/bun test src agents scripts` → all pass.
  `~/.bun/bin/bun scripts/agent.ts 2>&1 | head -1` → the new usage line. `~/.bun/bin/bun run check 2>&1 | tail -2` →
  still 86 errors.
- [ ] **Step 9: Commit.**

```bash
git add scripts/agent.ts scripts/setup.ts scripts/setup-plan.ts scripts/setup-plan.test.ts scripts/devnet-e2e.ts
git commit -m "agent: komendy register-owner i activate, register aktywuje od razu, setup rejestruje klucz wlasciciela, e2e z aktywacja"
```

---

### Task 7: Devnet migration (upgrade in place, re-register both agents)

**Files:**
- Modify: `onchain/README.md` (CLI list, result table)
- Local only, not in git: `.devnet/`, `spikes/falcon-noble-compat/.devnet/payer.json`

Spends devnet SOL only; does not touch the upgrade authority.

- [ ] **Step 1: Check the payer can pay.** Run
  `source onchain/toolchain.sh && toolchain solana --url devnet --keypair spikes/falcon-noble-compat/.devnet/payer.json balance`.
  Needed: ~3 SOL temporary buffer for the upgrade (returned after) + ~0.2 owner key + 2 × 0.2 agents. If short,
  stop and ask the user to fund `payer.json` (faucet.solana.com); do not proceed.
- [ ] **Step 2: Upgrade.** `onchain/deploy-devnet.sh` → prints `GUARD_PROGRAM_ID=BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs`.
- [ ] **Step 3: Stop the dev server if running, then move the legacy agents aside.**

```bash
mkdir -p .devnet/legacy-2026-10-11/fleet
mv .devnet/agents .devnet/legacy-2026-10-11/agents
mv .devnet/fleet/sentinel-01 .devnet/fleet/tick-01 .devnet/legacy-2026-10-11/fleet/
```

- [ ] **Step 4: Set up.** `~/.bun/bin/bun scripts/setup.ts` → `register-owner: ok`, then for each agent
  `register: ok`, `activate: ok`, import. Note CU and sizes of `register-owner` and `activate`.
- [ ] **Step 5: Verify on chain.** For each agent: `AGENT_FILE=.devnet/agents/<id>.json ~/.bun/bin/bun scripts/agent.ts status`
  → `status: 'Active'`. Start `~/.bun/bin/bun run dev --port 5199` and the agents (`bun scripts/demo.ts`), wait two ticks, `curl -s localhost:5199/api/agents` → both agents with growing counters and
  their new `pqcKeyAccount`. Stop the server.
- [ ] **Step 6: End-to-end.** `~/.bun/bin/bun scripts/devnet-e2e.ts` → PASS.
- [ ] **Step 7: Docs.** In `onchain/README.md`: add `register-owner` and `activate` to the Agent CLI block
  (`register` now "… + owner's activation"); add rows `register-owner` and `activate` with the measured CU and V1 size
  to the result table, and date the run.
- [ ] **Step 8: Commit.**

```bash
git add onchain/README.md
git commit -m "onchain: program zaktualizowany na devnecie, sentinel-01 i tick-01 zarejestrowane ponownie z aktywacja kluczem wlasciciela; pomiary CU"
```

---

### Task 8: Decision 005 and the README

**Files:**
- Create: `spec/decisions/005-klucz-pq-wlasciciela-aktywuje-agenta.md`
- Modify: `README.md` ("What is post-quantum here")

- [ ] **Step 1: Decision.** Write in Polish, in the style of `spec/decisions/004-…`: context (register_agent was
  Ed25519-only); decision (owner's ML-DSA-44 key in `OwnerKey` + permanent `OwnerRecord`; agents start `Pending`;
  `activate_agent` verifies the owner's signature over the agent address); why two transactions (~4,190 B > 4,096 B;
  ~1.36M of 1.4M CU); what remains Ed25519 (first `register_owner` per wallet, done before Q-day; `kill` on purpose);
  the legacy agents (their addresses from `.devnet/legacy-2026-10-11/agents/*.json`: `Active` without owner
  approval); immutable deploy as the last step.
- [ ] **Step 2: README.** Move the register part of the WIP bullet into "Quantum-resistant": "a new agent's start:
  the program activates an agent only with the owner's ML-DSA-44 signature (decision 005)". Keep only the upgradeable
  program in "Not quantum-resistant yet (WIP)" and mention the two legacy agents by address.
- [ ] **Step 3: Commit.**

```bash
git add spec/decisions/005-klucz-pq-wlasciciela-aktywuje-agenta.md README.md
git commit -m "spec: decyzja 005 - klucz ML-DSA-44 wlasciciela aktywuje kazdego agenta; readme: rejestracja agenta odporna kwantowo"
```

---

### Task 9: Immutable program (needs the user's explicit go)

**Files:**
- Modify: `README.md`, `onchain/README.md`, `onchain/deploy-devnet.sh` (header comment)

- [ ] **Step 1: Ask.** Stop and ask the user in chat: "Make `BL6Fjh…` immutable now? Irreversible; any later fix
  needs a new program ID and re-registering every agent." Proceed only on an explicit yes.
- [ ] **Step 2: Finalize.**

```bash
source onchain/toolchain.sh
toolchain solana --url devnet --keypair spikes/falcon-noble-compat/.devnet/payer.json \
  program set-upgrade-authority BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs --final
toolchain solana --url devnet program show BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs
```

Expected: `Authority: none`.
- [ ] **Step 3: Docs.** README: drop the WIP bullet's upgradeable part (move "the program is immutable" to
  "Quantum-resistant"). `onchain/README.md` and `deploy-devnet.sh` comment: the program is final; a new deploy needs a
  new program keypair.
- [ ] **Step 4: Commit.**

```bash
git add README.md onchain/README.md onchain/deploy-devnet.sh
git commit -m "onchain: program na devnecie niezmienny (--final); readme bez WIP"
```
