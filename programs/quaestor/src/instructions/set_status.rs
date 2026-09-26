use anchor_lang::prelude::*;

use crate::error::QuaestorError;
use crate::events::StatusChanged;
use crate::state::{Budget, BudgetStatus, Project};

#[derive(Accounts)]
pub struct SetStatus<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner)]
    pub project: Account<'info, Project>,

    #[account(mut, has_one = project)]
    pub budget: Account<'info, Budget>,
}

/// Owner freezes (`freeze = true`) or unfreezes (`freeze = false`) a budget.
/// A revoked budget is terminal and cannot be changed.
pub fn handle_set_status(ctx: Context<SetStatus>, freeze: bool) -> Result<()> {
    let project_key = ctx.accounts.project.key();
    let budget = &mut ctx.accounts.budget;
    require!(
        budget.status != BudgetStatus::Revoked,
        QuaestorError::AlreadyRevoked
    );
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
