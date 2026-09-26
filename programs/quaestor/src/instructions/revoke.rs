use anchor_lang::prelude::*;

use crate::error::QuaestorError;
use crate::events::StatusChanged;
use crate::state::{Budget, BudgetStatus, Project};

#[derive(Accounts)]
pub struct Revoke<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner)]
    pub project: Account<'info, Project>,

    #[account(mut, has_one = project)]
    pub budget: Account<'info, Budget>,
}

/// Owner permanently revokes a budget (terminal).
pub fn handle_revoke(ctx: Context<Revoke>) -> Result<()> {
    let project_key = ctx.accounts.project.key();
    let budget = &mut ctx.accounts.budget;
    require!(
        budget.status != BudgetStatus::Revoked,
        QuaestorError::AlreadyRevoked
    );
    budget.status = BudgetStatus::Revoked;
    emit!(StatusChanged {
        project: project_key,
        budget: budget.key(),
        status: budget.status.code(),
    });
    Ok(())
}
