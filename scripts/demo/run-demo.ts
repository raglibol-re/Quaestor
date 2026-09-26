/**
 * Quaestor live demo (~90s). Runs the full flow on the configured cluster:
 * create project + deposit -> orchestrator budget -> research sub-agent (limits)
 * -> spends -> over-limit rejected -> freeze stops the sub-tree -> reclaim.
 *
 * Env: QUAESTOR_RPC_URL (required), QUAESTOR_OWNER_KEYPAIR (default ~/.config/solana/id.json),
 *      NEXT_PUBLIC_CLUSTER (default devnet), DEMO_PAUSE_MS (default 3500).
 */
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
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
const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER || "devnet";
const PAUSE = Number(process.env.DEMO_PAUSE_MS || "3500");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const L = (s = "") => console.log(s);
const step = (n: number, t: string) =>
  L(`\n${"=".repeat(64)}\n  STEP ${n}  ·  ${t}\n${"=".repeat(64)}`);
const ex = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;

function loadKp(path: string): Keypair {
  const p = path.startsWith("~") ? path.replace("~", homedir()) : path;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

async function main() {
  if (!RPC) throw new Error("set QUAESTOR_RPC_URL");
  const owner = loadKp(process.env.QUAESTOR_OWNER_KEYPAIR || "~/.config/solana/id.json");
  const conn = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(owner), { commitment: "confirmed" });
  const client = QuaestorClient.fromProvider(provider);
  const spl = await import("@solana/spl-token");

  L("\n  QUAESTOR — Give agents budgets, not keys.");
  L(`  owner (human): ${owner.publicKey.toBase58()}   cluster: ${CLUSTER}`);

  const projectId = Date.now() % 1_000_000_000;
  const [project] = findProjectPda(owner.publicKey, projectId);
  const [rootBudget] = findBudgetPda(project, owner.publicKey);

  step(1, "Human creates a project and deposits 10 USDC");
  const mint = await spl.createMint(conn, owner, owner.publicKey, null, 6);
  await client
    .createProject({ owner: owner.publicKey, mint, projectId, label: "demo", feePayer: owner.publicKey })
    .rpc();
  L("");
  L("   >>> PASTE THIS PROJECT INTO THE DASHBOARD (Load) TO WATCH LIVE <<<");
  L(`   ${project.toBase58()}`);
  L("");
  const ownerAta = await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
  await spl.mintTo(conn, owner, mint, ownerAta.address, owner, 10_000_000n);
  await (await client.deposit({ depositor: owner.publicKey, project, from: ownerAta.address, amount: toBaseUnits("10") })).rpc();
  L("  deposited 10 USDC into the project vault");
  await sleep(PAUSE);

  step(2, "Orchestrator agent receives a 6 USDC budget");
  const orch = Keypair.generate();
  const [orchBudget] = findBudgetPda(project, orch.publicKey);
  await client
    .allocateChild({ authority: owner.publicKey, feePayer: owner.publicKey, project, parent: rootBudget, childAgent: orch.publicKey, label: "orchestrator", amount: toBaseUnits("6"), canDelegate: true })
    .rpc();
  L(`  orchestrator ${orch.publicKey.toBase58().slice(0, 8)}... funded with 6 USDC`);
  await sleep(PAUSE);

  step(3, "Orchestrator delegates 2 USDC to a research sub-agent (max 0.50/tx)");
  const research = Keypair.generate();
  const [researchBudget] = findBudgetPda(project, research.publicKey);
  await client
    .allocateChild({ authority: orch.publicKey, feePayer: owner.publicKey, project, parent: orchBudget, childAgent: research.publicKey, label: "research", amount: toBaseUnits("2"), perTxLimit: toBaseUnits("0.5"), canDelegate: false })
    .signers([orch])
    .rpc();
  L("  research funded with 2 USDC, 0.50/tx cap  (agent signed; relayer paid the fee, agent holds no SOL)");
  await sleep(PAUSE);

  const merchant = Keypair.generate();
  const merchantAta = (await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, merchant.publicKey)).address;

  step(4, "Research agent pays for data: 2 x 0.50 USDC");
  for (let i = 1; i <= 2; i++) {
    const sig = await (await client.spend({ agent: research.publicKey, project, budget: researchBudget, recipient: merchantAta, amount: toBaseUnits("0.5") })).signers([research]).rpc();
    L(`  paid 0.50 USDC   ${ex(sig)}`);
    await sleep(Math.round(PAUSE / 1.5));
  }

  step(5, "Research tries to spend 3 USDC -> REJECTED on-chain");
  try {
    await (await client.spend({ agent: research.publicKey, project, budget: researchBudget, recipient: merchantAta, amount: toBaseUnits("3") })).signers([research]).rpc();
    L("  (!) unexpected: the payment went through");
  } catch {
    L("  BLOCKED: 3 USDC exceeds the 0.50 USDC per-transaction limit");
  }
  await sleep(PAUSE);

  step(6, "Human FREEZES the orchestrator -> the whole sub-tree stops instantly");
  const fsig = await client.setStatus({ owner: owner.publicKey, project, budget: orchBudget, freeze: true }).rpc();
  L(`  orchestrator frozen   ${ex(fsig)}`);
  await sleep(PAUSE);
  try {
    await (await client.spend({ agent: research.publicKey, project, budget: researchBudget, recipient: merchantAta, amount: toBaseUnits("0.25") })).signers([research]).rpc();
    L("  (!) unexpected: research could still pay");
  } catch {
    L("  BLOCKED: research payment rejected because an ancestor (orchestrator) is frozen");
  }
  await sleep(PAUSE);

  step(7, "Reclaim -> unused funds flow back");
  await client.revoke({ owner: owner.publicKey, project, budget: researchBudget }).rpc();
  const before = availableOf(await client.getBudget(orchBudget));
  const rsig = await (await client.reclaim({ authority: owner.publicKey, project, parent: orchBudget, child: researchBudget })).rpc();
  const after = availableOf(await client.getBudget(orchBudget));
  L(`  reclaimed research's unused 1.00 USDC   ${ex(rsig)}`);
  L(`  orchestrator available: ${fromBaseUnits(before)} -> ${fromBaseUnits(after)} USDC  (the 1.00 already spent is gone, as it should be)`);
  await sleep(PAUSE);

  step(8, "Final state");
  const tree = await client.fetchBudgetTree(project);
  const print = (n: BudgetTreeNode, d: number) => {
    const a = n.account;
    L(`  ${"  ".repeat(d)}- ${decodeLabel(a.label) || "root"} [${statusName(a.status)}]  alloc=${fromBaseUnits(a.allocated)} spent=${fromBaseUnits(a.spent)} reserved=${fromBaseUnits(a.reservedForChildren)} avail=${fromBaseUnits(availableOf(a))}`);
    n.children.forEach((c) => print(c, d + 1));
  };
  if (tree) print(tree, 0);
  L(`\n  project: ${project.toBase58()}`);
  L('\n  "Give agents budgets, not keys."\n');
}

main().catch((e) => {
  console.error("demo failed:", e?.message ?? e);
  process.exit(1);
});
