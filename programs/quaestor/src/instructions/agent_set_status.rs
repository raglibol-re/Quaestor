use anchor_lang::prelude::*;

use crate::constants::BUDGET_SEED;
use crate::error::QuaestorError;
use crate::events::StatusChanged;
use crate::state::{Budget, BudgetStatus, Project};
use crate::utils::chain::walk_ancestors;

#[derive(Accounts)]
pub struct AgentSetStatus<'info> {
    /// An ancestor *agent* of `budget` (verified via the ancestor-chain walk).
    pub authority: Signer<'info>,

    pub project: Account<'info, Project>,

    #[account(
        mut,
        has_one = project,
        seeds = [BUDGET_SEED, project.key().as_ref(), budget.agent.as_ref()],
        bump = budget.bump,
    )]
    pub budget: Account<'info, Budget>,
    // remaining_accounts: the budget's ancestor chain, child -> ... -> root (len == budget.depth)
}

/// Freeze (`freeze = true`) or unfreeze (`freeze = false`) a budget by an *ancestor agent*.
///
/// Authorization: the signer must own one of `budget`'s ancestors (any level up to the root).
/// This lets a parent/grandparent agent stop a descendant subtree — complementing the owner-only
/// `set_status`. Revoke remains owner-only (terminal/destructive). A revoked budget is unchanged.
pub fn handle_agent_set_status<'info>(
    ctx: Context<'info, AgentSetStatus<'info>>,
    freeze: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(
        ctx.accounts.budget.status != BudgetStatus::Revoked,
        QuaestorError::AlreadyRevoked
    );

    // Walk the full ancestor chain (forgery-proof) and require the signer to be one of the
    // ancestor agents. The chain is validated regardless of ancestor statuses — a frozen ancestor
    // can still act to (un)freeze a descendant.
    let facts = walk_ancestors(
        ctx.accounts.budget.parent,
        ctx.accounts.budget.depth,
        &ctx.accounts.project.key(),
        ctx.remaining_accounts,
        ctx.program_id,
        now,
        Some(ctx.accounts.authority.key()),
    )?;
    require!(
        facts.authority_is_ancestor_agent,
        QuaestorError::NotAnAncestor
    );

    let project_key = ctx.accounts.project.key();
    let budget = &mut ctx.accounts.budget;
    budget.status = if freeze {
        BudgetStatus::Frozen
    } else {
        BudgetStatus::Active
    };
    emit!(StatusChanged {
        project: project_key,
        budget: budget.key(),
        status: budget.status.code(),
    });
    Ok(())
}
