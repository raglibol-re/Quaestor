use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

use crate::constants::{BUDGET_SEED, LABEL_LEN, MAX_ALLOWLIST, MAX_DEPTH, PROJECT_SEED};
use crate::events::ProjectCreated;
use crate::state::{Budget, BudgetStatus, Project};

#[derive(Accounts)]
#[instruction(project_id: u64)]
pub struct CreateProject<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Project::INIT_SPACE,
        seeds = [PROJECT_SEED, owner.key().as_ref(), &project_id.to_le_bytes()],
        bump
    )]
    pub project: Account<'info, Project>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        associated_token::mint = mint,
        associated_token::authority = project,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        space = 8 + Budget::INIT_SPACE,
        seeds = [BUDGET_SEED, project.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub root_budget: Account<'info, Budget>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handle_create_project(
    ctx: Context<CreateProject>,
    project_id: u64,
    label: [u8; LABEL_LEN],
    fee_payer: Pubkey,
) -> Result<()> {
    let owner_key = ctx.accounts.owner.key();
    let mint_key = ctx.accounts.mint.key();
    let vault_key = ctx.accounts.vault.key();
    let project_key = ctx.accounts.project.key();
    let root_key = ctx.accounts.root_budget.key();
    let project_bump = ctx.bumps.project;
    let root_bump = ctx.bumps.root_budget;

    let project = &mut ctx.accounts.project;
    project.owner = owner_key;
    project.project_id = project_id;
    project.mint = mint_key;
    project.vault = vault_key;
    project.root_budget = root_key;
    project.fee_payer = fee_payer;
    project.label = label;
    project.bump = project_bump;

    let root = &mut ctx.accounts.root_budget;
    root.project = project_key;
    root.parent = None;
    root.agent = owner_key;
    root.label = label;
    root.depth = 0;
    root.can_delegate = true;
    root.max_child_depth = MAX_DEPTH;
    root.allocated = 0;
    root.spent = 0;
    root.reserved_for_children = 0;
    root.per_tx_limit = None;
    root.period_limit = None;
    root.period_seconds = 0;
    root.period_start = 0;
    root.period_spent = 0;
    root.expires_at = None;
    root.status = BudgetStatus::Active;
    root.allowlist = [Pubkey::default(); MAX_ALLOWLIST];
    root.allowlist_len = 0;
    root.children_count = 0;
    root.bump = root_bump;

    emit!(ProjectCreated {
        project: project_key,
        owner: owner_key,
        mint: mint_key,
        project_id,
        root_budget: root_key,
    });
    Ok(())
}
