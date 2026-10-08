//! Registers noble ML-DSA-44 and Falcon-512 keys with the Anchor program and verifies noble signatures against
//! the stored prepared keys; prints CU and legacy/V1 transaction sizes.
use anchor_lang::{prelude::Pubkey, InstructionData};
use mollusk_svm::{program::keyed_account_for_system_program, Mollusk};
use pq_verify::{instruction as program_ix, PqError, FALCON_KEY_SEED, MldsaKey};
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{error::InstructionError, AccountMeta, Instruction};
use solana_message::{legacy, v1};
use solana_system_interface::{instruction::create_account, program::ID as SYSTEM_PROGRAM};
use solana_transaction_error::TransactionError;

const CU_LIMIT: u32 = 1_400_000;
const PRIORITY_FEE_LAMPORTS: u64 = 10_000;
const PRIORITY_FEE_MICROLAMPORTS_PER_CU: u64 = 1;
const COMPUTE_BUDGET_PROGRAM: Address = Address::from_str_const("ComputeBudget111111111111111111111111111111");
const SET_COMPUTE_UNIT_LIMIT_TAG: u8 = 2;
const SET_COMPUTE_UNIT_PRICE_TAG: u8 = 3;
const ED25519_SIGNATURE_LEN: usize = 64;
const LEGACY_SIGNATURE_COUNT_LEN: usize = 1; // compact-u16, one byte below 128 signatures
const ANCHOR_DISCRIMINATOR_LEN: usize = 8;
const PAYER_LAMPORTS: u64 = 10_000_000_000;

const MESSAGE: &[u8] = include_bytes!("fixtures/message.bin");
const MLDSA_PUBLIC_KEY: &[u8] = include_bytes!("fixtures/mldsa.pk");
const MLDSA_SIGNATURE: &[u8] = include_bytes!("fixtures/mldsa.sig");
const FALCON_PUBLIC_KEY: &[u8] = include_bytes!("fixtures/falcon.pk");
const FALCON_SIGNATURE: &[u8] = include_bytes!("fixtures/falcon.sig");

const PROGRAM: Address = Address::new_from_array(pq_verify::ID.to_bytes());
const PAYER: Address = Address::new_from_array([2; 32]);
const MLDSA_KEY: Address = Address::new_from_array([3; 32]);

fn mollusk() -> Mollusk {
    let directory = std::env::var_os("SBF_OUT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy"));
    let elf = directory.join("pq_verify");
    let mut svm = Mollusk::new(&PROGRAM, elf.to_str().unwrap());
    svm.compute_budget.compute_unit_limit = u64::from(CU_LIMIT);
    svm
}

fn payer_account() -> (Address, Account) {
    (PAYER, Account::new(PAYER_LAMPORTS, 0, &SYSTEM_PROGRAM))
}

fn v1_transaction_size(instructions: &[Instruction]) -> usize {
    let config = v1::TransactionConfig::empty()
        .with_compute_unit_limit(CU_LIMIT)
        .with_priority_fee(PRIORITY_FEE_LAMPORTS);
    let message = v1::Message::try_compile_with_config(&PAYER, instructions, Default::default(), config).unwrap();
    message.serialize().len() + usize::from(message.header.num_required_signatures) * ED25519_SIGNATURE_LEN
}

// Legacy carries the CU limit and priority fee as Compute Budget instructions instead of a config.
fn legacy_transaction_size(instructions: &[Instruction]) -> usize {
    let budget = [
        Instruction::new_with_bytes(COMPUTE_BUDGET_PROGRAM, &[&[SET_COMPUTE_UNIT_LIMIT_TAG], &CU_LIMIT.to_le_bytes()[..]].concat(), vec![]),
        Instruction::new_with_bytes(
            COMPUTE_BUDGET_PROGRAM,
            &[&[SET_COMPUTE_UNIT_PRICE_TAG], &PRIORITY_FEE_MICROLAMPORTS_PER_CU.to_le_bytes()[..]].concat(),
            vec![],
        ),
    ];
    let message = legacy::Message::new(&[&budget[..], instructions].concat(), Some(&PAYER));
    LEGACY_SIGNATURE_COUNT_LEN
        + usize::from(message.header.num_required_signatures) * ED25519_SIGNATURE_LEN
        + message.serialize().len()
}

