/**
 * Populate a lived-in demo project on Solana devnet: a 4-level tree with real spends and a frozen
 * branch, so the dashboard's Solana view shows genuine usage. The agent signs each spend; the
 * relayer (owner) pays the fee — agents need no SOL. Prints the project address for
 * NEXT_PUBLIC_DEMO_PROJECT.
 *
 * Env: QUAESTOR_RPC_URL (devnet), QUAESTOR_OWNER_KEYPAIR (default ~/.config/solana/id.json).
 */
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
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.QUAESTOR_RPC_URL as string;
const loadKp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace(/^~/, homedir()), "utf8"))));

async function main() {
  if (!RPC) throw new Error("set QUAESTOR_RPC_URL (devnet)");
  const owner = loadKp(process.env.QUAESTOR_OWNER_KEYPAIR || "~/.config/solana/id.json");
  const conn = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(owner), { commitment: "confirmed" });
  const client = QuaestorClient.fromProvider(provider);
  const spl = await import("@solana/spl-token");

  const projectId = Date.now() % 1_000_000_000;
  const [project] = findProjectPda(owner.publicKey, projectId);
  const [rootBudget] = findBudgetPda(project, owner.publicKey);

  console.log("setup: mint + project + deposit 50 USDC on devnet...");
  const mint = await spl.createMint(conn, owner, owner.publicKey, null, 6);
  await client.createProject({ owner: owner.publicKey, mint, projectId, label: "acme-research", feePayer: owner.publicKey }).rpc();
  const ownerAta = await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
  await spl.mintTo(conn, owner, mint, ownerAta.address, owner, 50_000_000n);
  await (await client.deposit({ depositor: owner.publicKey, project, from: ownerAta.address, amount: toBaseUnits("50") })).rpc();

  // Agents (hold no SOL; owner relays + pays). budget PDA = findBudgetPda(project, agent).
  const orch = Keypair.generate(), research = Keypair.generate(), writer = Keypair.generate(), scraper = Keypair.generate();
  const bud = (a: Keypair) => findBudgetPda(project, a.publicKey)[0];

  const allocate = async (authority: Keypair | null, parent: typeof rootBudget, child: Keypair, label: string, amount: string, perTx: string | null, canDelegate = false) => {
    const auth = authority ?? owner;
    const b = client.allocateChild({
      authority: auth.publicKey, feePayer: owner.publicKey, project, parent, childAgent: child.publicKey,
      label, amount: toBaseUnits(amount), perTxLimit: perTx ? toBaseUnits(perTx) : null, canDelegate,
    });
    const signers = authority ? [authority] : [];
    await b.signers(signers).rpc();
    console.log(`  ${label} <- ${amount} USDC${perTx ? ` (${perTx}/tx)` : ""}`);
  };
  await allocate(null, rootBudget, orch, "orchestrator", "30", null, true);
  await allocate(orch, bud(orch), research, "research", "12", "3", true);
  await allocate(orch, bud(orch), writer, "writer", "6", "2");
  await allocate(research, bud(research), scraper, "scraper", "4", "1");

  // Merchants + real spends (agent signs, relayer pays).
  const merchants = await Promise.all(Array.from({ length: 3 }, () => Keypair.generate()).map((m) => spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, m.publicKey).then((a) => a.address)));
  const spend = async (agent: Keypair, budget: typeof rootBudget, m: number, amount: string, who: string) => {
    await (await client.spend({ agent: agent.publicKey, project, budget, recipient: merchants[m], amount: toBaseUnits(amount) })).signers([agent]).rpc();
    console.log(`  ${who} pays ${amount} USDC -> merchant${m + 1}`);
  };
  await spend(research, bud(research), 0, "2.5", "research");
  await spend(research, bud(research), 1, "1.0", "research");
  await spend(scraper, bud(scraper), 2, "0.8", "scraper");
  await spend(scraper, bud(scraper), 0, "0.5", "scraper");
  await spend(writer, bud(writer), 1, "1.5", "writer");

  // Freeze the writer branch (owner freeze; the live devnet program predates M7's agent freeze).
  await client.setStatus({ owner: owner.publicKey, project, budget: bud(writer), freeze: true }).rpc();
  console.log("  owner FREEZES writer branch");

  console.log("\nfinal tree:");
  const tree = await client.fetchBudgetTree(project);
  const print = (n: BudgetTreeNode, d: number) => {
    const a = n.account;
    console.log(`  ${"  ".repeat(d)}- ${decodeLabel(a.label) || "root"} [${statusName(a.status)}] alloc=${fromBaseUnits(a.allocated)} spent=${fromBaseUnits(a.spent)} avail=${fromBaseUnits(availableOf(a))}`);
    n.children.forEach((c) => print(c, d + 1));
  };
  if (tree) print(tree, 0);
  console.log(`\nNEXT_PUBLIC_DEMO_PROJECT=${project.toBase58()}`);
}

main().catch((e) => { console.error("populate failed:", e?.message ?? e); process.exit(1); });
