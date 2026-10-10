use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Agent is killed")]
    AgentKilled,
    #[msg("Agent is not killed")]
    AgentNotKilled,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Malformed ML-DSA-44 public key")]
    InvalidPublicKey,
    #[msg("Malformed ML-DSA-44 signature")]
    InvalidSignature,
    #[msg("Key account does not hold a valid prepared key")]
    InvalidKeyAccount,
    #[msg("ML-DSA-44 signature verification failed")]
    VerifyFailed,
}
