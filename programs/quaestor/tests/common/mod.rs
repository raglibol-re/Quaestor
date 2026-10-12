#![allow(dead_code, unused_imports)]
//! Shared test harness for Quaestor LiteSVM integration tests.

use anchor_lang::{
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program_pack::Pack,
        system_instruction, system_program,
    },
    AccountDeserialize, InstructionData, ToAccountMetas,
};
pub use anchor_lang::prelude::Pubkey;
use anchor_lang::solana_program::clock::Clock;
use anchor_lang::Id;
use anchor_spl::associated_token::{self, AssociatedToken};
use anchor_spl::token::spl_token; // = spl_token_interface
use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub use quaestor::state::{Budget, BudgetStatus, Project};

pub const USDC_DECIMALS: u8 = 6;
/// 1 USDC in base units.
pub const USDC: u64 = 1_000_000;

pub fn pid() -> Pubkey {
    quaestor::ID
}

pub fn label(s: &str) -> [u8; 32] {
    let mut out = [0u8; 32];
    let b = s.as_bytes();
    let n = b.len().min(32);
    out[..n].copy_from_slice(&b[..n]);
    out
}

pub struct Env {
    pub svm: LiteSVM,
    /// Relayer/funder: pays fees + rent in tests.
    pub payer: Keypair,
    pub mint: Pubkey,
    pub mint_authority: Keypair,
}

pub fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let so = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/quaestor.so"));
    svm.add_program(quaestor::ID, so).unwrap();

    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 1_000_000_000_000).unwrap();
    let mint_authority = Keypair::new();
    svm.airdrop(&mint_authority.pubkey(), 1_000_000_000).unwrap();
    let mint = create_mint(&mut svm, &payer, &mint_authority.pubkey());

    Env {
        svm,
        payer,
        mint,
        mint_authority,
    }
}

/// A ready-to-use project: env + owner + created project, optionally funded.
pub struct Ctx {
    pub env: Env,
    pub owner: Keypair,
    pub project: Pubkey,
    pub vault: Pubkey,
    pub root_budget: Pubkey,
}

/// Create env + owner + project (id 1), deposit `deposit_amount` into the vault.
pub fn bootstrap(deposit_amount: u64) -> Ctx {
    let mut env = setup();
    let owner = Keypair::new();
    env.svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    let (ix, h) = ix_create_project(&owner.pubkey(), &env.mint, 1, label("proj"), &env.payer.pubkey());
    send(&mut env.svm, &owner.pubkey(), &[ix], &[&owner]).expect("create_project");

    if deposit_amount > 0 {
        let owner_ata = create_token_account(&mut env.svm, &env.payer, &env.mint, &owner.pubkey());
        mint_to(&mut env.svm, &env.payer, &env.mint, &owner_ata, &env.mint_authority, deposit_amount);
        let ix = ix_deposit(&owner.pubkey(), &h.project, &h.root_budget, &env.mint, &owner_ata, &h.vault, deposit_amount);
        send(&mut env.svm, &owner.pubkey(), &[ix], &[&owner]).expect("deposit");
    }

    Ctx {
        env,
        owner,
        project: h.project,
        vault: h.vault,
        root_budget: h.root_budget,
    }
}

// ---------- signing / sending ----------

pub fn send(
    svm: &mut LiteSVM,
    fee_payer: &Pubkey,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> TransactionResult {
    // Advance the blockhash so otherwise-identical transactions get distinct signatures
    // (LiteSVM rejects duplicates with AlreadyProcessed).
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(fee_payer), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx)
}

pub fn keypairs() -> Keypair {
    Keypair::new()
}

// ---------- SPL token helpers ----------

pub fn create_mint(svm: &mut LiteSVM, payer: &Keypair, mint_authority: &Pubkey) -> Pubkey {
    let mint = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let create = system_instruction::create_account(
        &payer.pubkey(),
        &mint.pubkey(),
        rent,
        spl_token::state::Mint::LEN as u64,
        &spl_token::ID,
    );
    let init =
        spl_token::instruction::initialize_mint2(&spl_token::ID, &mint.pubkey(), mint_authority, None, USDC_DECIMALS)
            .unwrap();
    send(svm, &payer.pubkey(), &[create, init], &[payer, &mint]).expect("create_mint");
    mint.pubkey()
}

/// Create a plain SPL token account owned by `owner`, return its address.
pub fn create_token_account(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey, owner: &Pubkey) -> Pubkey {
    let acc = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Account::LEN);
    let create = system_instruction::create_account(
        &payer.pubkey(),
        &acc.pubkey(),
        rent,
        spl_token::state::Account::LEN as u64,
        &spl_token::ID,
    );
    let init =
        spl_token::instruction::initialize_account3(&spl_token::ID, &acc.pubkey(), mint, owner).unwrap();
    send(svm, &payer.pubkey(), &[create, init], &[payer, &acc]).expect("create_token_account");
    acc.pubkey()
}

