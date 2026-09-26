import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { assert } from "chai";
import {
  QuaestorClient,
  findProjectPda,
  findBudgetPda,
  toBaseUnits,
  fromBaseUnits,
  availableOf,
  decodeLabel,
  statusName,
  USDC_DECIMALS,
} from "@quaestor/sdk";

describe("quaestor SDK integration", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet;
  const walletKp = wallet.payer;
  const client = QuaestorClient.fromProvider(provider);

  it("create_project -> deposit -> allocate -> spend -> fetchBudgetTree", async () => {
    // self-minted test USDC
    const mint = await createMint(provider.connection, walletKp, walletKp.publicKey, null, USDC_DECIMALS);

    const projectId = 1;
    const owner = wallet.publicKey;

    // create project
    await client.createProject({ owner, mint, projectId, label: "demo", feePayer: walletKp.publicKey }).rpc();

    const [project] = findProjectPda(owner, projectId);
    const proj = await client.getProject(project);
    assert.strictEqual(decodeLabel(proj.label), "demo");

    // fund + deposit 10 USDC
    const ownerAta = await getOrCreateAssociatedTokenAccount(provider.connection, walletKp, mint, owner);
    await mintTo(provider.connection, walletKp, mint, ownerAta.address, walletKp, 10n * 10n ** BigInt(USDC_DECIMALS));
    await (await client.deposit({ depositor: owner, project, from: ownerAta.address, amount: toBaseUnits("10") })).rpc();

    let root = await client.getBudget(proj.rootBudget);
    assert.strictEqual(fromBaseUnits(root.allocated), "10");
    assert.strictEqual(availableOf(root).toString(), toBaseUnits("10").toString());

    // allocate orchestrator (6 USDC)
    const orch = Keypair.generate();
    await client
      .allocateChild({
        authority: owner,
        feePayer: walletKp.publicKey,
        project,
        parent: proj.rootBudget,
        childAgent: orch.publicKey,
        label: "orchestrator",
        amount: toBaseUnits("6"),
      })
      .rpc();

    const [orchBudget] = findBudgetPda(project, orch.publicKey);
    root = await client.getBudget(proj.rootBudget);
    assert.strictEqual(fromBaseUnits(root.reservedForChildren), "6");
    assert.strictEqual(fromBaseUnits(availableOf(root)), "4");

    // orchestrator spends 1 USDC (agent signs; wallet pays fees — agent needs no SOL)
    const merchant = Keypair.generate();
    const merchantAta = await getOrCreateAssociatedTokenAccount(provider.connection, walletKp, mint, merchant.publicKey);
    await (
      await client.spend({
        agent: orch.publicKey,
        project,
        budget: orchBudget,
        recipient: merchantAta.address,
        amount: toBaseUnits("1"),
      })
    )
      .signers([orch])
      .rpc();

    // tree assertions
    const tree = await client.fetchBudgetTree(project);
    assert.ok(tree, "tree root exists");
    assert.strictEqual(tree!.children.length, 1, "root has one child");
    const orchNode = tree!.children[0];
    assert.strictEqual(decodeLabel(orchNode.account.label), "orchestrator");
    assert.strictEqual(fromBaseUnits(orchNode.account.spent), "1");
    assert.strictEqual(statusName(orchNode.account.status), "active");
    assert.strictEqual(fromBaseUnits(availableOf(orchNode.account)), "5");
  });
});
