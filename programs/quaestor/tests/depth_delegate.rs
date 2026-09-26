mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn max_depth_enforced() {
    let mut ctx = bootstrap(20 * USDC);
    // root(0) -> a(1) -> b(2) -> c(3) -> d(4)  ok; d -> e(5) rejected
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 16 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(), label("b"), 12 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("b");
    let c = Keypair::new();
    let (ix, c_bud) = ix_allocate_child(&b.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &b_bud, &c.pubkey(), label("c"), 8 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("c");
    let d = Keypair::new();
    let (ix, d_bud) = ix_allocate_child(&c.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &c_bud, &d.pubkey(), label("d"), 4 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&c, &ctx.env.payer]).expect("d depth4");
    assert_eq!(fetch_budget(&ctx.env.svm, &d_bud).depth, 4);

    let e = Keypair::new();
    let (ix, _) = ix_allocate_child(&d.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &d_bud, &e.pubkey(), label("e"), USDC, None, None, 0, None, true, 4, vec![]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&d, &ctx.env.payer]).is_err(), "depth 5 rejected");
}

#[test]
fn cannot_delegate_enforced() {
    let mut ctx = bootstrap(10 * USDC);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 5 * USDC, None, None, 0, None, false, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    let b = Keypair::new();
    let (ix, _) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(), label("b"), USDC, None, None, 0, None, true, 4, vec![]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "cannot delegate");
}

#[test]
fn child_expiry_must_not_exceed_parent() {
    let mut ctx = bootstrap(10 * USDC);
    let t = now(&ctx.env.svm);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 5 * USDC, None, None, 0, Some(t + 1000), true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");

    // later expiry -> fail
    let b = Keypair::new();
    let (ix, _) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(), label("b"), USDC, None, None, 0, Some(t + 2000), true, 4, vec![]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "later expiry rejected");

    // never-expiry under finite parent -> fail
    let c = Keypair::new();
    let (ix, _) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &c.pubkey(), label("c"), USDC, None, None, 0, None, true, 4, vec![]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "never-expiry rejected");

    // earlier expiry -> ok
    let d = Keypair::new();
    let (ix, _) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &d.pubkey(), label("d"), USDC, None, None, 0, Some(t + 500), true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("earlier expiry ok");
}

#[test]
fn expired_node_cannot_spend() {
    let mut ctx = bootstrap(10 * USDC);
    let t = now(&ctx.env.svm);
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 5 * USDC, None, None, 0, Some(t + 100), true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("spend before expiry");

    advance_time(&mut ctx.env.svm, 200);
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err(), "expired cannot spend");
}
