#!/usr/bin/env node
import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  QuaestorClient,
  availableOf,
  decodeLabel,
  findBudgetPda,
  findProjectPda,
  fromBaseUnits,
  statusName,
  toBaseUnits,
  type BudgetTreeNode,
} from "@quaestor/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// @solana/spl-token is ESM-only; load it lazily from this CommonJS module.
const spl = () => import("@solana/spl-token");
import { Command } from "commander";
import { DEFAULT_RPC, loadKeypairFile } from "./config";
import { createAgent, listAgents } from "./keystore";

function ownerKeypair(): Keypair {
  return loadKeypairFile(process.env.QUAESTOR_OWNER_KEYPAIR || "~/.config/solana/id.json");
}
function rpcUrl(): string {
  return process.env.QUAESTOR_RPC_URL || DEFAULT_RPC;
}
function makeClient(owner: Keypair): { connection: Connection; client: QuaestorClient } {
  const connection = new Connection(rpcUrl(), "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(owner), { commitment: "confirmed" });
  return { connection, client: QuaestorClient.fromProvider(provider) };
}

const program = new Command();
program.name("quaestor").description("Quaestor owner CLI").version("0.1.0");

program
  .command("create-mint")
  .description("Create a test USDC mint (owner = mint authority)")
  .option("--decimals <n>", "decimals", "6")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { connection } = makeClient(owner);
    const { createMint } = await spl();
    const mint = await createMint(connection, owner, owner.publicKey, null, Number(opts.decimals));
    console.log(`mint: ${mint.toBase58()}`);
  });

program
  .command("fund")
  .description("Mint test USDC to the owner's token account (owner must be mint authority)")
  .requiredOption("--mint <pubkey>")
  .requiredOption("--amount <usdc>")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { connection } = makeClient(owner);
    const { getOrCreateAssociatedTokenAccount, mintTo } = await spl();
    const mint = new PublicKey(opts.mint);
    const ata = await getOrCreateAssociatedTokenAccount(connection, owner, mint, owner.publicKey);
    await mintTo(connection, owner, mint, ata.address, owner, BigInt(toBaseUnits(opts.amount).toString()));
    console.log(`minted ${opts.amount} to ${ata.address.toBase58()}`);
  });

program
  .command("init")
  .description("Create a project (vault + root mandate)")
  .requiredOption("--mint <pubkey>")
  .option("--project-id <n>", "project id", "1")
  .option("--label <s>", "label", "quaestor")
  .option("--relayer <pubkey>", "relayer/fee-payer pubkey (defaults to owner)")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { client } = makeClient(owner);
    const projectId = Number(opts.projectId);
    const feePayer = opts.relayer ? new PublicKey(opts.relayer) : owner.publicKey;
    const sig = await client
      .createProject({ owner: owner.publicKey, mint: new PublicKey(opts.mint), projectId, label: opts.label, feePayer })
      .rpc();
    const [project] = findProjectPda(owner.publicKey, projectId);
    const p = await client.getProject(project);
    console.log(`project:     ${project.toBase58()}`);
    console.log(`vault:       ${p.vault.toBase58()}`);
    console.log(`root mandate: ${p.rootBudget.toBase58()}`);
    console.log(`owner:       ${owner.publicKey.toBase58()}`);
    console.log(`signature:   ${sig}`);
  });

program
  .command("deposit")
  .description("Deposit USDC into the project vault")
  .requiredOption("--project <pubkey>")
  .requiredOption("--amount <usdc>")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { connection, client } = makeClient(owner);
    const { getOrCreateAssociatedTokenAccount } = await spl();
    const project = new PublicKey(opts.project);
    const p = await client.getProject(project);
    const ata = await getOrCreateAssociatedTokenAccount(connection, owner, p.mint, owner.publicKey);
    const sig = await (
      await client.deposit({ depositor: owner.publicKey, project, from: ata.address, amount: toBaseUnits(opts.amount) })
    ).rpc();
    console.log(`deposited ${opts.amount} USDC. signature: ${sig}`);
  });

