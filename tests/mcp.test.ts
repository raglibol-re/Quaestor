import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { QuaestorClient, findProjectPda, toBaseUnits } from "@quaestor/sdk";
import { assert } from "chai";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const serverPath = join(process.cwd(), "packages/mcp-server/dist/server.js");
const cliPath = join(process.cwd(), "packages/mcp-server/dist/cli.js");

function textOf(res: any): string {
  return (res.content ?? [])
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n");
}

async function connect(agentName: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "inherit",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      QUAESTOR_DEBUG: process.env.QUAESTOR_DEBUG ?? "",
      QUAESTOR_RPC_URL: process.env.QUAESTOR_RPC_URL!,
      QUAESTOR_PROJECT: process.env.QUAESTOR_PROJECT!,
      QUAESTOR_AGENT: agentName,
      QUAESTOR_KEYSTORE_DIR: process.env.QUAESTOR_KEYSTORE_DIR!,
      QUAESTOR_KEYSTORE_PASSPHRASE: process.env.QUAESTOR_KEYSTORE_PASSPHRASE!,
      QUAESTOR_RELAYER_KEYPAIR: process.env.QUAESTOR_RELAYER_KEYPAIR!,
    },
  });
  const c = new Client({ name: "quaestor-test", version: "0.0.1" });
  await c.connect(transport);
  return c;
}

describe("quaestor MCP server", () => {
  let recipient: string;

  before(async function () {
    this.timeout(120000);
    const keystoreDir = mkdtempSync(join(tmpdir(), "quaestor-ks-"));
    process.env.QUAESTOR_KEYSTORE_DIR = keystoreDir;
    process.env.QUAESTOR_KEYSTORE_PASSPHRASE = "test-pass-123";

    const provider = AnchorProvider.env();
    anchor.setProvider(provider);
    process.env.QUAESTOR_RPC_URL = process.env.ANCHOR_PROVIDER_URL;
    const wallet = provider.wallet as anchor.Wallet;
    const owner = wallet.payer;
    const client = QuaestorClient.fromProvider(provider);

    // relayer (fee payer) — funded on the local validator
    const relayer = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(relayer.publicKey, 10 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    const relayerPath = join(keystoreDir, "relayer.json");
    writeFileSync(relayerPath, JSON.stringify(Array.from(relayer.secretKey)));
    process.env.QUAESTOR_RELAYER_KEYPAIR = relayerPath;

    // mint + project + deposit 100 USDC
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const mint = await createMint(provider.connection, owner, owner.publicKey, null, 6);
    const projectId = 1;
    await client
      .createProject({ owner: owner.publicKey, mint, projectId, label: "demo", feePayer: relayer.publicKey })
      .rpc();
    const [project] = findProjectPda(owner.publicKey, projectId);
    process.env.QUAESTOR_PROJECT = project.toBase58();
    const proj = await client.getProject(project);
    const ownerAta = await getOrCreateAssociatedTokenAccount(provider.connection, owner, mint, owner.publicKey);
    await mintTo(provider.connection, owner, mint, ownerAta.address, owner, 100_000_000n);
    await (
      await client.deposit({ depositor: owner.publicKey, project, from: ownerAta.address, amount: toBaseUnits("100") })
    ).rpc();

    // create the orchestrator agent in the keystore (via the real CLI), then owner allocates 6 USDC to it
    const out = execFileSync(process.execPath, [cliPath, "agent-create", "orchestrator"], {
      env: { ...process.env },
      encoding: "utf8",
    });
    const orchestratorPubkey = new PublicKey(out.trim().split(/\s+/).pop()!);
    await client
      .allocateChild({
        authority: owner.publicKey,
        feePayer: relayer.publicKey,
        project,
        parent: proj.rootBudget,
        childAgent: orchestratorPubkey,
        label: "orchestrator",
        amount: toBaseUnits("6"),
        canDelegate: true,
      })
      .signers([relayer])
      .rpc();

    recipient = Keypair.generate().publicKey.toBase58();
  });

  it("orchestrator: budget, delegate, list, pay", async function () {
    this.timeout(240000);
    const orch = await connect("orchestrator");
    try {
      const tools = await orch.listTools();
      assert.equal(tools.tools.length, 9, "exposes 9 tools");

      const bud: any = (await orch.callTool({ name: "get_my_budget", arguments: {} })).structuredContent;
      assert.equal(bud.available, "6");
      assert.equal(bud.label, "orchestrator");

      const created = await orch.callTool({
        name: "create_subagent_budget",
        arguments: { label: "research", amount_usdc: "2", per_tx_limit_usdc: "0.5" },
      });
      assert.notOk(created.isError, textOf(created));

      const list: any[] = (
        (await orch.callTool({ name: "list_subagents", arguments: {} })).structuredContent as any
      ).subagents;
      assert.equal(list.length, 1);
      assert.equal(list[0].label, "research");

      const paid = await orch.callTool({ name: "pay", arguments: { recipient, amount_usdc: "0.5" } });
      assert.notOk(paid.isError, textOf(paid));
    } finally {
      await orch.close();
    }
  });

  it("research sub-agent: per-tx limit enforced, then a valid pay", async function () {
    this.timeout(240000);
    const research = await connect("orchestrator.research");
    try {
      const over = await research.callTool({ name: "pay", arguments: { recipient, amount_usdc: "1.0" } });
      assert.ok(over.isError, "over per-tx limit should error");
      assert.match(textOf(over), /per-transaction/i);

      const ok = await research.callTool({ name: "pay", arguments: { recipient, amount_usdc: "0.4" } });
      assert.notOk(ok.isError, textOf(ok));

      const rbud: any = (await research.callTool({ name: "get_my_budget", arguments: {} })).structuredContent;
      assert.equal(rbud.spent, "0.4");
      assert.equal(rbud.available, "1.6");
    } finally {
      await research.close();
    }
  });
});
