//! Mollusk tests for onchain_agent_guard with noble ML-DSA-44 fixtures from scripts/gen-guard-fixtures.ts (run
//! onchain/run-tests.sh). OWNER, AGENT_KEY and decision_hash() must match the constants in that script.
use anchor_lang::{error::ErrorCode as AnchorError, prelude::Pubkey, AccountDeserialize, InstructionData};
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
const STEP_1_SIGNATURE: &[u8] = include_bytes!("fixtures/step-1.sig");
const STEP_2_SIGNATURE: &[u8] = include_bytes!("fixtures/step-2.sig");
const STEP_3_SIGNATURE: &[u8] = include_bytes!("fixtures/step-3.sig");
const RESUME_2_SIGNATURE: &[u8] = include_bytes!("fixtures/resume-2.sig");
const BATCH_1_SIGNATURE: &[u8] = include_bytes!("fixtures/batch-1.sig");
/// Must match BATCH_ROOT and BATCH_SIZE in scripts/gen-guard-fixtures.ts.
const BATCH_ROOT: [u8; 32] = [0xb7; 32];
const BATCH_SIZE: u32 = 5;
const SIGNED_INSTRUCTION_INDEX: u8 = 0;

const PROGRAM: Address = Address::new_from_array(onchain_agent_guard::ID.to_bytes());
const OWNER: Address = Address::new_from_array([2; 32]);
const AGENT_KEY: Address = Address::new_from_array([3; 32]);
const STRANGER: Address = Address::new_from_array([4; 32]);
/// A key account the stranger registers for an agent of their own.
const ATTACKER_KEY: Address = Address::new_from_array([5; 32]);

fn agent_address() -> Address {
    agent_address_for(OWNER, AGENT_KEY)
}

fn agent_address_for(owner: Address, agent_key: Address) -> Address {
    let (agent, _) =
        Pubkey::find_program_address(&[AGENT_SEED, owner.as_ref(), agent_key.as_ref()], &onchain_agent_guard::ID);
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
    step_using_key(AGENT_KEY, decision_hash, signature)
}

fn step_using_key(agent_key: Address, decision_hash: [u8; 32], signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::RecordStep { decision_hash, signature: signature.to_vec() }.data(),
        vec![AccountMeta::new(agent_address(), false), AccountMeta::new_readonly(agent_key, false)],
    )
}

/// The step that moves the counter to `counter`, with the fixture's decision hash for it.
fn step(counter: u64, signature: &[u8]) -> Instruction {
    step_with(decision_hash(counter), signature)
}

/// The batch that moves the counter to the next value, signed over `root` and `size`.
fn batch(root: [u8; 32], size: u32, signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::RecordBatch { root, size, signature: signature.to_vec() }.data(),
        vec![AccountMeta::new(agent_address(), false), AccountMeta::new_readonly(AGENT_KEY, false)],
    )
}

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
    resume_with(OWNER, owner_signs, AGENT_KEY, signature)
}

/// Resume of the owner's agent, with `owner` and `agent_key` accounts chosen by the caller.
fn resume_with(owner: Address, owner_signs: bool, agent_key: Address, signature: &[u8]) -> Instruction {
    Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::Resume { signature: signature.to_vec() }.data(),
        vec![
            AccountMeta::new_readonly(owner, owner_signs),
            AccountMeta::new(agent_address(), false),
            AccountMeta::new_readonly(agent_key, false),
        ],
    )
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
                (ATTACKER_KEY, Account::default()),
                (agent_address_for(STRANGER, ATTACKER_KEY), Account::default()),
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

    /// Registered, one step taken (counter 1), then killed by the owner.
    fn killed_after_first_step() -> Self {
        let mut ledger = Self::registered();
        assert_eq!(ledger.send("step 1", &[step(1, STEP_1_SIGNATURE)]), Ok(()));
        assert_eq!(ledger.send("kill", &[kill(OWNER)]), Ok(()));
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
        self.register_instructions_for(OWNER, AGENT_KEY, public_key)
    }

    fn register_instructions_for(&self, owner: Address, agent_key: Address, public_key: &[u8]) -> Vec<Instruction> {
        let rent = self.svm.sysvars.rent.minimum_balance(AGENT_KEY_ACCOUNT_LEN);
        vec![
            create_account(&owner, &agent_key, rent, AGENT_KEY_ACCOUNT_LEN as u64, &PROGRAM),
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

    /// The stranger registers an agent of their own, so ATTACKER_KEY is a valid key account.
    fn with_attacker_agent(mut self) -> Self {
        let register = self.register_instructions_for(STRANGER, ATTACKER_KEY, PUBLIC_KEY);
        assert_eq!(self.send_paid_by(STRANGER, "attacker register", &register), Ok(()));
        self
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

#[test]
fn step_with_another_agents_key_fails() {
    let mut ledger = Ledger::registered().with_attacker_agent();
    assert_eq!(
        ledger.send("step 1 with attacker key", &[step_using_key(ATTACKER_KEY, decision_hash(1), STEP_1_SIGNATURE)]),
        anchor_error(SIGNED_INSTRUCTION_INDEX, AnchorError::ConstraintHasOne)
    );
}

#[test]
fn resume_with_another_agents_key_fails() {
    let mut ledger = Ledger::killed_after_first_step().with_attacker_agent();
    assert_eq!(
        ledger.send("resume with attacker key", &[resume_with(OWNER, true, ATTACKER_KEY, RESUME_2_SIGNATURE)]),
        anchor_error(SIGNED_INSTRUCTION_INDEX, AnchorError::ConstraintHasOne)
    );
}

#[test]
fn resume_by_a_non_owner_fails() {
    let mut ledger = Ledger::killed_after_first_step();
    assert_eq!(
        ledger.send_paid_by(STRANGER, "resume by stranger", &[resume_with(STRANGER, true, AGENT_KEY, RESUME_2_SIGNATURE)]),
        anchor_error(SIGNED_INSTRUCTION_INDEX, AnchorError::ConstraintHasOne)
    );
}

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