pub fn mint_to(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey, dest: &Pubkey, authority: &Keypair, amount: u64) {
    let ix = spl_token::instruction::mint_to(&spl_token::ID, mint, dest, &authority.pubkey(), &[], amount).unwrap();
    send(svm, &payer.pubkey(), &[ix], &[payer, authority]).expect("mint_to");
}

pub fn token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let acc = svm.get_account(token_account).expect("token account missing");
    let state = spl_token::state::Account::unpack(&acc.data).expect("unpack token account");
    state.amount
}

// ---------- PDAs ----------

pub fn project_pda(owner: &Pubkey, project_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[quaestor::constants::PROJECT_SEED, owner.as_ref(), &project_id.to_le_bytes()],
        &quaestor::ID,
    )
    .0
}

pub fn budget_pda(project: &Pubkey, agent: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[quaestor::constants::BUDGET_SEED, project.as_ref(), agent.as_ref()],
        &quaestor::ID,
    )
    .0
}

// ---------- account fetch ----------

pub fn fetch_budget(svm: &LiteSVM, key: &Pubkey) -> Budget {
    let acc = svm.get_account(key).expect("budget account missing");
    Budget::try_deserialize(&mut &acc.data[..]).expect("deser budget")
}

pub fn fetch_project(svm: &LiteSVM, key: &Pubkey) -> Project {
    let acc = svm.get_account(key).expect("project account missing");
    Project::try_deserialize(&mut &acc.data[..]).expect("deser project")
}

pub fn available(b: &Budget) -> u64 {
    b.allocated - b.spent - b.reserved_for_children
}

// ---------- clock control ----------

pub fn now(svm: &LiteSVM) -> i64 {
    svm.get_sysvar::<Clock>().unix_timestamp
}

pub fn set_time(svm: &mut LiteSVM, unix: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = unix;
    svm.set_sysvar::<Clock>(&clock);
}

pub fn advance_time(svm: &mut LiteSVM, secs: i64) {
    let t = now(svm);
    set_time(svm, t + secs);
}

// ---------- ancestor chain metas ----------

/// Read-only account metas for the ancestor chain of `budget` (parent -> ... -> root).
pub fn ancestor_metas(svm: &LiteSVM, budget: &Pubkey) -> Vec<AccountMeta> {
    let mut metas = Vec::new();
    let mut cur = fetch_budget(svm, budget);
    while let Some(parent) = cur.parent {
        metas.push(AccountMeta::new_readonly(parent, false));
        cur = fetch_budget(svm, &parent);
    }
    metas
}

// ---------- instruction builders ----------

pub struct ProjectHandles {
    pub project: Pubkey,
    pub vault: Pubkey,
    pub root_budget: Pubkey,
}

pub fn ix_create_project(
    owner: &Pubkey,
    mint: &Pubkey,
    project_id: u64,
    lbl: [u8; 32],
    fee_payer: &Pubkey,
) -> (Instruction, ProjectHandles) {
    let project = project_pda(owner, project_id);
    let root_budget = budget_pda(&project, owner);
    let vault = associated_token::get_associated_token_address(&project, mint);
    let accts = quaestor::accounts::CreateProject {
        owner: *owner,
        project,
        mint: *mint,
        vault,
        root_budget,
        system_program: system_program::ID,
        token_program: spl_token::ID,
        associated_token_program: AssociatedToken::id(),
    };
    let data = quaestor::instruction::CreateProject {
        project_id,
        label: lbl,
        fee_payer: *fee_payer,
    };
    let ix = Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: data.data(),
    };
    (
        ix,
        ProjectHandles {
            project,
            vault,
            root_budget,
        },
    )
}

pub fn ix_deposit(
    depositor: &Pubkey,
    project: &Pubkey,
    root_budget: &Pubkey,
    mint: &Pubkey,
    from: &Pubkey,
    vault: &Pubkey,
    amount: u64,
) -> Instruction {
    let accts = quaestor::accounts::Deposit {
        depositor: *depositor,
        project: *project,
        root_budget: *root_budget,
        mint: *mint,
        from: *from,
        vault: *vault,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: quaestor::instruction::Deposit { amount }.data(),
    }
}

#[allow(clippy::too_many_arguments)]
pub fn ix_allocate_child(
    authority: &Pubkey,
    fee_payer: &Pubkey,
    project: &Pubkey,
    parent: &Pubkey,
    child_agent: &Pubkey,
    lbl: [u8; 32],
    amount: u64,
    per_tx_limit: Option<u64>,
    period_limit: Option<u64>,
    period_seconds: i64,
    expires_at: Option<i64>,
    can_delegate: bool,
    max_child_depth: u8,
    allowlist: Vec<Pubkey>,
) -> (Instruction, Pubkey) {
    let child = budget_pda(project, child_agent);
    let accts = quaestor::accounts::AllocateChild {
        authority: *authority,
        fee_payer: *fee_payer,
        project: *project,
        parent: *parent,
        child_agent: *child_agent,
        child,
        system_program: system_program::ID,
    };
    let data = quaestor::instruction::AllocateChild {
        label: lbl,
        amount,
        per_tx_limit,
        period_limit,
        period_seconds,
        expires_at,
        can_delegate,
        max_child_depth,
        allowlist,
    };
    let ix = Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: data.data(),
    };
    (ix, child)
}

