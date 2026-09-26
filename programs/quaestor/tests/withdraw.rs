mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn withdraw_owner_only_from_available() {
    let mut ctx = bootstrap(10 * USDC);
    // reserve 6 to A -> root available = 4
    let a = Keypair::new();
    let (ix, _) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 6 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");

    let owner_ata = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &ctx.owner.pubkey());

    // owner withdraws the 4 available
    let ix = ix_withdraw(&ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &ctx.env.mint, &owner_ata, &ctx.vault, 4 * USDC);
    send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).expect("withdraw 4");
    assert_eq!(token_balance(&ctx.env.svm, &owner_ata), 4 * USDC);

    // nothing left available -> over-withdraw fails
    let ix = ix_withdraw(&ctx.owner.pubkey(), &ctx.project, &ctx.root_budget, &ctx.env.mint, &owner_ata, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &ctx.owner.pubkey(), &[ix], &[&ctx.owner]).is_err(), "over-withdraw fails");

    // non-owner cannot withdraw
    let mallory = Keypair::new();
    ctx.env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let mallory_ata = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &mallory.pubkey());
    let ix = ix_withdraw(&mallory.pubkey(), &ctx.project, &ctx.root_budget, &ctx.env.mint, &mallory_ata, &ctx.vault, USDC);
    assert!(send(&mut ctx.env.svm, &mallory.pubkey(), &[ix], &[&mallory]).is_err(), "non-owner withdraw fails");
}
