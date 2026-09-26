mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// root -> A -> B (B is depth 2). Returns everything needed to drive spends from B.
fn two_levels() -> (Ctx, Keypair, Pubkey, Pubkey) {
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
    (ctx, b, a_bud, b_bud)
}

fn merchant_ata(ctx: &mut Ctx) -> Pubkey {
    let merchant = Keypair::new();
    create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey())
}

#[test]
fn correct_chain_spends() {
    let (mut ctx, b, _a_bud, b_bud) = two_levels();
    let m = merchant_ata(&mut ctx);
    let ix = ix_spend(&ctx.env.svm, &b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).expect("correct chain spends");
}

#[test]
fn empty_chain_rejected() {
    let (mut ctx, b, _a_bud, b_bud) = two_levels();
    let m = merchant_ata(&mut ctx);
    let ix = ix_spend_chain(&b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC, &[]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err());
}

#[test]
fn short_chain_rejected() {
    let (mut ctx, b, a_bud, b_bud) = two_levels();
    let m = merchant_ata(&mut ctx);
    // [A] only, missing root
    let ix = ix_spend_chain(&b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC, &[a_bud]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err());
}

#[test]
fn wrong_order_chain_rejected() {
    let (mut ctx, b, a_bud, b_bud) = two_levels();
    let m = merchant_ata(&mut ctx);
    // [root, A] instead of [A, root]
    let ix = ix_spend_chain(&b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC, &[ctx.root_budget, a_bud]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err());
}

#[test]
fn foreign_chain_rejected() {
    let (mut ctx, b, a_bud, b_bud) = two_levels();
    let m = merchant_ata(&mut ctx);
    // second project; use its root as a fake ancestor
    let owner2 = Keypair::new();
    ctx.env.svm.airdrop(&owner2.pubkey(), 1_000_000_000).unwrap();
    let (ix, h2) = ix_create_project(&owner2.pubkey(), &ctx.env.mint, 2, label("p2"), &ctx.env.payer.pubkey());
    send(&mut ctx.env.svm, &owner2.pubkey(), &[ix], &[&owner2]).expect("create p2");
    let ix = ix_spend_chain(&b.pubkey(), &ctx.project, &b_bud, &ctx.env.mint, &m, &ctx.vault, USDC, &[a_bud, h2.root_budget]);
    assert!(send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&b, &ctx.env.payer]).is_err());
}