fn report(label: &str, outcome: &impl std::fmt::Debug, compute_units: u64, instructions: &[Instruction]) {
    println!(
        "{label}: {outcome:?}, {compute_units} CU, legacy {} B (limit 1232), V1 {} B (limit 4096)",
        legacy_transaction_size(instructions),
        v1_transaction_size(instructions),
    );
}

fn verify_failed() -> Result<(), TransactionError> {
    Err(TransactionError::InstructionError(0, InstructionError::Custom(PqError::VerifyFailed.into())))
}

fn flipped(bytes: &[u8], index: usize) -> Vec<u8> {
    let mut out = bytes.to_vec();
    out[index] ^= 1;
    out
}

/// Valid signature must verify; the same signature over a tampered message, and a tampered signature, must fail.
fn check_verification(
    svm: &Mollusk,
    accounts: &[(Address, Account)],
    scheme: &str,
    signature: &[u8],
    verify: impl Fn(&[u8], &[u8]) -> Instruction,
) {
    let cases = [
        ("valid", signature.to_vec(), MESSAGE.to_vec(), Ok(())),
        ("tampered message", signature.to_vec(), flipped(MESSAGE, 0), verify_failed()),
        ("tampered signature", flipped(signature, signature.len() / 2), MESSAGE.to_vec(), verify_failed()),
    ];
    for (case, signature, message, expected) in cases {
        let instructions = [verify(&signature, &message)];
        let result = svm.process_transaction_instructions(&instructions, accounts, Some(&PAYER));
        report(&format!("{scheme} verify {case}"), &result.raw_result, result.compute_units_consumed, &instructions);
        assert_eq!(result.raw_result, expected, "{scheme} verify {case}");
    }
}

#[test]
fn mldsa_key_registers_and_noble_signature_verifies() {
    let svm = mollusk();
    let key_account_len = ANCHOR_DISCRIMINATOR_LEN + std::mem::size_of::<MldsaKey>();
    let register = [
        create_account(&PAYER, &MLDSA_KEY, svm.sysvars.rent.minimum_balance(key_account_len), key_account_len as u64, &PROGRAM),
        Instruction::new_with_bytes(
            PROGRAM,
            &program_ix::RegisterMldsaKey { public_key: MLDSA_PUBLIC_KEY.to_vec() }.data(),
            vec![AccountMeta::new(MLDSA_KEY, false)],
        ),
    ];
    let accounts = [payer_account(), (MLDSA_KEY, Account::default())];
    let registered = svm.process_transaction_instructions(&register, &accounts, Some(&PAYER));
    report("ML-DSA-44 register (create account + prepare key)", &registered.raw_result, registered.compute_units_consumed, &register);
    assert_eq!(registered.raw_result, Ok(()));

    check_verification(&svm, &registered.resulting_accounts, "ML-DSA-44", MLDSA_SIGNATURE, |signature, message| {
        Instruction::new_with_bytes(
            PROGRAM,
            &program_ix::VerifyMldsa { signature: signature.to_vec(), message: message.to_vec() }.data(),
            vec![AccountMeta::new_readonly(MLDSA_KEY, false)],
        )
    });
}

#[test]
fn falcon_key_registers_and_noble_signature_verifies() {
    let svm = mollusk();
    let (key, _) = Pubkey::find_program_address(&[FALCON_KEY_SEED, PAYER.as_ref()], &pq_verify::ID);
    let key = Address::new_from_array(key.to_bytes());
    let register = [Instruction::new_with_bytes(
        PROGRAM,
        &program_ix::RegisterFalconKey { public_key: FALCON_PUBLIC_KEY.to_vec() }.data(),
        vec![AccountMeta::new(PAYER, true), AccountMeta::new(key, false), AccountMeta::new_readonly(SYSTEM_PROGRAM, false)],
    )];
    let accounts = [payer_account(), (key, Account::default()), keyed_account_for_system_program()];
    let registered = svm.process_transaction_instructions(&register, &accounts, Some(&PAYER));
    report("Falcon-512 register (init PDA + prepare key)", &registered.raw_result, registered.compute_units_consumed, &register);
    assert_eq!(registered.raw_result, Ok(()));

    check_verification(&svm, &registered.resulting_accounts, "Falcon-512", FALCON_SIGNATURE, |signature, message| {
        Instruction::new_with_bytes(
            PROGRAM,
            &program_ix::VerifyFalcon { signature: signature.to_vec(), message: message.to_vec() }.data(),
            vec![AccountMeta::new_readonly(key, false)],
        )
    });
}
