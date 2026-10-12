use anchor_lang::prelude::*;

use crate::constants::BUDGET_SEED;
use crate::error::QuaestorError;
use crate::state::{Budget, BudgetStatus};

/// Facts gathered while walking a node's ancestor chain.
pub struct ChainFacts {
    /// True iff every ancestor is Active and not expired.
    pub ancestors_all_active: bool,
    /// True iff any ancestor is Revoked.
    pub any_revoked: bool,
    /// True iff `find_agent` was `Some(k)` and some ancestor's `agent == k`.
    /// Used to authorize an ancestor *agent* (not just the owner) to freeze a descendant.
    pub authority_is_ancestor_agent: bool,
}

/// Walk the ancestor chain of a node.
///
/// `start_parent` is the node's `parent` field, `node_depth` is the node's depth.
/// `remaining` must be exactly the ancestors ordered child->...->root, length == node_depth.
///
/// Verifies, for each ancestor: it is the pubkey the child claims, it is a program-owned
/// Budget of the same project, its PDA re-derives from (project, agent, bump), and its depth
/// strictly decreases. Then requires the chain terminates at a real root (parent == None) with
/// exactly `node_depth` accounts consumed. This makes a forged / short / padded / cross-project /
/// cyclic chain impossible.
pub fn walk_ancestors<'info>(
    start_parent: Option<Pubkey>,
    node_depth: u8,
    project: &Pubkey,
    remaining: &'info [AccountInfo<'info>],
    program_id: &Pubkey,
    now: i64,
    find_agent: Option<Pubkey>,
) -> Result<ChainFacts> {
    let mut expected_parent = start_parent;
    let mut all_active = true;
    let mut any_revoked = false;
    let mut authority_is_ancestor_agent = false;
    let mut i: usize = 0;

    while let Some(pk) = expected_parent {
        require!(i < remaining.len(), QuaestorError::ChainLengthMismatch);
        let acc = &remaining[i];

        // (1) must be exactly the pubkey the child claims as parent
        require_keys_eq!(*acc.key, pk, QuaestorError::InvalidChain);
        // (2)+(3) owner == program AND discriminator == Budget
        let anc: Account<Budget> = Account::try_from(acc)?;
        // (4) same project
        require_keys_eq!(anc.project, *project, QuaestorError::WrongProject);
        // (5) re-derive the PDA from stored agent + bump (defense in depth)
        let derived = Pubkey::create_program_address(
            &[BUDGET_SEED, project.as_ref(), anc.agent.as_ref(), &[anc.bump]],
            program_id,
        )
        .map_err(|_| error!(QuaestorError::InvalidPda))?;
        require_keys_eq!(derived, *acc.key, QuaestorError::InvalidPda);
        // (6) strictly decreasing depth => no cycles / repeats
        let expected_depth = (node_depth as usize)
            .checked_sub(i + 1)
            .ok_or(QuaestorError::ChainLengthMismatch)?;
        require!(
            anc.depth as usize == expected_depth,
            QuaestorError::InvalidChain
        );

        match anc.status {
            BudgetStatus::Revoked => {
                any_revoked = true;
                all_active = false;
            }
            BudgetStatus::Frozen => all_active = false,
            BudgetStatus::Active => {}
        }
        if anc.is_expired(now) {
            all_active = false;
        }
        if matches!(find_agent, Some(k) if anc.agent == k) {
            authority_is_ancestor_agent = true;
        }

        expected_parent = anc.parent;
        i += 1;
    }

    // terminal conditions: reached a real root, consumed exactly node_depth accounts
    require!(expected_parent.is_none(), QuaestorError::InvalidChain);
    require!(i == remaining.len(), QuaestorError::ChainLengthMismatch);
    require!(i == node_depth as usize, QuaestorError::ChainLengthMismatch);

    Ok(ChainFacts {
        ancestors_all_active: all_active,
        any_revoked,
        authority_is_ancestor_agent,
    })
}
