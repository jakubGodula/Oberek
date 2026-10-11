use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::PreparedVerifyingKey;

pub const AGENT_SEED: &[u8] = b"agent";
pub const OWNER_SEED: &[u8] = b"owner";

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
pub type MldsaPreparedKey = PreparedVerifyingKey<false>;
pub const MLDSA_PREPARED_KEY_LEN: usize = MldsaPreparedKey::BYTE_LEN;

/// The agent's prepared ML-DSA-44 public key. Written once by `register_agent`, read by every signed instruction.
#[account(zero_copy)]
pub struct AgentKey {
    pub prepared: [u8; MLDSA_PREPARED_KEY_LEN],
}

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

/// PDA with seeds `[AGENT_SEED, owner, agent_key]`: the only mutable state of an agent.
#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner: Pubkey,
    pub agent_key: Pubkey,
    pub status: AgentStatus,
    /// Number of accepted steps and resumes; every signed message names the next value, so a signature works once.
    pub counter: u64,
    /// The last step's decision hash, or the last batch's Merkle root.
    pub last_decision: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum AgentStatus {
    Active,
    Killed,
    /// Registered, waiting for the owner's ML-DSA-44 activation. Appended so older accounts still decode.
    Pending,
}

#[event]
pub struct StepRecorded {
    pub agent: Pubkey,
    pub counter: u64,
    pub decision_hash: [u8; 32],
}

#[event]
pub struct BatchRecorded {
    pub agent: Pubkey,
    pub counter: u64,
    pub root: [u8; 32],
    pub size: u32,
}

#[event]
pub struct AgentActivated {
    pub agent: Pubkey,
    pub counter: u64,
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
