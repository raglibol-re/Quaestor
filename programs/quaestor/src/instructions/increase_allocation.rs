use anchor_lang::prelude::*;

use crate::error::QuaestorError;
use crate::events::BudgetAllocated;
use crate::state::{Budget, Project};

#[derive(Accounts)]
pub struct IncreaseAllocation<'info> {
    /// Must be parent.agent OR project.owner.
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
}

pub fn handle_increase_allocation(ctx: Context<IncreaseAllocation>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let authority = ctx.accounts.authority.key();

    require!(
        authority == ctx.accounts.parent.agent || authority == ctx.accounts.project.owner,
        QuaestorError::Unauthorized
    );
    require!(ctx.accounts.parent.is_active(), QuaestorError::NotActive);
    require!(!ctx.accounts.parent.is_expired(now), QuaestorError::Expired);
    require!(ctx.accounts.parent.can_delegate, QuaestorError::CannotDelegate);
    require!(amount > 0, QuaestorError::InvalidAmount);
    require!(
        amount <= ctx.accounts.parent.available()?,
        QuaestorError::InsufficientAvailable
    );

    let project_key = ctx.accounts.project.key();
    let parent_key = ctx.accounts.parent.key();
    let child_key = ctx.accounts.child.key();
    let child_agent = ctx.accounts.child.agent;
    let child_depth = ctx.accounts.child.depth;

    let child = &mut ctx.accounts.child;
    child.allocated = child
        .allocated
        .checked_add(amount)
        .ok_or(QuaestorError::MathOverflow)?;

    let parent = &mut ctx.accounts.parent;
    parent.reserved_for_children = parent
        .reserved_for_children
        .checked_add(amount)
        .ok_or(QuaestorError::MathOverflow)?;

    emit!(BudgetAllocated {
        project: project_key,
        parent: parent_key,
        child: child_key,
        agent: child_agent,
        amount,
        depth: child_depth,
    });
    Ok(())
}
