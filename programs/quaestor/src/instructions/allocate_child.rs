use anchor_lang::prelude::*;

use crate::constants::{BUDGET_SEED, LABEL_LEN, MAX_ALLOWLIST, MAX_DEPTH};
use crate::error::QuaestorError;
use crate::events::BudgetAllocated;
use crate::state::{Budget, BudgetStatus, Project};
use crate::utils::math::{expiry_within, limit_within};

#[derive(Accounts)]
pub struct AllocateChild<'info> {
    /// Must be parent.agent OR project.owner (checked in handler).
    pub authority: Signer<'info>,

    /// Relayer that pays rent for the new child account (needs no authority).
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    pub project: Account<'info, Project>,

    #[account(mut, has_one = project)]
    pub parent: Account<'info, Budget>,

    /// CHECK: only used as a PDA seed and stored as the child's agent key.
    pub child_agent: UncheckedAccount<'info>,

    #[account(
        init,
        payer = fee_payer,
        space = 8 + Budget::INIT_SPACE,
        seeds = [BUDGET_SEED, project.key().as_ref(), child_agent.key().as_ref()],
        bump
    )]
    pub child: Account<'info, Budget>,

    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handle_allocate_child(
    ctx: Context<AllocateChild>,
    label: [u8; LABEL_LEN],
    amount: u64,
    per_tx_limit: Option<u64>,
    period_limit: Option<u64>,
    period_seconds: i64,
    expires_at: Option<i64>,
    can_delegate: bool,
    max_child_depth: u8,
    allowlist: Vec<Pubkey>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let authority = ctx.accounts.authority.key();

    // authority = parent.agent OR owner
    require!(
        authority == ctx.accounts.parent.agent || authority == ctx.accounts.project.owner,
        QuaestorError::Unauthorized
    );

    // parent must be usable and able to delegate
    require!(ctx.accounts.parent.is_active(), QuaestorError::NotActive);
    require!(!ctx.accounts.parent.is_expired(now), QuaestorError::Expired);
    require!(ctx.accounts.parent.can_delegate, QuaestorError::CannotDelegate);

    // depth checks (global cap + per-branch cap)
    let new_depth = ctx
        .accounts
        .parent
        .depth
        .checked_add(1)
        .ok_or(QuaestorError::MathOverflow)?;
    require!(new_depth <= MAX_DEPTH, QuaestorError::MaxDepthExceeded);
    require!(
        new_depth <= ctx.accounts.parent.max_child_depth,
        QuaestorError::MaxChildDepthExceeded
    );
    require!(
        max_child_depth <= ctx.accounts.parent.max_child_depth,
        QuaestorError::MaxChildDepthExceeded
    );

    require!(amount > 0, QuaestorError::InvalidAmount);
    require!(
        amount <= ctx.accounts.parent.available()?,
        QuaestorError::InsufficientAvailable
    );

    // limits must be tighter or equal to the parent's
    require!(
        limit_within(per_tx_limit, ctx.accounts.parent.per_tx_limit),
        QuaestorError::LimitTooLoose
    );
    require!(
        limit_within(period_limit, ctx.accounts.parent.period_limit),
        QuaestorError::LimitTooLoose
    );
    require!(
        expiry_within(expires_at, ctx.accounts.parent.expires_at),
        QuaestorError::ExpiryTooLate
    );

    // allowlist: capacity + subset of parent's (if parent has one)
    require!(allowlist.len() <= MAX_ALLOWLIST, QuaestorError::AllowlistFull);
    if ctx.accounts.parent.allowlist_len > 0 {
        for a in allowlist.iter() {
            require!(ctx.accounts.parent.allows(a), QuaestorError::AllowlistNotSubset);
        }
    }
    let mut fixed = [Pubkey::default(); MAX_ALLOWLIST];
    for (i, a) in allowlist.iter().enumerate() {
        fixed[i] = *a;
    }
    let allowlist_len = allowlist.len() as u8;

    let project_key = ctx.accounts.project.key();
    let parent_key = ctx.accounts.parent.key();
    let child_agent = ctx.accounts.child_agent.key();
    let child_key = ctx.accounts.child.key();
    let child_bump = ctx.bumps.child;

    // write the child node
    let child = &mut ctx.accounts.child;
    child.project = project_key;
    child.parent = Some(parent_key);
    child.agent = child_agent;
    child.label = label;
    child.depth = new_depth;
    child.can_delegate = can_delegate;
    child.max_child_depth = max_child_depth;
    child.allocated = amount;
    child.spent = 0;
    child.reserved_for_children = 0;
    child.per_tx_limit = per_tx_limit;
    child.period_limit = period_limit;
    child.period_seconds = period_seconds;
    child.period_start = now;
    child.period_spent = 0;
    child.expires_at = expires_at;
    child.status = BudgetStatus::Active;
    child.allowlist = fixed;
    child.allowlist_len = allowlist_len;
    child.children_count = 0;
    child.bump = child_bump;

    // reserve the amount in the parent
    let parent = &mut ctx.accounts.parent;
    parent.reserved_for_children = parent
        .reserved_for_children
        .checked_add(amount)
        .ok_or(QuaestorError::MathOverflow)?;
    parent.children_count = parent
        .children_count
        .checked_add(1)
        .ok_or(QuaestorError::MathOverflow)?;

    emit!(BudgetAllocated {
        project: project_key,
        parent: parent_key,
        child: child_key,
        agent: child_agent,
        amount,
        depth: new_depth,
    });
    Ok(())
}