pub fn ix_increase_allocation(
    authority: &Pubkey,
    project: &Pubkey,
    parent: &Pubkey,
    child: &Pubkey,
    amount: u64,
) -> Instruction {
    let accts = quaestor::accounts::IncreaseAllocation {
        authority: *authority,
        project: *project,
        parent: *parent,
        child: *child,
    };
    Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: quaestor::instruction::IncreaseAllocation { amount }.data(),
    }
}

/// Build a spend instruction, appending the ancestor chain as remaining accounts.
pub fn ix_spend(
    svm: &LiteSVM,
    agent: &Pubkey,
    project: &Pubkey,
    budget: &Pubkey,
    mint: &Pubkey,
    recipient: &Pubkey,
    vault: &Pubkey,
    amount: u64,
) -> Instruction {
    let accts = quaestor::accounts::Spend {
        agent: *agent,
        project: *project,
        budget: *budget,
        mint: *mint,
        recipient: *recipient,
        vault: *vault,
        token_program: spl_token::ID,
    };
    let mut metas = accts.to_account_metas(None);
    metas.extend(ancestor_metas(svm, budget));
    Instruction {
        program_id: quaestor::ID,
        accounts: metas,
        data: quaestor::instruction::Spend { amount }.data(),
    }
}

/// Build a spend with an explicit (possibly malformed) ancestor chain — for negative chain tests.
pub fn ix_spend_chain(
    agent: &Pubkey,
    project: &Pubkey,
    budget: &Pubkey,
    mint: &Pubkey,
    recipient: &Pubkey,
    vault: &Pubkey,
    amount: u64,
    chain: &[Pubkey],
) -> Instruction {
    let accts = quaestor::accounts::Spend {
        agent: *agent,
        project: *project,
        budget: *budget,
        mint: *mint,
        recipient: *recipient,
        vault: *vault,
        token_program: spl_token::ID,
    };
    let mut metas = accts.to_account_metas(None);
    for pk in chain {
        metas.push(AccountMeta::new_readonly(*pk, false));
    }
    Instruction {
        program_id: quaestor::ID,
        accounts: metas,
        data: quaestor::instruction::Spend { amount }.data(),
    }
}

pub fn ix_set_status(owner: &Pubkey, project: &Pubkey, budget: &Pubkey, freeze: bool) -> Instruction {
    let accts = quaestor::accounts::SetStatus {
        owner: *owner,
        project: *project,
        budget: *budget,
    };
    Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: quaestor::instruction::SetStatus { freeze }.data(),
    }
}

/// Ancestor-agent freeze/unfreeze: remaining accounts = the budget's ancestor chain.
pub fn ix_agent_set_status(
    svm: &LiteSVM,
    authority: &Pubkey,
    project: &Pubkey,
    budget: &Pubkey,
    freeze: bool,
) -> Instruction {
    let accts = quaestor::accounts::AgentSetStatus {
        authority: *authority,
        project: *project,
        budget: *budget,
    };
    let mut metas = accts.to_account_metas(None);
    metas.extend(ancestor_metas(svm, budget));
    Instruction {
        program_id: quaestor::ID,
        accounts: metas,
        data: quaestor::instruction::AgentSetStatus { freeze }.data(),
    }
}

pub fn ix_revoke(owner: &Pubkey, project: &Pubkey, budget: &Pubkey) -> Instruction {
    let accts = quaestor::accounts::Revoke {
        owner: *owner,
        project: *project,
        budget: *budget,
    };
    Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: quaestor::instruction::Revoke {}.data(),
    }
}

/// Reclaim: remaining accounts = the PARENT's ancestor chain.
pub fn ix_reclaim(
    svm: &LiteSVM,
    authority: &Pubkey,
    project: &Pubkey,
    parent: &Pubkey,
    child: &Pubkey,
) -> Instruction {
    let accts = quaestor::accounts::Reclaim {
        authority: *authority,
        project: *project,
        parent: *parent,
        child: *child,
    };
    let mut metas = accts.to_account_metas(None);
    metas.extend(ancestor_metas(svm, parent));
    Instruction {
        program_id: quaestor::ID,
        accounts: metas,
        data: quaestor::instruction::Reclaim {}.data(),
    }
}

pub fn ix_withdraw(
    owner: &Pubkey,
    project: &Pubkey,
    root_budget: &Pubkey,
    mint: &Pubkey,
    to: &Pubkey,
    vault: &Pubkey,
    amount: u64,
) -> Instruction {
    let accts = quaestor::accounts::Withdraw {
        owner: *owner,
        project: *project,
        root_budget: *root_budget,
        mint: *mint,
        to: *to,
        vault: *vault,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: quaestor::ID,
        accounts: accts.to_account_metas(None),
        data: quaestor::instruction::Withdraw { amount }.data(),
    }
}
