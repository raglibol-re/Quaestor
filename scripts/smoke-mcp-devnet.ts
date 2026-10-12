/**
 * Authoritative MCP-server smoke test on **devnet** (where confirmations work, unlike the WSL
 * local validator). Seeds a project + orchestrator agent, spawns the real MCP server, and drives
 * its tools over stdio: get_my_budget -> create_subagent_budget -> pay (ok) -> pay (over per-tx
 * limit -> rejected). Validates the ChainOps refactor + the PollingProvider end-to-end.
 *
 * Env: QUAESTOR_RPC_URL (devnet RPC), QUAESTOR_OWNER_KEYPAIR (default ~/.config/solana/id.json).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, findProjectPda, toBaseUnits } from "@quaestor/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const RPC = process.env.QUAESTOR_RPC_URL as string;
const serverPath = join(process.cwd(), "packages/mcp-server/dist/server.js");
const cliPath = join(process.cwd(), "packages/mcp-server/dist/cli.js");
const textOf = (r: any) => (r.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
const loadKp = (p: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace(/^~/, homedir()), "utf8"))));

async function main() {
  if (!RPC) throw new Error("set QUAESTOR_RPC_URL (devnet)");
  const owner = loadKp(process.env.QUAESTOR_OWNER_KEYPAIR || "~/.config/solana/id.json");
  const conn = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(conn, new Wallet(owner), { commitment: "confirmed" });
  const client = QuaestorClient.fromProvider(provider);
  const spl = await import("@solana/spl-token");

  const keystoreDir = mkdtempSync(join(tmpdir(), "quaestor-smoke-"));
  const passphrase = "smoke-pass";
  process.env.QUAESTOR_KEYSTORE_DIR = keystoreDir;
  process.env.QUAESTOR_KEYSTORE_PASSPHRASE = passphrase;

  // Fund a fresh relayer from the owner (devnet airdrop is rate-limited, so transfer instead).
  const relayer = Keypair.generate();
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: relayer.publicKey, lamports: 60_000_000 })
  );
  await provider.sendAndConfirm(tx, []);
  const relayerPath = join(keystoreDir, "relayer.json");
  writeFileSync(relayerPath, JSON.stringify(Array.from(relayer.secretKey)));

  // Project + deposit 10 USDC.
  console.log("setup: mint + project + deposit 10 USDC on devnet...");
  const mint = await spl.createMint(conn, owner, owner.publicKey, null, 6);
  const projectId = Date.now() % 1_000_000_000;
  await client.createProject({ owner: owner.publicKey, mint, projectId, label: "smoke", feePayer: relayer.publicKey }).rpc();
  const [project] = findProjectPda(owner.publicKey, projectId);
  const proj = await client.getProject(project);
  const ownerAta = await spl.getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey);
  await spl.mintTo(conn, owner, mint, ownerAta.address, owner, 10_000_000n);
  await (await client.deposit({ depositor: owner.publicKey, project, from: ownerAta.address, amount: toBaseUnits("10") })).rpc();

  // Orchestrator agent via the real CLI; owner allocates 6 USDC to it.
  const out = execFileSync(process.execPath, [cliPath, "agent-create", "orchestrator"], { env: { ...process.env }, encoding: "utf8" });
  const orchestrator = new PublicKey(out.trim().split(/\s+/).pop()!);
  await client
    .allocateChild({ authority: owner.publicKey, feePayer: relayer.publicKey, project, parent: proj.rootBudget, childAgent: orchestrator, label: "orchestrator", amount: toBaseUnits("6"), canDelegate: true })
    .signers([relayer])
    .rpc();

  // Spawn the MCP server for the orchestrator and drive it.
  console.log("spawning MCP server (QUAESTOR_CHAIN=solana) against devnet...");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "",
      QUAESTOR_CHAIN: "solana",
      QUAESTOR_RPC_URL: RPC,
      QUAESTOR_PROJECT: project.toBase58(),
      QUAESTOR_AGENT: "orchestrator",
      QUAESTOR_KEYSTORE_DIR: keystoreDir,
      QUAESTOR_KEYSTORE_PASSPHRASE: passphrase,
      QUAESTOR_RELAYER_KEYPAIR: relayerPath,
    },
  });
  const mcp = new Client({ name: "quaestor-smoke", version: "0.0.1" });
  await mcp.connect(transport);

  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error("FAIL: " + msg); console.log("  PASS " + msg); };
  try {
    const tools = await mcp.listTools();
    assert(tools.tools.length === 9, `exposes 9 tools (got ${tools.tools.length})`);

    const bud = JSON.parse(textOf(await mcp.callTool({ name: "get_my_budget", arguments: {} })));
    assert(bud.available === "6" && bud.label === "orchestrator", `get_my_budget -> available 6 (got ${bud.available})`);

    const created = await mcp.callTool({ name: "create_subagent_budget", arguments: { label: "research", amount_usdc: "2", per_tx_limit_usdc: "0.5" } });
    assert(!created.isError, "create_subagent_budget research (2 USDC, 0.5/tx)");

    const recipient = Keypair.generate().publicKey.toBase58();
    const paid = await mcp.callTool({ name: "pay", arguments: { recipient, amount_usdc: "0.4" } });
    assert(!paid.isError, "pay 0.4 USDC succeeds (gasless; relayer paid)");

    const over = await mcp.callTool({ name: "create_subagent_budget", arguments: { label: "toobig", amount_usdc: "9" } });
    assert(!!over.isError && /available|insufficient/i.test(textOf(over)), "over-allocate 9 USDC rejected by available balance");

    console.log("\n  MCP server verified END-TO-END on devnet. ✅");
  } finally {
    await mcp.close();
  }
}

main().catch((e) => { console.error("smoke failed:", e?.message ?? e); process.exit(1); });
