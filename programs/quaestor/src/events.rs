use anchor_lang::prelude::*;

#[event]
pub struct ProjectCreated {
    pub project: Pubkey,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub project_id: u64,
    pub root_budget: Pubkey,
}

#[event]
pub struct Deposited {
    pub project: Pubkey,
    pub from: Pubkey,
    pub amount: u64,
    pub root_allocated: u64,
}

#[event]
pub struct BudgetAllocated {
    pub project: Pubkey,
    pub parent: Pubkey,
    pub child: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
    pub depth: u8,
}

#[event]
pub struct Spent {
    pub project: Pubkey,
    pub budget: Pubkey,
    pub agent: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StatusChanged {
    pub project: Pubkey,
    pub budget: Pubkey,
    pub status: u8,
}

#[event]
pub struct Reclaimed {
    pub project: Pubkey,
    pub parent: Pubkey,
    pub child: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub project: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}