program
  .command("tree")
  .description("Print the mandate tree of a project")
  .requiredOption("--project <pubkey>")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { client } = makeClient(owner);
    const root = await client.fetchBudgetTree(new PublicKey(opts.project));
    if (!root) return console.log("(no mandates)");
    const print = (n: BudgetTreeNode, depth: number) => {
      const a = n.account;
      const pad = "  ".repeat(depth);
      console.log(
        `${pad}- ${decodeLabel(a.label) || "(root)"} [${statusName(a.status)}] ` +
          `alloc=${fromBaseUnits(a.allocated)} spent=${fromBaseUnits(a.spent)} ` +
          `reserved=${fromBaseUnits(a.reservedForChildren)} avail=${fromBaseUnits(availableOf(a))}`
      );
      n.children.forEach((c) => print(c, depth + 1));
    };
    print(root, 0);
  });

program
  .command("allocate")
  .description("Allocate a child mandate (owner authority)")
  .requiredOption("--project <pubkey>")
  .requiredOption("--parent <mandate pubkey>")
  .requiredOption("--agent <child agent pubkey>")
  .requiredOption("--amount <usdc>")
  .option("--label <s>", "label", "agent")
  .option("--per-tx <usdc>")
  .option("--daily <usdc>")
  .option("--can-delegate")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { client } = makeClient(owner);
    const project = new PublicKey(opts.project);
    const agent = new PublicKey(opts.agent);
    const sig = await client
      .allocateChild({
        authority: owner.publicKey,
        feePayer: owner.publicKey,
        project,
        parent: new PublicKey(opts.parent),
        childAgent: agent,
        label: opts.label,
        amount: toBaseUnits(opts.amount),
        perTxLimit: opts.perTx ? toBaseUnits(opts.perTx) : null,
        periodLimit: opts.daily ? toBaseUnits(opts.daily) : null,
        periodSeconds: opts.daily ? 86400 : 0,
        canDelegate: !!opts.canDelegate,
      })
      .rpc();
    const [child] = findBudgetPda(project, agent);
    console.log(`child mandate: ${child.toBase58()}`);
    console.log(`signature:    ${sig}`);
  });

program
  .command("freeze")
  .description("Freeze (or unfreeze) a mandate (owner only)")
  .requiredOption("--project <pubkey>")
  .requiredOption("--budget <pubkey>")
  .option("--unfreeze", "unfreeze instead")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { client } = makeClient(owner);
    const sig = await client
      .setStatus({ owner: owner.publicKey, project: new PublicKey(opts.project), budget: new PublicKey(opts.budget), freeze: !opts.unfreeze })
      .rpc();
    console.log(`${opts.unfreeze ? "unfrozen" : "frozen"}. signature: ${sig}`);
  });

program
  .command("revoke")
  .description("Revoke a mandate (owner only)")
  .requiredOption("--project <pubkey>")
  .requiredOption("--budget <pubkey>")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { client } = makeClient(owner);
    const sig = await client
      .revoke({ owner: owner.publicKey, project: new PublicKey(opts.project), budget: new PublicKey(opts.budget) })
      .rpc();
    console.log(`revoked. signature: ${sig}`);
  });

program
  .command("withdraw")
  .description("Withdraw from the root's available balance (owner only)")
  .requiredOption("--project <pubkey>")
  .requiredOption("--amount <usdc>")
  .action(async (opts) => {
    const owner = ownerKeypair();
    const { connection, client } = makeClient(owner);
    const { getOrCreateAssociatedTokenAccount } = await spl();
    const project = new PublicKey(opts.project);
    const p = await client.getProject(project);
    const ata = await getOrCreateAssociatedTokenAccount(connection, owner, p.mint, owner.publicKey);
    const sig = await (
      await client.withdraw({ owner: owner.publicKey, project, to: ata.address, amount: toBaseUnits(opts.amount) })
    ).rpc();
    console.log(`withdrew ${opts.amount} USDC to ${ata.address.toBase58()}. signature: ${sig}`);
  });

program
  .command("agent-create")
  .description("Create a new encrypted agent keypair in the local keystore")
  .argument("<name>")
  .action((name) => {
    const passphrase = process.env.QUAESTOR_KEYSTORE_PASSPHRASE;
    if (!passphrase) throw new Error("set QUAESTOR_KEYSTORE_PASSPHRASE");
    const kp = createAgent(name, passphrase);
    console.log(`agent '${name}': ${kp.publicKey.toBase58()}`);
  });

program
  .command("agent-list")
  .description("List agents in the local keystore")
  .action(() => {
    for (const a of listAgents()) console.log(`${a.name}\t${a.pubkey}`);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});
