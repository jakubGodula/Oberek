//! On-chain guard for one server-side agent: holds the agent's ML-DSA-44 public key, starts the agent only after the
//! owner's ML-DSA-44 key activates it, accepts a step or a resume only with a valid ML-DSA-44 signature over a message
//! it builds itself, and lets the owner's wallet kill the agent.
use anchor_lang::prelude::*;
use solana_ml_dsa::ml_dsa_44::{Signature, VerifyingKey};

pub mod error;
pub mod message;
pub mod state;

use error::GuardError;
use message::{activate_message, batch_message, resume_message, step_message, CONTEXT as MLDSA_CONTEXT};
use state::{
    Agent, AgentActivated, AgentKey, AgentKilled, AgentResumed, AgentStatus, BatchRecorded, MldsaPreparedKey, OwnerKey,
    OwnerRecord, StepRecorded, AGENT_SEED, MLDSA_PREPARED_KEY_LEN, OWNER_SEED,
};

declare_id!("BL6Fjh4pADgjvZwaueeAcc7rYddFrdMNWnqK73x78ZSs");

/// SHAKE mode (`TURBO = false`): FIPS 204, the mode compatible with noble's `ml_dsa44`.
type MldsaVerifyingKey = VerifyingKey<false>;

#[program]
pub mod onchain_agent_guard {
    use super::*;

    pub fn register_owner(ctx: Context<RegisterOwner>, public_key: Vec<u8>) -> Result<()> {
        prepare_key(&public_key, &mut ctx.accounts.owner_key.load_init()?.prepared)?;
        ctx.accounts.owner_record.set_inner(OwnerRecord {
            owner: ctx.accounts.owner.key(),
            owner_key: ctx.accounts.owner_key.key(),
            bump: ctx.bumps.owner_record,
        });
        Ok(())
    }

    pub fn register_agent(ctx: Context<RegisterAgent>, public_key: Vec<u8>) -> Result<()> {
        prepare_key(&public_key, &mut ctx.accounts.agent_key.load_init()?.prepared)?;
        ctx.accounts.agent.set_inner(Agent {
            owner: ctx.accounts.owner.key(),
            agent_key: ctx.accounts.agent_key.key(),
            status: AgentStatus::Pending,
            counter: 0,
            last_decision: [0; 32],
            bump: ctx.bumps.agent,
        });
        Ok(())
    }

    pub fn activate_agent(ctx: Context<ActivateAgent>, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Pending, GuardError::AgentNotPending);
        verify_signature(&ctx.accounts.owner_key.load()?.prepared, &activate_message(&agent_address), &signature)?;
        agent.status = AgentStatus::Active;
        emit!(AgentActivated { agent: agent_address, counter: agent.counter });
        Ok(())
    }

    pub fn record_step(ctx: Context<RecordStep>, decision_hash: [u8; 32], signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status != AgentStatus::Pending, GuardError::AgentPending);
        require!(agent.status == AgentStatus::Active, GuardError::AgentKilled);
        let counter = agent.counter + 1;
        let signed = step_message(&agent_address, counter, &decision_hash);
        verify_signature(&ctx.accounts.agent_key.load()?.prepared, &signed, &signature)?;
        agent.counter = counter;
        agent.last_decision = decision_hash;
        emit!(StepRecorded { agent: agent_address, counter, decision_hash });
        Ok(())
    }

    /// Records `size` decisions at once: one ML-DSA-44 signature over their Merkle root, built off-chain. The program
    /// never sees the decisions; the log keeps each one with its proof.
    pub fn record_batch(ctx: Context<RecordStep>, root: [u8; 32], size: u32, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentKilled);
        require!(size > 0, GuardError::EmptyBatch);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key.load()?.prepared, &batch_message(&agent_address, counter, &root, size), &signature)?;
        agent.counter = counter;
        agent.last_decision = root;
        emit!(BatchRecorded { agent: agent_address, counter, root, size });
        Ok(())
    }

    pub fn kill(ctx: Context<Kill>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Active, GuardError::AgentNotActive);
        agent.status = AgentStatus::Killed;
        emit!(AgentKilled { agent: agent_address, counter: agent.counter });
        Ok(())
    }

    pub fn resume(ctx: Context<Resume>, signature: Vec<u8>) -> Result<()> {
        let agent_address = ctx.accounts.agent.key();
        let agent = &mut ctx.accounts.agent;
        require!(agent.status == AgentStatus::Killed, GuardError::AgentNotKilled);
        let counter = agent.counter + 1;
        verify_signature(&ctx.accounts.agent_key.load()?.prepared, &resume_message(&agent_address, counter), &signature)?;
        agent.counter = counter;
        agent.status = AgentStatus::Active;
        emit!(AgentResumed { agent: agent_address, counter });
        Ok(())
    }
}

fn prepare_key(public_key: &[u8], prepared: &mut [u8; MLDSA_PREPARED_KEY_LEN]) -> Result<()> {
    let public_key = MldsaVerifyingKey::ref_from_bytes(public_key).map_err(|_| GuardError::InvalidPublicKey)?;
    let prepared = MldsaPreparedKey::mut_from_bytes(prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    public_key.prepare_into(prepared);
    Ok(())
}

fn verify_signature(prepared: &[u8; MLDSA_PREPARED_KEY_LEN], signed: &[u8], signature: &[u8]) -> Result<()> {
    let prepared = MldsaPreparedKey::ref_from_bytes(prepared).map_err(|_| GuardError::InvalidKeyAccount)?;
    let signature = Signature::ref_from_bytes(signature).map_err(|_| GuardError::InvalidSignature)?;
    prepared
        .verify_with_context(signed, MLDSA_CONTEXT, signature)
        .map_err(|_| error!(GuardError::VerifyFailed))
}

#[derive(Accounts)]
pub struct RegisterOwner<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Allocated by a preceding System Program `create_account`, like `RegisterAgent::agent_key`.
    #[account(zero)]
    pub owner_key: AccountLoader<'info, OwnerKey>,
    #[account(
        init,
        payer = owner,
        space = 8 + OwnerRecord::INIT_SPACE,
        seeds = [OWNER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub owner_record: Account<'info, OwnerRecord>,
    pub system_program: Program<'info, System>,
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

/// No wallet signer: the owner's ML-DSA-44 signature is the authorization, so anyone may pay the fee.
#[derive(Accounts)]
pub struct ActivateAgent<'info> {
    #[account(mut)]
    pub agent: Account<'info, Agent>,
    #[account(seeds = [OWNER_SEED, agent.owner.as_ref()], bump = owner_record.bump, has_one = owner_key)]
    pub owner_record: Account<'info, OwnerRecord>,
    pub owner_key: AccountLoader<'info, OwnerKey>,
}

/// Accounts of record_step and record_batch.
#[derive(Accounts)]
pub struct RecordStep<'info> {
    #[account(mut, has_one = agent_key)]
    pub agent: Account<'info, Agent>,
    pub agent_key: AccountLoader<'info, AgentKey>,
}

/// Needs only the owner's wallet, so the owner can stop the agent while its server is down or compromised.
#[derive(Accounts)]
pub struct Kill<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner)]
    pub agent: Account<'info, Agent>,
}

/// Needs both the owner's wallet and the agent's ML-DSA-44 signature: neither a compromised server nor a forged
/// Ed25519 signature resumes the agent alone.
#[derive(Accounts)]
pub struct Resume<'info> {
    pub owner: Signer<'info>,
    #[account(mut, has_one = owner, has_one = agent_key)]
    pub agent: Account<'info, Agent>,
    pub agent_key: AccountLoader<'info, AgentKey>,
}
