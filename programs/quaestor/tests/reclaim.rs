mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn reclaim_refunds_parent() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 6 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    assert_eq!(available(&fetch_budget(&ctx.env.svm, &ctx.root_budget)), 4 * USDC);

    // revoke then reclaim
    let ix = ix_revoke(&ctx.owner.pubkey(), &ctx.project, &a_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("revoke a");
    let ix = ix_reclaim(&ctx.env.svm, &ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &a_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("reclaim a");

    let root = fetch_budget(&ctx.env.svm, &ctx.root_budget);
    assert_eq!(root.reserved_for_children, 0);
    assert_eq!(available(&root), 10 * USDC);
}

/// Bottom-up rule + P0-1: a child under a revoked ancestor is reclaimable even while itself active.
#[test]
fn reclaim_bottom_up_and_ancestor_revoked() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 6 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(), label("b"), 2 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("b");

    // revoke A (middle). B stays active.
    let ix = ix_revoke(&ctx.owner.pubkey(), &ctx.project, &a_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("revoke a");

    // reclaim A now fails: it still reserves funds for B (bottom-up rule)
    let ix = ix_reclaim(&ctx.env.svm, &ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &a_bud);
    assert!(send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).is_err(), "cannot reclaim A with reserved children");

    // reclaim B: allowed because ancestor A is revoked (P0-1), even though B is Active
    let ix = ix_reclaim(&ctx.env.svm, &ctx.owner.pubkey(), &ctx.project, &a_bud, &b_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("reclaim B under revoked ancestor");

    // now A has no reserved children -> reclaim A
    let ix = ix_reclaim(&ctx.env.svm, &ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &a_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("reclaim A");

    let root = fetch_budget(&ctx.env.svm, &ctx.root_budget);
    assert_eq!(root.reserved_for_children, 0);
    assert_eq!(available(&root), 10 * USDC);
}

/// Reclaim is rejected for an active node with no revoked/expired ancestor.
#[test]
fn cannot_reclaim_active_node() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 6 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    let ix = ix_reclaim(&ctx.env.svm, &ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &a_bud);
    assert!(send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).is_err(), "active node not reclaimable");
}
