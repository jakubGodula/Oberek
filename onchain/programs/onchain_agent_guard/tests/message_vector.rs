//! The signed message bytes must match the TypeScript client (message.test.ts checks the same vector).
use anchor_lang::prelude::Pubkey;
use onchain_agent_guard::message::{activate_message, batch_message, resume_message, step_message, CONTEXT};

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
    let root: [u8; 32] = hex(field(&vector, "batchRoot")).try_into().unwrap();
    let size = vector["batchSize"].as_u64().unwrap() as u32;
    assert_eq!(batch_message(&agent, counter, &root, size), hex(field(&vector, "batchMessage")));
    assert_eq!(activate_message(&agent), hex(field(&vector, "activateMessage")));
}
