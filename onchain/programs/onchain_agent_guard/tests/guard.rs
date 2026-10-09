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
const STEP_1_SIGNATURE: &[u8] = include_bytes!("fixtures/step-1.sig");
const SIGNED_INSTRUCTION_INDEX: u8 = 0;

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
