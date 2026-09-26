mod common;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Deterministic LCG (no external rng; keeps the test reproducible).
struct Rng(u64);
impl Rng {
    fn u(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
}

/// Fuzz spends across a small tree; after every attempt assert the core invariants:
///  - per node: spent + reserved_for_children <= allocated
///  - money conservation: vault_balance == root.allocated - sum(spent over all nodes)
///  - available(root) <= vault_balance
#[test]
fn invariant_fuzz_spends() {
    let mut ctx = bootstrap(100 * USDC);

    let a = Keypair::new();
    let (ix, a_bud) = ix_allocate_child(&ctx.owner.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &ctx.root_budget, &a.pubkey(), label("a"), 50 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&ctx.owner, &ctx.env.payer]).expect("a");
    let b = Keypair::new();
    let (ix, b_bud) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &b.pubkey(), label("b"), 20 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("b");
    let c = Keypair::new();
    let (ix, c_bud) = ix_allocate_child(&a.pubkey(), &ctx.env.payer.pubkey(), &ctx.project, &a_bud, &c.pubkey(), label("c"), 10 * USDC, None, None, 0, None, true, 4, vec![]);
    send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[&a, &ctx.env.payer]).expect("c");

    let merchant = Keypair::new();
    let m = create_token_account(&mut ctx.env.svm, &ctx.env.payer, &ctx.env.mint, &merchant.pubkey());

    let spenders: [(&Keypair, Pubkey); 3] = [(&a, a_bud), (&b, b_bud), (&c, c_bud)];
    let all_budgets = [ctx.root_budget, a_bud, b_bud, c_bud];

    let mut rng = Rng(0x9E3779B97F4A7C15);
    for _ in 0..40 {
        let (agent, bud) = spenders[(rng.u() % 3) as usize];
        let amt = (rng.u() % (3 * USDC)) + 1;
        let ix = ix_spend(&ctx.env.svm, &agent.pubkey(), &ctx.project, &bud, &ctx.env.mint, &m, &ctx.vault, amt);
        let _ = send(&mut ctx.env.svm, &ctx.env.payer.pubkey(), &[ix], &[agent, &ctx.env.payer]); // may fail; ignore

        let mut total_spent = 0u64;
        for k in &all_budgets {
            let bd = fetch_budget(&ctx.env.svm, k);
            assert!(bd.spent + bd.reserved_for_children <= bd.allocated, "node invariant broken");
            total_spent += bd.spent;
        }
        let root = fetch_budget(&ctx.env.svm, &ctx.root_budget);
        let vault_bal = token_balance(&ctx.env.svm, &ctx.vault);
        assert_eq!(vault_bal, root.allocated - total_spent, "money conservation broken");
        assert!(available(&root) <= vault_bal, "root available exceeds vault");
    }
}
