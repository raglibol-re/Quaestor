use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{BUDGET_SEED, PROJECT_SEED};
use crate::error::QuaestorError;
use crate::events::Spent;
use crate::state::{Budget, Project};
use crate::utils::chain::walk_ancestors;

#[derive(Accounts)]
pub struct Spend<'info> {
    pub agent: Signer<'info>,

    #[account(has_one = vault, has_one = mint)]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        has_one = project,
        seeds = [BUDGET_SEED, project.key().as_ref(), agent.key().as_ref()],
        bump = budget.bump,
    )]
    pub budget: Account<'info, Budget>,

    pub mint: Account<'info, Mint>,

    #[account(mut, token::mint = mint)]
    pub recipient: Account<'info, TokenAccount>,

    #[account(mut, address = project.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    // remaining_accounts: ancestor chain child->...->root (len == budget.depth)
}

pub fn handle_spend<'info>(
    ctx: Context<'info, Spend<'info>>,
    amount: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(amount > 0, QuaestorError::InvalidAmount);

    // the node itself
    require!(ctx.accounts.budget.is_active(), QuaestorError::NotActive);
    require!(!ctx.accounts.budget.is_expired(now), QuaestorError::Expired);

    // verify the full ancestor chain is active and not expired
    let facts = walk_ancestors(
        ctx.accounts.budget.parent,
        ctx.accounts.budget.depth,
        &ctx.accounts.project.key(),
        ctx.remaining_accounts,
        ctx.program_id,
        now,
    )?;
    require!(facts.ancestors_all_active, QuaestorError::AncestorNotActive);

    // per-tx limit
    if let Some(limit) = ctx.accounts.budget.per_tx_limit {
        require!(amount <= limit, QuaestorError::PerTxLimitExceeded);
    }

    // rolling period limit (snap-to-now reset)
    ctx.accounts.budget.maybe_reset_period(now);
    if let Some(pl) = ctx.accounts.budget.period_limit {
        let projected = ctx
            .accounts
            .budget
            .period_spent
            .checked_add(amount)
            .ok_or(QuaestorError::MathOverflow)?;
        require!(projected <= pl, QuaestorError::PeriodLimitExceeded);
    }

    // available balance
    require!(
        amount <= ctx.accounts.budget.available()?,
        QuaestorError::InsufficientAvailable
    );

    // allowlist: match the recipient wallet (token account owner)
    require!(
        ctx.accounts.budget.allows(&ctx.accounts.recipient.owner),
        QuaestorError::RecipientNotAllowed
    );

    // transfer vault -> recipient, signed by the Project PDA
    let owner = ctx.accounts.project.owner;
    let pid = ctx.accounts.project.project_id.to_le_bytes();
    let pbump = ctx.accounts.project.bump;
    let seeds: &[&[u8]] = &[PROJECT_SEED, owner.as_ref(), &pid, &[pbump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.recipient.to_account_info(),
            authority: ctx.accounts.project.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi, amount)?;

    // accounting
    let project_key = ctx.accounts.project.key();
    let agent_key = ctx.accounts.agent.key();
    let recipient_key = ctx.accounts.recipient.key();
    let budget = &mut ctx.accounts.budget;
    budget.spent = budget
        .spent
        .checked_add(amount)
        .ok_or(QuaestorError::MathOverflow)?;
    if budget.period_limit.is_some() {
        budget.period_spent = budget
            .period_spent
            .checked_add(amount)
            .ok_or(QuaestorError::MathOverflow)?;
    }

    emit!(Spent {
        project: project_key,
        budget: budget.key(),
        agent: agent_key,
        recipient: recipient_key,
        amount,
    });
    Ok(())
}
