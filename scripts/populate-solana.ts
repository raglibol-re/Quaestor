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

  console.log("setup: mint + project + deposit 250 USDC on devnet...");
  const mint = await spl.createMint(conn, owner, owner.publicKey, null, 6);
  await client.createProject({ owner: owner.publicKey, mint, projectId, label: "acme-research", feePayer: owner.publicKey }).rpc();
  const ownerAta = await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
  await spl.mintTo(conn, owner, mint, ownerAta.address, owner, 250_000_000n);
  await (await client.deposit({ depositor: owner.publicKey, project, from: ownerAta.address, amount: toBaseUnits("250") })).rpc();

  // Agents (hold no SOL; owner relays + pays). budget PDA = findBudgetPda(project, agent).
  const orch = Keypair.generate(), research = Keypair.generate(), writer = Keypair.generate();
  const analyst = Keypair.generate(), scraper = Keypair.generate(), indexer = Keypair.generate(), editor = Keypair.generate();
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
  // orchestrator holds 180; carves research/writer/analyst; research sub-delegates scraper/indexer;
  // writer sub-delegates editor — a 3-level tree that only tightens down each branch.
  await allocate(null, rootBudget, orch, "orchestrator", "180", null, true);
  await allocate(orch, bud(orch), research, "research", "80", "10", true);
  await allocate(orch, bud(orch), writer, "writer", "50", "5", true);
  await allocate(orch, bud(orch), analyst, "analyst", "30", "5");
  await allocate(research, bud(research), scraper, "scraper", "30", "3");
  await allocate(research, bud(research), indexer, "indexer", "20", "2");
  await allocate(writer, bud(writer), editor, "editor", "15", "3");

  // Merchants + real spends (agent signs, relayer pays) — spread across data/compute/API vendors.
  const merchants = await Promise.all(Array.from({ length: 5 }, () => Keypair.generate()).map((m) => spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, m.publicKey).then((a) => a.address)));
  const spend = async (agent: Keypair, budget: typeof rootBudget, m: number, amount: string, who: string) => {
    await (await client.spend({ agent: agent.publicKey, project, budget, recipient: merchants[m], amount: toBaseUnits(amount) })).signers([agent]).rpc();
    console.log(`  ${who} pays ${amount} USDC -> merchant${m + 1}`);
  };
  await spend(research, bud(research), 0, "6.0", "research");
  await spend(research, bud(research), 1, "3.0", "research");
  await spend(scraper, bud(scraper), 2, "2.0", "scraper");
  await spend(scraper, bud(scraper), 0, "1.0", "scraper");
  await spend(indexer, bud(indexer), 3, "1.5", "indexer");
  await spend(analyst, bud(analyst), 4, "3.0", "analyst");
  await spend(analyst, bud(analyst), 1, "1.5", "analyst");
  await spend(editor, bud(editor), 2, "2.0", "editor");
  await spend(writer, bud(writer), 3, "4.0", "writer");
  await spend(writer, bud(writer), 4, "2.5", "writer");

  // Freeze the writer branch — the ORCHESTRATOR AGENT freezes it (M7 ancestor-agent freeze),
  // no owner signature needed. The devnet program is now upgraded to the M7 code.
  await (await client.agentSetStatus({ authority: orch.publicKey, project, budget: bud(writer), freeze: true })).signers([orch]).rpc();
  console.log("  orchestrator AGENT freezes writer branch (M7 ancestor-agent freeze)");

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
