mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Freezing a middle node instantly blocks all descendants' spends.
#[test]
fn freeze_middle_blocks_descendants() {
    let mut ctx = bootstrap(10 * USDC);

    // A (orchestrator) with child B
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

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    // B can spend before freeze
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("b spend before freeze");

    // owner freezes A (the middle node)
    let ix = ix_set_status(&ctx.owner.pubkey(), &ctx.project, &a_bud, true);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("freeze A");

    // B spend now fails (ancestor frozen), and A itself cannot spend
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err(), "descendant blocked");
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "frozen node blocked");

    // unfreeze -> B can spend again
    let ix = ix_set_status(&ctx.owner.pubkey(), &ctx.project, &a_bud, false);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("unfreeze A");
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("b spend after unfreeze");
}

/// Only the project owner may freeze/revoke.
#[test]
fn only_owner_can_freeze() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 3 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let mallory = Keypair::new();
    ctx.env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let ix = ix_set_status(&mallory.pubkey(), &ctx.project, &a_bud, true);
    assert!(send(&mut ctx.env.svm, &mallory.pubkey(), &[ix], &[&mallory]).is_err(), "non-owner cannot freeze");
}

/// A revoked node cannot spend, and cannot be un-frozen.
#[test]
fn revoke_is_terminal() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 3 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let ix = ix_revoke(&ctx.owner.pubkey(), &ctx.project, &a_bud);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("revoke A");

    // cannot unfreeze a revoked node
    let ix = ix_set_status(&ctx.owner.pubkey(), &ctx.project, &a_bud, false);
    assert!(send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).is_err(), "revoked is terminal");

    // revoked node cannot spend
    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "revoked cannot spend");
}
