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
