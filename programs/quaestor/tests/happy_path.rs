mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Project -> deposit 10 USDC -> 3-level tree -> spend on each level.
#[test]
fn happy_path_three_levels() {
    let mut env = setup();
    let owner = Keypair::new();
    env.svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    // create project
    let (ix, h) = ix_create_project(&owner.pubkey(), &env.mint, 1, label("demo"), &env.payer.pubkey());
    send(&mut env.svm, &owner.pubkey(), &[ix], &[&owner]).expect("create_project");

    // fund: owner token account, mint 10 USDC, deposit
    let owner_ata = create_token_account(&mut env.svm, &env.payer, &env.mint, &owner.pubkey());
    mint_to(&mut env.svm, &env.payer, &env.mint, &owner_ata, &env.mint_authority, 10 * USDC);
    let ix = ix_deposit(&owner.pubkey(), &h.project, &h.root_budget, &env.mint, &owner_ata, &h.vault, 10 * USDC);
    send(&mut env.svm, &owner.pubkey(), &[ix], &[&owner]).expect("deposit");

    let root = fetch_budget(&env.svm, &h.root_budget);
    assert_eq!(root.allocated, 10 * USDC);
    assert_eq!(available(&root), 10 * USDC);
    assert_eq!(token_balance(&env.svm, &h.vault), 10 * USDC);

    // level 1: orchestrator gets 6 USDC (owner allocates)
    let orch = Keypair::new();
    let (ix, orch_b) = ix_allocate_child(
        &owner.pubkey(), &env.payer.pubkey(), &h.project, &h.root_budget, &orch.pubkey(),
        label("orchestrator"), 6 * USDC, None, None, 0, None, true, 4, vec![],
    );
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&owner, &env.payer]).expect("allocate orch");

    let root = fetch_budget(&env.svm, &h.root_budget);
    assert_eq!(root.reserved_for_children, 6 * USDC);
    assert_eq!(available(&root), 4 * USDC);

    // level 2: research gets 2 USDC, 0.5 per-tx (orchestrator allocates)
    let research = Keypair::new();
    let (ix, research_b) = ix_allocate_child(
        &orch.pubkey(), &env.payer.pubkey(), &h.project, &orch_b, &research.pubkey(),
        label("research"), 2 * USDC, Some(USDC / 2), None, 0, None, true, 4, vec![],
    );
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&orch, &env.payer]).expect("allocate research");

    // level 3: scraper gets 1 USDC, 0.5 per-tx (research allocates)
    let scraper = Keypair::new();
    let (ix, scraper_b) = ix_allocate_child(
        &research.pubkey(), &env.payer.pubkey(), &h.project, &research_b, &scraper.pubkey(),
        label("scraper"), 1 * USDC, Some(USDC / 2), None, 0, None, false, 4, vec![],
    );
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&research, &env.payer]).expect("allocate scraper");

    assert_eq!(fetch_budget(&env.svm, &scraper_b).depth, 3);

    // recipient
    let merchant = Keypair::new();
    let merchant_ata = create_token_account(&mut env.svm, &env.payer, &env.mint, &merchant.pubkey());

    // spends on each level
    let ix = ix_spend(&env.svm, &orch.pubkey(), &h.project, &orch_b, &env.mint, &merchant_ata, &h.vault, 1 * USDC);
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&orch, &env.payer]).expect("orch spend");

    let ix = ix_spend(&env.svm, &research.pubkey(), &h.project, &research_b, &env.mint, &merchant_ata, &h.vault, USDC / 2);
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&research, &env.payer]).expect("research spend");

    let ix = ix_spend(&env.svm, &scraper.pubkey(), &h.project, &scraper_b, &env.mint, &merchant_ata, &h.vault, USDC / 4);
    send(&mut env.svm, &env.payer.pubkey(), &[ix], &[&scraper, &env.payer]).expect("scraper spend");

    // balances
    let spent_total = 1 * USDC + USDC / 2 + USDC / 4;
    assert_eq!(token_balance(&env.svm, &merchant_ata), spent_total);
    assert_eq!(token_balance(&env.svm, &h.vault), 10 * USDC - spent_total);

    // accounting
    let orch_bud = fetch_budget(&env.svm, &orch_b);
    assert_eq!(orch_bud.spent, 1 * USDC);
    assert_eq!(orch_bud.reserved_for_children, 2 * USDC);
    assert_eq!(available(&orch_bud), 6 * USDC - 1 * USDC - 2 * USDC);

    let research_bud = fetch_budget(&env.svm, &research_b);
    assert_eq!(research_bud.spent, USDC / 2);
    assert_eq!(research_bud.reserved_for_children, 1 * USDC);

    let scraper_bud = fetch_budget(&env.svm, &scraper_b);
    assert_eq!(scraper_bud.spent, USDC / 4);
}
