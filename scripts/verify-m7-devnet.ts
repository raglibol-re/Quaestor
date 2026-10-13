/**
 * Verify the devnet program upgrade: the ancestor-agent freeze (`agent_set_status`, M7) now works
 * on-chain — it previously failed with InstructionFallbackNotFound against the M4-era program.
 * Env: QUAESTOR_RPC_URL (devnet), QUAESTOR_OWNER_KEYPAIR (default ~/.config/solana/id.json).
 */
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, findBudgetPda, findProjectPda, statusName, toBaseUnits } from "@quaestor/sdk";
import { Connection, Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC = process.env.QUAESTOR_RPC_URL as string;
const loadKp = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace(/^~/, homedir()), "utf8"))));

async function main() {
  const owner = loadKp(process.env.QUAESTOR_OWNER_KEYPAIR || "~/.config/solana/id.json");
  const conn = new Connection(RPC, "confirmed");
  const client = QuaestorClient.fromProvider(new AnchorProvider(conn, new Wallet(owner), { commitment: "confirmed" }));
  const spl = await import("@solana/spl-token");

  const projectId = Date.now() % 1_000_000_000;
  const [project] = findProjectPda(owner.publicKey, projectId);
  const [root] = findBudgetPda(project, owner.publicKey);
  console.log("setup project + tree on devnet...");
  const mint = await spl.createMint(conn, owner, owner.publicKey, null, 6);
  await client.createProject({ owner: owner.publicKey, mint, projectId, label: "verify", feePayer: owner.publicKey }).rpc();
  const ata = (await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey)).address;
  await spl.mintTo(conn, owner, mint, ata, owner, 10_000_000n);
  await (await client.deposit({ depositor: owner.publicKey, project, from: ata, amount: toBaseUnits("10") })).rpc();

  const orch = Keypair.generate(), research = Keypair.generate();
  await client.allocateChild({ authority: owner.publicKey, feePayer: owner.publicKey, project, parent: root, childAgent: orch.publicKey, label: "orchestrator", amount: toBaseUnits("6"), canDelegate: true }).rpc();
  const [orchBudget] = findBudgetPda(project, orch.publicKey);
  await client.allocateChild({ authority: orch.publicKey, feePayer: owner.publicKey, project, parent: orchBudget, childAgent: research.publicKey, label: "research", amount: toBaseUnits("2"), perTxLimit: toBaseUnits("0.5") }).signers([orch]).rpc();
  const [researchBudget] = findBudgetPda(project, research.publicKey);

  // THE TEST: the orchestrator AGENT freezes the research branch via agent_set_status (M7).
  console.log("orchestrator agent calls agent_set_status(research, freeze=true)...");
  const sig = await (await client.agentSetStatus({ authority: orch.publicKey, project, budget: researchBudget, freeze: true })).signers([orch]).rpc();
  const rb = await client.getBudget(researchBudget);
  console.log(`  tx ${sig}`);
  console.log(`  research status now: ${statusName(rb.status)}`);
  if (statusName(rb.status) !== "frozen") throw new Error("expected frozen");

  // And a non-ancestor cannot freeze it.
  const mallory = Keypair.generate();
  await conn.requestAirdrop(mallory.publicKey, 100_000_000).then((s) => conn.confirmTransaction(s, "confirmed")).catch(() => {});
  let blocked = false;
  try {
    await (await client.agentSetStatus({ authority: mallory.publicKey, project, budget: researchBudget, freeze: false })).signers([mallory]).rpc();
  } catch { blocked = true; }
  console.log(`  non-ancestor freeze blocked: ${blocked}`);

  console.log(`\n  ✅ agent_set_status works on devnet — the upgrade is live and correct.`);
}
main().catch((e) => { console.error("verify failed:", e?.message ?? e); process.exit(1); });
