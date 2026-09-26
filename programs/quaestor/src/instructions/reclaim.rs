use anchor_lang::prelude::*;

use crate::error::QuaestorError;
use crate::events::Reclaimed;
use crate::state::{Budget, BudgetStatus, Project};
use crate::utils::chain::walk_ancestors;

#[derive(Accounts)]
pub struct Reclaim<'info> {
    /// Must be project.owner OR parent.agent.
    pub authority: Signer<'info>,

    pub project: Account<'info, Project>,

    #[account(mut, has_one = project)]
    pub parent: Account<'info, Budget>,

    #[account(
        mut,
        has_one = project,
        constraint = child.parent == Some(parent.key()) @ QuaestorError::WrongParent
    )]
    pub child: Account<'info, Budget>,
    // remaining_accounts: the PARENT's ancestor chain (len == parent.depth),
    // used to detect a revoked ancestor above the parent.
}

pub fn handle_reclaim<'info>(ctx: Context<'info, Reclaim<'info>>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.project.owner || authority == ctx.accounts.parent.agent,
        QuaestorError::Unauthorized
    );

    // detect a revoked ancestor at or above the parent
    let facts = walk_ancestors(
        ctx.accounts.parent.parent,
        ctx.accounts.parent.depth,
        &ctx.accounts.project.key(),
        ctx.remaining_accounts,
        ctx.program_id,
        now,
    )?;
    let revoked_above =
        facts.any_revoked || ctx.accounts.parent.status == BudgetStatus::Revoked;

    // A child is reclaimable if it is itself revoked/expired, or any ancestor is revoked (P0-1 fix).
    let child_reclaimable = ctx.accounts.child.status == BudgetStatus::Revoked
        || ctx.accounts.child.is_expired(now)
        || revoked_above;
    require!(child_reclaimable, QuaestorError::NotReclaimable);

    // bottom-up only
    require!(
        ctx.accounts.child.reserved_for_children == 0,
        QuaestorError::HasReservedChildren
    );

    let unused = ctx
        .accounts
        .child
        .allocated
        .checked_sub(ctx.accounts.child.spent)
        .ok_or(QuaestorError::MathOverflow)?;

    let project_key = ctx.accounts.project.key();
    let parent_key = ctx.accounts.parent.key();
    let child_key = ctx.accounts.child.key();

    let child = &mut ctx.accounts.child;
    child.allocated = child.spent;
    child.status = BudgetStatus::Revoked; // finalize; unused funds returned to parent

    let parent = &mut ctx.accounts.parent;
    parent.reserved_for_children = parent
        .reserved_for_children
        .checked_sub(unused)
        .ok_or(QuaestorError::MathOverflow)?;

    emit!(Reclaimed {
        project: project_key,
        parent: parent_key,
        child: child_key,
        amount: unused,
    });
    Ok(())
}
