//! Ancestor-*agent* freeze: a parent/grandparent agent (not just the human owner) can freeze
//! and unfreeze a descendant subtree via `agent_set_status`.

mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// A parent agent (the orchestrator) can freeze its direct child and unfreeze it — the agent
/// holds no SOL; the relayer pays the fee.
#[test]
fn parent_agent_freezes_child() {
    let mut ctx = bootstrap(10 * USDC);

    // owner -> A (orchestrator)
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 6 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    // A -> B (research)
    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(),
        label("B"), 2 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("alloc B");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    // B spends OK before the freeze
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("b spend before freeze");

    // A (the parent AGENT, not the owner) freezes B. A is not the fee payer and holds no SOL.
    let ix = ix_agent_set_status(&ctx.env.svm, &a.pubkey(), &ctx.project, &b_bud, true);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("A freezes B");
    assert_eq!(fetch_budget(&ctx.env.svm, &b_bud).status, BudgetStatus::Frozen);

    // B cannot spend while frozen
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err(), "frozen B blocked");

    // A unfreezes B -> B can spend again
    let ix = ix_agent_set_status(&ctx.env.svm, &a.pubkey(), &ctx.project, &b_bud, false);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("A unfreezes B");
    assert_eq!(fetch_budget(&ctx.env.svm, &b_bud).status, BudgetStatus::Active);
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("b spend after unfreeze");
}

/// A grandparent agent can freeze a grandchild (any ancestor level authorizes).
#[test]
fn grandparent_agent_freezes_grandchild() {
    let mut ctx = bootstrap(10 * USDC);

    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 6 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(),
        label("B"), 3 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("alloc B");

    let c = Keypair::new();
    let (ix, c_bud) = ix_allocate_child(
        &b.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &b_bud, &c.pubkey(),
        label("C"), 1 * USDC, None, None, 0, None, false, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("alloc C");

    // A (grandparent) freezes C (grandchild)
    let ix = ix_agent_set_status(&ctx.env.svm, &a.pubkey(), &ctx.project, &c_bud, true);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("A freezes C");
    assert_eq!(fetch_budget(&ctx.env.svm, &c_bud).status, BudgetStatus::Frozen);

    // C cannot spend
    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());
    let ix = ix_spend(&ctx.env.svm, &c.pubkey(), &ctx.project, &c_bud, &ctx.env.mint, &m, &ctx.vault, USDC / 2);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&c, &ctx.env.payer]).is_err(), "frozen grandchild blocked");
}

/// A non-ancestor (and the budget's own agent) cannot use the ancestor-freeze path.
#[test]
fn non_ancestor_cannot_agent_freeze() {
    let mut ctx = bootstrap(10 * USDC);

    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 6 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(),
        label("B"), 2 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("alloc B");

    // An unrelated agent cannot freeze B
    let mallory = Keypair::new();
    ctx.env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let ix = ix_agent_set_status(&ctx.env.svm, &mallory.pubkey(), &ctx.project, &b_bud, true);
    assert!(send(&mut ctx.env.svm, &mallory.pubkey(), &[ix], &[&mallory]).is_err(), "non-ancestor blocked");

    // B's own agent is not an ancestor of B -> cannot self-freeze via the agent path
    let ix = ix_agent_set_status(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, true);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err(), "self is not ancestor");

    assert_eq!(fetch_budget(&ctx.env.svm, &b_bud).status, BudgetStatus::Active);
}
