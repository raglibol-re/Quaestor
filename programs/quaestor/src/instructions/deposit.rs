use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::error::QuaestorError;
use crate::events::Deposited;
use crate::state::{Budget, Project};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(has_one = vault, has_one = mint)]
    pub project: Account<'info, Project>,

    #[account(mut, address = project.root_budget)]
    pub root_budget: Account<'info, Budget>,

    pub mint: Account<'info, Mint>,

    #[account(mut, token::mint = mint, token::authority = depositor)]
    pub from: Account<'info, TokenAccount>,

    #[account(mut, address = project.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, QuaestorError::InvalidAmount);

    let cpi = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;

    let project_key = ctx.accounts.project.key();
    let from_key = ctx.accounts.from.key();
    let root = &mut ctx.accounts.root_budget;
    root.allocated = root
        .allocated
        .checked_add(amount)
        .ok_or(QuaestorError::MathOverflow)?;

    emit!(Deposited {
        project: project_key,
        from: from_key,
        amount,
        root_allocated: root.allocated,
    });
    Ok(())
}
