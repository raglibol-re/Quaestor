use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::PROJECT_SEED;
use crate::error::QuaestorError;
use crate::events::Withdrawn;
use crate::state::{Budget, Project};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,

    #[account(has_one = owner, has_one = vault, has_one = mint)]
    pub project: Account<'info, Project>,

    #[account(mut, address = project.root_budget)]
    pub root_budget: Account<'info, Budget>,

    pub mint: Account<'info, Mint>,

    #[account(mut, token::mint = mint)]
    pub to: Account<'info, TokenAccount>,

    #[account(mut, address = project.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, QuaestorError::InvalidAmount);
    require!(
        amount <= ctx.accounts.root_budget.available()?,
        QuaestorError::InsufficientAvailable
    );

    let owner = ctx.accounts.project.owner;
    let pid = ctx.accounts.project.project_id.to_le_bytes();
    let pbump = ctx.accounts.project.bump;
    let seeds: &[&[u8]] = &[PROJECT_SEED, owner.as_ref(), &pid, &[pbump]];
    let signer: &[&[&[u8]]] = &[seeds];
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.project.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi, amount)?;

    let project_key = ctx.accounts.project.key();
    let to_key = ctx.accounts.to.key();
    let root = &mut ctx.accounts.root_budget;
    root.allocated = root
        .allocated
        .checked_sub(amount)
        .ok_or(QuaestorError::MathOverflow)?;

    emit!(Withdrawn {
        project: project_key,
        to: to_key,
        amount,
    });
    Ok(())
}
