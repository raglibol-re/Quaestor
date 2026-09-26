mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn allowlist_enforced_on_spend() {
    let mut ctx = bootstrap(10 * USDC);

    let merchant = Keypair::new();
    let m_ata = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());
    let other = Keypair::new();
    let o_ata = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &other.pubkey());

    // A restricted to paying `merchant`
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 5 * USDC, None, None, 0, None, true, 4, vec![merchant.pubkey()],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    // pay merchant -> ok
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &m_ata, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("pay merchant");

    // pay other -> fail (not in allowlist)
    let ix = ix_spend(&ctx.env.svm, &a.pubkey(), &ctx.project, &a_bud, &ctx.env.mint, &o_ata, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());
}

#[test]
fn child_allowlist_must_be_subset() {
    let mut ctx = bootstrap(10 * USDC);
    let m1 = Keypair::new();
    let m2 = Keypair::new();
    let m3 = Keypair::new();

    // A allows {m1, m2}
    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(
        &ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(),
        label("A"), 5 * USDC, None, None, 0, None, true, 4, vec![m1.pubkey(), m2.pubkey()],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("alloc A");

    // child B allows {m1} (subset) -> ok
    let b = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(),
        label("B"), USDC, None, None, 0, None, true, 4, vec![m1.pubkey()],
    );
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("alloc B subset");

    // child C allows {m3} (not subset) -> fail
    let c = Keypair::new();
    let (ix, _) = ix_allocate_child(
        &a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &c.pubkey(),
        label("C"), USDC, None, None, 0, None, true, 4, vec![m3.pubkey()],
    );
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).is_err());
}
