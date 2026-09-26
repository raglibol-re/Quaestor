use anchor_lang::prelude::*;

use crate::constants::LABEL_LEN;

/// A funding project. Owns one vault (token account) and a root budget.
/// PDA: ["project", owner, project_id_le].
#[account]
#[derive(InitSpace)]
pub struct Project {
    /// Human owner. Has override rights over the whole tree.
    pub owner: Pubkey,
    /// Caller-chosen id, unique per owner.
    pub project_id: u64,
    /// USDC (or test) mint used by this project.
    pub mint: Pubkey,
    /// Vault token account (ATA of this Project PDA for `mint`).
    pub vault: Pubkey,
    /// The root Budget PDA (agent == owner).
    pub root_budget: Pubkey,
    /// Relayer that pays fees/rent so agents need no SOL. Never an authority.
    pub fee_payer: Pubkey,
    /// Human-readable label.
    pub label: [u8; LABEL_LEN],
    pub bump: u8,
}
