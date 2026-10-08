//! Copied into upstream's program/tests/ by run-mollusk.sh. Registers a noble ML-DSA-44 key with upstream's
//! example program and verifies a noble signature from the key account; prints CU and V1 transaction sizes.
use mollusk_svm::Mollusk;
use solana_account::Account;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_message::v1;
use solana_ml_dsa_example::KEY_ACCOUNT_LEN;
use solana_system_interface::{instruction::create_account, program::ID as SYSTEM_PROGRAM};

const CU_LIMIT: u64 = 1_400_000;
const V1_MAX_TRANSACTION_SIZE: usize = 4096;
const ED25519_SIGNATURE_LEN: usize = 64;
const TAG_REGISTER_SHAKE: u8 = 0;
const TAG_VERIFY_SHAKE: u8 = 1;
const PAYER_LAMPORTS: u64 = 1_000_000_000;

const PUBLIC_KEY: &[u8] = include_bytes!("fixtures/noble.pk");
const SIGNATURE: &[u8] = include_bytes!("fixtures/noble.sig");
const MESSAGE: &[u8] = include_bytes!("fixtures/noble.msg");

fn mollusk(program: &Address) -> Mollusk {
    let directory = std::env::var_os("SBF_OUT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/deploy"));
    let elf = directory.join("solana_ml_dsa_example");
    let mut svm = Mollusk::new(program, elf.to_str().unwrap());
    svm.compute_budget.compute_unit_limit = CU_LIMIT;
    svm
}

fn v1_transaction_size(payer: &Address, instructions: &[Instruction]) -> usize {
    let message = v1::Message::try_compile_with_config(
        payer,
        instructions,
        Default::default(),
        v1::TransactionConfig::empty()
            .with_compute_unit_limit(CU_LIMIT as u32)
            .with_priority_fee(10_000),
    )
    .unwrap();
    let signers = usize::from(message.header.num_required_signatures);
    message.serialize().len() + signers * ED25519_SIGNATURE_LEN
}

fn instruction(program: Address, data: Vec<u8>, key: AccountMeta) -> Instruction {
    Instruction::new_with_bytes(program, &data, vec![key])
}

fn verify_data(signature: &[u8], message: &[u8]) -> Vec<u8> {
    [&[TAG_VERIFY_SHAKE], signature, message].concat()
}

fn report(label: &str, outcome: &impl std::fmt::Debug, compute_units: u64, size: usize) {
    println!("{label}: {outcome:?}, {compute_units} CU, {size} B as V1 transaction");
}

#[test]
fn noble_key_registers_and_noble_signature_verifies() {
    let program = Address::new_from_array([1; 32]);
    let payer = Address::new_from_array([2; 32]);
    let key = Address::new_from_array([3; 32]);
    let svm = mollusk(&program);
    let accounts = vec![(payer, Account::new(PAYER_LAMPORTS, 0, &SYSTEM_PROGRAM)), (key, Account::default())];

    // Account allocation + key preparation in one transaction, one CU budget.
    let register = [
        create_account(&payer, &key, svm.sysvars.rent.minimum_balance(KEY_ACCOUNT_LEN), KEY_ACCOUNT_LEN as u64, &program),
        instruction(program, [&[TAG_REGISTER_SHAKE], PUBLIC_KEY].concat(), AccountMeta::new(key, true)),
    ];
    let registered = svm.process_transaction_instructions(&register, &accounts, Some(&payer));
    let size = v1_transaction_size(&payer, &register);
    report("register (create account + prepare key)", &registered.raw_result, registered.compute_units_consumed, size);
    assert_eq!(registered.raw_result, Ok(()));
    let accounts = registered.resulting_accounts;

    let key_meta = AccountMeta::new_readonly(key, false);
    let run = |data: Vec<u8>| {
        let ix = [instruction(program, data, key_meta.clone())];
        (svm.process_transaction_instructions(&ix, &accounts, Some(&payer)), v1_transaction_size(&payer, &ix))
    };

    let (valid, size) = run(verify_data(SIGNATURE, MESSAGE));
    report("verify valid", &valid.raw_result, valid.compute_units_consumed, size);
    assert_eq!(valid.raw_result, Ok(()));
    assert!(size <= V1_MAX_TRANSACTION_SIZE);

    let mut tampered_message = MESSAGE.to_vec();
    tampered_message[0] ^= 1;
    let (rejected, size) = run(verify_data(SIGNATURE, &tampered_message));
    report("verify tampered message", &rejected.raw_result, rejected.compute_units_consumed, size);
    assert!(rejected.raw_result.is_err(), "tampered message accepted");

    let mut tampered_signature = SIGNATURE.to_vec();
    tampered_signature[SIGNATURE.len() / 2] ^= 1;
    let (rejected, size) = run(verify_data(&tampered_signature, MESSAGE));
    report("verify tampered signature", &rejected.raw_result, rejected.compute_units_consumed, size);
    assert!(rejected.raw_result.is_err(), "tampered signature accepted");
}
