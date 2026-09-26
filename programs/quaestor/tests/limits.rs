mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn over_allocate_rejected() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 6 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    // only 4 USDC available now -> allocating 5 must fail
    let b = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &b.pubkey(),
        label("B"), 5 * USDC, None, None, 0, None, true, 4, vec![],
    );
    let res = send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]);
    assert!(res.is_err(), "over-allocate should fail");
}

#[test]
fn over_spend_rejected() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 2 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    // spend 3 > 2 available -> fail
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, 3 * USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());

    // spend 2 -> ok
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, 2 * USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("spend 2");

    // spend 1 more -> fail (0 available)
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());
}

#[test]
fn per_tx_limit_enforced() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 5 * USDC, Some(USDC / 2), None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    // 0.6 > 0.5 per-tx -> fail
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, 6 * USDC / 10);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());

    // exactly 0.5 -> ok
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC / 2);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("spend 0.5");
}

#[test]
fn period_limit_and_reset() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    // period cap 1.0 over 100s, no per-tx cap
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 5 * USDC, None, Some(USDC), 100, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    // 0.6 ok
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, 6 * USDC / 10);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("spend 0.6");

    // +0.5 = 1.1 > 1.0 period -> fail
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC / 2);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());

    // advance past the window -> reset -> 0.5 ok
    advance_time(&mut ctx.env.svm, 101);
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC / 2);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("spend after reset");
}

#[test]
fn child_limits_must_be_tighter() {
    let mut ctx = bootstrap(10 * USDC);
    // parent A: per-tx 0.5
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 5 * USDC, Some(USDC / 2), None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    // child looser per-tx (1.0 > 0.5) -> fail
    let b = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(),
        label("B"), USDC, Some(USDC), None, 0, None, true, 4, vec![],
    );
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());

    // child unlimited per-tx under finite parent -> fail
    let c = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &c.pubkey(),
        label("C"), USDC, None, None, 0, None, true, 4, vec![],
    );
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());

    // child tighter/equal per-tx (0.5) -> ok
    let d = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &d.pubkey(),
        label("D"), USDC, Some(USDC / 2), None, 0, None, true, 4, vec![],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("alloc D");
}
