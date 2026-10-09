//! On-chain guard for one server-side agent: holds the agent's ML-DSA-44 public key, accepts a step or a resume only
//! with a valid ML-DSA-44 signature over a message it builds itself, and lets the owner's wallet kill the agent.
use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::{Signature, VerifyingKey};

pub mod error;
pub mod message;
pub mod state;

use error::GuardError;
use message::{step_message, CONTEXT as MLDSA_CONTEXT};
use state::{Agent, AgentKey, AgentStatus, MldsaPreparedKey, StepRecorded, AGENT_SEED};

declare_id!("BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs");

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
type MldsaVerifyingKey = VerifyingKey<false>;

#[program]
pub mod onchain_agent_guard {
    use super::*;

    pub fn register_agent(ctx: Context<RegisterAgent>, public_key: Vec<u8>) -> Result<()> {
        let public_key =
            MldsaVerifyingKey::ref_from_bytes(&public_key).map_err(|_| GuardError::InvalidPublicKey)?;
        {
            let mut key = ctx.accounts.agent_key.load_init()?;
            let prepared =
                MldsaPreparedKey::mut_from_bytes(&mut key.prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
            public_key.prepare_into(prepared);
        }
        ctx.accounts.agent.set_inner(Agent {
            owner: ctx.accounts.owner.key(),
            agent_key: ctx.accounts.agent_key.key(),
            status: AgentStatus::Active,
            counter: 0,
            last_decision: [0; 32],
            bump: ctx.bumps.agent,
        });
        Ok(())
    }

    pub fn record_step(ctx: Context<RecordStep>, decision_hash: [u8; 32], signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentKilled);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key, &step_message(&agent_address, counter, &decision_hash), &signature)?;
        agent.counter = counter;
        agent.last_decision = decision_hash;
        emit!(StepRecorded { agent: agent_address, counter, decision_hash });
        Ok(())
    }
}

fn verify_signature(agent_key: &AccountLoader<AgentKey>, signed: &[u8], signature: &[u8]) -> Result<()> {
    let key = agent_key.load()?;
    let prepared = MldsaPreparedKey::ref_from_bytes(&key.prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    let signature = Signature::ref_from_bytes(signature).map_err(|_| GuardError::InvalidSignature)?;
    prepared
        .verify_with_context(signed, MLDSA_CONTEXT, signature)
        .map_err(|_| error!(GuardError::VerifyFailed))
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Allocated by a preceding System Program `create_account` in the same transaction: `init` allocates through
    /// CPI, which caps account size at 10 KiB, and this account is 20,552 B.
    #[account(zero)]
    pub agent_key: AccountLoader<'info, AgentKey>,
    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [AGENT_SEED, owner.key().as_ref(), agent_key.key().as_ref()],
        bump,
    )]
    pub agent: Account<'info, Agent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordStep<'info> {
    #[account(mut, has_one = agent_key)]
    pub agent: Account<'info, Agent>,
    pub agent_key: AccountLoader<'info, AgentKey>,
}
