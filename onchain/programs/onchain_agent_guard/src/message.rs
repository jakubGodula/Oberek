//! The bytes the agent's ML-DSA-44 key signs. Must match src/lib/server/modules/agent/message.ts; both sides are
//! checked against onchain/fixtures/message-vector.json.
use anchor_lang::prelude::Pubkey;

/// FIPS 204 context string (domain separation); the signer uses the same one.
pub const CONTEXT: &[u8] = b"onchain-agent-guard:v1";
pub const DECISION_HASH_LEN: usize = 32;
const STEP_TAG: u8 = 1;
const RESUME_TAG: u8 = 2;
const BATCH_TAG: u8 = 3;
const ACTIVATE_TAG: u8 = 4;
/// Activation happens once, while the agent's counter is still 0.
const ACTIVATION_COUNTER: u64 = 0;
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

/// Message for the batch of `size` decisions with Merkle root `root` that moves the agent's counter to `counter`.
pub fn batch_message(agent: &Pubkey, counter: u64, root: &[u8; DECISION_HASH_LEN], size: u32) -> Vec<u8> {
    let mut message = header(BATCH_TAG, agent, counter);
    message.extend_from_slice(root);
    message.extend_from_slice(&size.to_le_bytes());
    message
}

/// Message the owner's ML-DSA-44 key signs to activate a registered agent.
pub fn activate_message(agent: &Pubkey) -> Vec<u8> {
    header(ACTIVATE_TAG, agent, ACTIVATION_COUNTER)
}

fn header(tag: u8, agent: &Pubkey, counter: u64) -> Vec<u8> {
    let mut message = Vec::with_capacity(HEADER_LEN + DECISION_HASH_LEN);
    message.push(tag);
    message.extend_from_slice(agent.as_ref());
    message.extend_from_slice(&counter.to_le_bytes());
    message
}
