use anchor_lang::prelude::*;

use crate::constants::{LABEL_LEN, MAX_ALLOWLIST};
use crate::error::QuaestorError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BudgetStatus {
    Active,
    Frozen,
    Revoked,
}

impl BudgetStatus {
    pub fn code(&self) -> u8 {
        match self {
            BudgetStatus::Active => 0,
            BudgetStatus::Frozen => 1,
            BudgetStatus::Revoked => 2,
        }
    }
}

/// A budget node in the tree. Pure accounting; money lives in the project vault.
/// PDA: ["budget", project, agent]  (one node per agent key per project).
#[account]
#[derive(InitSpace)]
pub struct Budget {
    pub project: Pubkey,
    /// None == root.
    pub parent: Option<Pubkey>,
    /// The key that authorizes `spend` and `allocate_child` for this node.
    pub agent: Pubkey,
    pub label: [u8; LABEL_LEN],
    /// Root = 0.
    pub depth: u8,
    /// Whether this node may create children.
    pub can_delegate: bool,
    /// Maximum absolute depth allowed anywhere in this node's subtree.
    pub max_child_depth: u8,
    /// Total allocated to this node.
    pub allocated: u64,
    /// Spent by this node itself.
    pub spent: u64,
    /// Reserved (allocated out) to children.
    pub reserved_for_children: u64,
    /// None == no per-transaction cap.
    pub per_tx_limit: Option<u64>,
    /// None == no rolling-period cap.
    pub period_limit: Option<u64>,
    /// Length of the rolling period in seconds (<= 0 means no period cap).
    pub period_seconds: i64,
    /// Start of the current rolling window (unix seconds).
    pub period_start: i64,
    /// Spent within the current rolling window.
    pub period_spent: u64,
    /// None == never expires.
    pub expires_at: Option<i64>,
    pub status: BudgetStatus,
    /// Allowed recipient wallets. `allowlist_len == 0` means any recipient allowed.
    pub allowlist: [Pubkey; MAX_ALLOWLIST],
    pub allowlist_len: u8,
    pub children_count: u16,
    pub bump: u8,
}

impl Budget {
    /// available = allocated - spent - reserved_for_children  (always >= 0 under the invariant).
    pub fn available(&self) -> Result<u64> {
        let a = self
            .allocated
            .checked_sub(self.spent)
            .ok_or(QuaestorError::MathOverflow)?;
        a.checked_sub(self.reserved_for_children)
            .ok_or_else(|| QuaestorError::MathOverflow.into())
    }

    pub fn is_active(&self) -> bool {
        self.status == BudgetStatus::Active
    }

    pub fn is_expired(&self, now: i64) -> bool {
        matches!(self.expires_at, Some(e) if now >= e)
    }

    /// A node can currently be used only if it is Active and not expired.
    pub fn is_usable(&self, now: i64) -> bool {
        self.is_active() && !self.is_expired(now)
    }

    /// Snap-to-now period reset: if the window has elapsed, start a fresh one.
    /// This anchors each window to the first spend after the previous one closed,
    /// which provably avoids the boundary-burst 2x exploit.
    pub fn maybe_reset_period(&mut self, now: i64) {
        if self.period_seconds > 0 && self.period_limit.is_some() {
            let elapsed = now >= self.period_start.saturating_add(self.period_seconds);
            if elapsed {
                self.period_start = now;
                self.period_spent = 0;
            }
        }
    }

    pub fn allowlist_slice(&self) -> &[Pubkey] {
        &self.allowlist[..self.allowlist_len as usize]
    }

    /// True if `who` is allowed (empty allowlist == everyone allowed).
    pub fn allows(&self, who: &Pubkey) -> bool {
        self.allowlist_len == 0 || self.allowlist_slice().contains(who)
    }
}
