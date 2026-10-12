pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP");

#[program]
pub mod quaestor {
    use super::*;

    /// Owner creates a project: initializes the Project, its vault (ATA of the Project PDA),
    /// and the root Budget (agent == owner, can_delegate = true).
    pub fn create_project(
        ctx: Context<CreateProject>,
        project_id: u64,
        label: [u8; 32],
        fee_payer: Pubkey,
    ) -> Result<()> {
        instructions::create_project::handle_create_project(ctx, project_id, label, fee_payer)
    }

    /// Anyone transfers tokens into the vault; the root budget's `allocated` grows.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handle_deposit(ctx, amount)
    }

    /// Parent (agent) or owner allocates a new child budget, reserving `amount` in the parent.
    #[allow(clippy::too_many_arguments)]
    pub fn allocate_child(
        ctx: Context<AllocateChild>,
        label: [u8; 32],
        amount: u64,
        per_tx_limit: Option<u64>,
        period_limit: Option<u64>,
        period_seconds: i64,
        expires_at: Option<i64>,
        can_delegate: bool,
        max_child_depth: u8,
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::allocate_child::handle_allocate_child(
            ctx,
            label,
            amount,
            per_tx_limit,
            period_limit,
            period_seconds,
            expires_at,
            can_delegate,
            max_child_depth,
            allowlist,
        )
    }

    /// Increase an existing child's allocation (reserves more in the parent).
    pub fn increase_allocation(ctx: Context<IncreaseAllocation>, amount: u64) -> Result<()> {
        instructions::increase_allocation::handle_increase_allocation(ctx, amount)
    }

    /// Agent spends from its budget; transfers vault -> recipient. Ancestor chain in remaining_accounts.
    pub fn spend<'info>(
        ctx: Context<'info, Spend<'info>>,
        amount: u64,
    ) -> Result<()> {
        instructions::spend::handle_spend(ctx, amount)
    }

    /// Owner freezes (true) or unfreezes (false) a budget.
    pub fn set_status(ctx: Context<SetStatus>, freeze: bool) -> Result<()> {
        instructions::set_status::handle_set_status(ctx, freeze)
    }

    /// An ancestor *agent* freezes (true) or unfreezes (false) a descendant budget.
    /// remaining_accounts = the budget's ancestor chain (child -> ... -> root).
    pub fn agent_set_status<'info>(
        ctx: Context<'info, AgentSetStatus<'info>>,
        freeze: bool,
    ) -> Result<()> {
        instructions::agent_set_status::handle_agent_set_status(ctx, freeze)
    }

    /// Owner permanently revokes a budget.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        instructions::revoke::handle_revoke(ctx)
    }

    /// Reclaim a revoked/expired child's unused funds back to its parent (bottom-up).
    /// remaining_accounts = the parent's own ancestor chain (to detect a revoked ancestor).
    pub fn reclaim<'info>(ctx: Context<'info, Reclaim<'info>>) -> Result<()> {
        instructions::reclaim::handle_reclaim(ctx)
    }

    /// Owner withdraws from the root's available balance.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handle_withdraw(ctx, amount)
    }
}
