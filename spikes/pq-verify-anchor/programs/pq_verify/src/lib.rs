//! Spike: ML-DSA-44 (solana-ml-dsa) and Falcon-512 (solana-falcon512) verification inside an Anchor 1.2.1 program.
//! Each scheme registers a key once (stores its prepared form in an account) and verifies signatures against it.
use anchor_lang::prelude::*;
use solana_falcon512::{
    Falcon512PreparedPubkey, Falcon512Pubkey, Falcon512Signature, FALCON_512_PREPARED_PUBKEY_LEN,
};
use solana_ml_dsa::ml_dsa_44::{PreparedVerifyingKey, Signature, VerifyingKey};

declare_id!("5Li4eRzF17yEfAEpbNceWuvrkUesCYbX5jf7xDV4oe1Q");

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
type MldsaVerifyingKey = VerifyingKey<false>;
type MldsaPreparedKey = PreparedVerifyingKey<false>;

/// FIPS 204 context string (domain separation); the signer must use the same one.
pub const MLDSA_CONTEXT: &[u8] = b"aegis:resume:v1";
pub const MLDSA_PREPARED_KEY_LEN: usize = MldsaPreparedKey::BYTE_LEN;
pub const FALCON_KEY_SEED: &[u8] = b"falcon_key";

#[program]
pub mod pq_verify {
    use super::*;

    pub fn register_mldsa_key(ctx: Context<RegisterMldsaKey>, public_key: Vec<u8>) -> Result<()> {
        let public_key = MldsaVerifyingKey::ref_from_bytes(&public_key).map_err(|_| PqError::InvalidPublicKey)?;
        let mut key = ctx.accounts.key.load_init()?;
        let prepared =
            MldsaPreparedKey::mut_from_bytes(&mut key.prepared).map_err(|_| PqError::InvalidKeyAccount)?;
        public_key.prepare_into(prepared);
        Ok(())
    }

    pub fn verify_mldsa(ctx: Context<VerifyMldsa>, signature: Vec<u8>, message: Vec<u8>) -> Result<()> {
        let key = ctx.accounts.key.load()?;
        let prepared = MldsaPreparedKey::ref_from_bytes(&key.prepared).map_err(|_| PqError::InvalidKeyAccount)?;
        let signature = Signature::ref_from_bytes(&signature).map_err(|_| PqError::InvalidSignature)?;
        prepared
            .verify_with_context(&message, MLDSA_CONTEXT, signature)
            .map_err(|_| error!(PqError::VerifyFailed))
    }

    pub fn register_falcon_key(ctx: Context<RegisterFalconKey>, public_key: Vec<u8>) -> Result<()> {
        let public_key = Falcon512Pubkey::try_from_slice(&public_key).map_err(|_| PqError::InvalidPublicKey)?;
        // Borrow the 1 KiB prepared key out of the Result: moving it through map_err and `?` left four stack copies,
        // a 4160 B frame over the 4 KiB SBF limit (cargo build-sbf warns, the build still succeeds).
        let prepared = public_key.try_prepare_pubkey();
        let prepared = prepared.as_ref().map_err(|_| PqError::InvalidPublicKey)?;
        ctx.accounts.key.load_init()?.prepared.copy_from_slice(prepared.as_bytes());
        Ok(())
    }

    pub fn verify_falcon(ctx: Context<VerifyFalcon>, signature: Vec<u8>, message: Vec<u8>) -> Result<()> {
        let key = ctx.accounts.key.load()?;
        let prepared =
            Falcon512PreparedPubkey::try_from_slice(&key.prepared).map_err(|_| PqError::InvalidKeyAccount)?;
        let signature = Falcon512Signature::try_from_slice(&signature).map_err(|_| PqError::InvalidSignature)?;
        require!(signature.verify_with_prepared(&message, prepared), PqError::VerifyFailed);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterMldsaKey<'info> {
    /// Allocated by a preceding top-level System Program instruction in the same transaction: `init` would
    /// allocate through CPI, which caps account growth at 10 KiB.
    #[account(zero)]
    pub key: AccountLoader<'info, MldsaKey>,
}

#[derive(Accounts)]
pub struct VerifyMldsa<'info> {
    pub key: AccountLoader<'info, MldsaKey>,
}

#[derive(Accounts)]
pub struct RegisterFalconKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + core::mem::size_of::<FalconKey>(),
        seeds = [FALCON_KEY_SEED, authority.key().as_ref()],
        bump,
    )]
    pub key: AccountLoader<'info, FalconKey>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyFalcon<'info> {
    pub key: AccountLoader<'info, FalconKey>,
}

#[account(zero_copy)]
pub struct MldsaKey {
    pub prepared: [u8; MLDSA_PREPARED_KEY_LEN],
}

#[account(zero_copy)]
pub struct FalconKey {
    pub prepared: [u8; FALCON_512_PREPARED_PUBKEY_LEN],
}

#[error_code]
pub enum PqError {
    #[msg("Malformed public key")]
    InvalidPublicKey,
    #[msg("Malformed signature")]
    InvalidSignature,
    #[msg("Key account does not hold a valid prepared key")]
    InvalidKeyAccount,
    #[msg("Signature verification failed")]
    VerifyFailed,
}
