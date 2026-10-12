/**
 * Quaestor x402 demo (self-contained, on anvil).
 *
 * Thesis: an AI agent pays for a paywalled HTTP resource DIRECTLY FROM ITS ON-CHAIN-ENFORCED
 * Quaestor budget, so the per-transaction / daily / freeze limits apply to real API payments.
 *
 * Flow:
 *   1. Deploy MockUSDC + ERC2771Forwarder + Quaestor (reusing contracts/out artifacts).
 *   2. Owner creates a project, deposits 10 USDC, and allocates an agent a 5 USDC budget
 *      with a 0.50 USDC per-transaction limit.
 *   3. Start the x402 resource server (scripts/x402-demo-server.ts) in-process.
 *   4. (A) Agent fetches GET /premium -> HTTP 402 -> pays 0.25 USDC from its budget (gasless,
 *          budget-enforced) -> retries with the on-chain proof -> gets the premium data. SUCCESS.
 *   5. (B) Agent fetches a resource priced at 3 USDC -> the Quaestor per-tx limit (0.50) REJECTS
 *          the spend before any HTTP retry -> "BLOCKED by budget". The resource is never served.
 *
 * Run with the WSL runner (scripts/x402-demo.sh) which starts/kills anvil, or point at a running
 * node via QUAESTOR_EVM_RPC_URL and `pnpm exec ts-node --transpile-only scripts/x402-demo.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  QuaestorEvmClient,
  ERC20_ABI,
  QUAESTOR_ABI,
  projectKeyOf,
  budgetKeyOf,
  labelToBytes32,
  toBaseUnits,
  fromBaseUnits,
  getAddress,
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  privateKeyToAccount,
  generatePrivateKey,
  type Address,
  type Hex,
  type PublicClient,
} from "../packages/evm-sdk/dist/index.js";
import { x402Fetch } from "../packages/mcp-server/dist/x402.js";
import { createX402Server } from "./x402-demo-server";

const RPC = process.env.QUAESTOR_EVM_RPC_URL || "http://127.0.0.1:8545";
const OWNER_PK = (process.env.QUAESTOR_EVM_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as Hex; // anvil #0
const OUT_DIR = process.env.QUAESTOR_CONTRACTS_OUT || join(__dirname, "../contracts/out");
const PORT = Number(process.env.X402_PORT || 4021);

const L = (s = "") => console.log(s);
const step = (n: number, t: string) =>
  L(`\n${"=".repeat(70)}\n  STEP ${n}  ·  ${t}\n${"=".repeat(70)}`);

function loadArtifact(rel: string): { abi: any; bytecode: Hex } {
  const art = JSON.parse(readFileSync(join(OUT_DIR, rel), "utf8"));
  return { abi: art.abi, bytecode: art.bytecode.object as Hex };
}

function allocArgs(opts: {
  parentKey: Hex;
  childAgent: Address;
  label: Hex;
  amount: bigint;
  perTx: bigint;
}): readonly unknown[] {
  return [
    opts.parentKey,
    opts.childAgent,
    opts.label,
    opts.amount,
    true, // hasPerTx
    opts.perTx,
    false, // hasPeriod
    0n, // period
    0n, // periodSeconds
    false, // hasExpiry
    0n, // expiresAt
    false, // canDelegate
    4, // maxChildDepth
    [], // allowlist (ANY recipient)
  ];
}

async function main() {
  const transport = http(RPC);
  const probe = createPublicClient({ transport });
  const chainId = await probe.getChainId();
  const chain = defineChain({
    id: chainId,
    name: `anvil-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const owner = privateKeyToAccount(OWNER_PK);
  const ownerWallet = createWalletClient({ account: owner, chain, transport }); // also the relayer
  const waitTx = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

  L("\n  QUAESTOR x402 — an agent pays a paywalled URL from its on-chain mandate.");
  L(`  rpc: ${RPC}   chainId: ${chainId}   owner/relayer: ${owner.address}`);

  // -------------------------------------------------------------------------
  step(1, "Deploy MockUSDC + Forwarder + Quaestor, create project, deposit 10 USDC");
  // -------------------------------------------------------------------------
  const usdcArt = loadArtifact("Deploy.s.sol/MockUSDC.json");
  const usdc = (await waitTx(
    await ownerWallet.deployContract({ abi: usdcArt.abi, bytecode: usdcArt.bytecode, args: [] })
  )).contractAddress as Address;
  const fwdArt = loadArtifact("ERC2771Forwarder.sol/ERC2771Forwarder.json");
  const forwarder = (await waitTx(
    await ownerWallet.deployContract({
      abi: fwdArt.abi,
      bytecode: fwdArt.bytecode,
      args: ["Quaestor Forwarder"],
    })
  )).contractAddress as Address;
  const qArt = loadArtifact("Quaestor.sol/Quaestor.json");
  const quaestorAddr = (await waitTx(
    await ownerWallet.deployContract({ abi: qArt.abi, bytecode: qArt.bytecode, args: [forwarder] })
  )).contractAddress as Address;
  L(`  MockUSDC:  ${usdc}`);
  L(`  Forwarder: ${forwarder}`);
  L(`  Quaestor:  ${quaestorAddr}`);

  const client = new QuaestorEvmClient({ publicClient, contract: quaestorAddr, forwarder, chainId });
  const projectId = BigInt(Date.now() % 1_000_000_000);
  const projectKey = projectKeyOf(owner.address, projectId);
  const rootBudget = budgetKeyOf(projectKey, owner.address);

  await waitTx(
    await ownerWallet.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [owner.address, toBaseUnits("10")],
    })
  );
  await waitTx(
    await ownerWallet.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [quaestorAddr, toBaseUnits("10")],
    })
  );
  await waitTx(
    await client.createProjectDirect({
      walletClient: ownerWallet,
      projectId,
      label: "x402-demo",
      mint: usdc,
      feePayer: owner.address,
    })
  );
  await waitTx(await client.depositDirect({ walletClient: ownerWallet, projectKey, amount: toBaseUnits("10") }));
  L(`  project ${projectKey} funded with 10 USDC`);

  // -------------------------------------------------------------------------
  step(2, "Owner grants the agent a 5 USDC mandate with a 0.50 USDC per-tx limit");
  // -------------------------------------------------------------------------
  const agent = privateKeyToAccount(generatePrivateKey());
  const agentBudget = budgetKeyOf(projectKey, agent.address);
  await waitTx(
    await client.send({
      walletClient: ownerWallet,
      fn: "allocateChild",
      args: allocArgs({
        parentKey: rootBudget,
        childAgent: agent.address,
        label: labelToBytes32("api-agent"),
        amount: toBaseUnits("5"),
        perTx: toBaseUnits("0.5"),
      }),
    })
  );
  L(`  agent ${agent.address} funded: 5 USDC, max 0.50 USDC/tx (gasless; relayer pays gas)`);

  // -------------------------------------------------------------------------
  step(3, "Start the x402 resource server (merchant = fresh address)");
  // -------------------------------------------------------------------------
  const merchant = privateKeyToAccount(generatePrivateKey()).address;
  const server: Server = createX402Server({
    port: PORT,
    network: "anvil",
    rpcUrl: RPC,
    contract: quaestorAddr,
    asset: usdc,
    payTo: merchant,
    maxAmountRequired: toBaseUnits("0.25").toString(), // /premium default price = 0.25 USDC
    description: "Premium market data (x402)",
  });
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  const base = `http://127.0.0.1:${PORT}`;
  L(`  serving ${base}/premium   merchant payTo=${merchant}   asset=${usdc}`);

  // The agent's x402 ops: a minimal budget-enforced ChainOps adapter over the deployed contracts.
  // ops.pay mirrors EvmOps.pay — preflight (so a limit revert surfaces) + gasless forwarded spend.
  const agentOps = {
    networkLabel: () => "anvil",
    payerAddress: () => agent.address as string,
    async pay(recipient: string, amountUsdc: string) {
      const to = getAddress(recipient);
      const amount = toBaseUnits(amountUsdc);
      await (publicClient.simulateContract as (o: unknown) => Promise<unknown>)({
        address: quaestorAddr,
        abi: QUAESTOR_ABI,
        functionName: "spend",
        args: [agentBudget, to, amount, `0x${"0".repeat(64)}`, `0x${"0".repeat(64)}`],
        account: agent.address,
      });
      const signature = await client.spendForwarded({
        agentAccount: agent,
        relayerWalletClient: ownerWallet,
        budgetKey: agentBudget,
        recipient: to,
        amount,
      });
      await waitTx(signature);
      return { signature, recipient: to as string, amount: amountUsdc };
    },
  };

  let aData = "";
  let aProof = "";
  let bBlocked = false;
  let bReason = "";
  try {
    // ---------------------------------------------------------------------
    step(4, "(A) Agent fetches /premium (0.25 USDC) — pays from its mandate, gets the data");
    // ---------------------------------------------------------------------
    const a = await x402Fetch(agentOps, `${base}/premium`);
    const body = a.body as { data?: string };
    aData = body?.data ?? "";
    aProof = a.payment?.txHash ?? "";
    L(`  HTTP ${a.status}`);
    L(`  paid ${a.payment?.amount} USDC to ${a.payment?.payTo}`);
    L(`  proof tx: ${aProof}`);
    L(`  premium data received: ${JSON.stringify(a.body)}`);

    // ---------------------------------------------------------------------
    step(5, "(B) Agent fetches a 3 USDC resource — Quaestor per-tx limit REJECTS it");
    // ---------------------------------------------------------------------
    try {
      await x402Fetch(agentOps, `${base}/premium?amount=${toBaseUnits("3").toString()}`);
      L("  (!) unexpected: the 3 USDC payment went through");
    } catch (e: any) {
      bBlocked = true;
      // The Quaestor custom-error name is nested in the viem revert (as EvmOps.toFriendlyError reads it).
      const errorName =
        e?.cause?.data?.errorName ??
        e?.data?.errorName ??
        e?.cause?.cause?.data?.errorName ??
        "";
      const flat = `${errorName} ${e?.shortMessage ?? e?.message ?? String(e)}`;
      bReason = errorName || (e?.shortMessage ?? e?.message ?? String(e));
      const perTx = /PerTxLimitExceeded|per-?transaction/i.test(flat);
      L(`  BLOCKED by the mandate — the agent's 0.50 USDC per-tx limit rejected the 3 USDC payment`);
      L(`  reason: ${perTx ? "PerTxLimitExceeded (per-transaction limit)" : bReason}`);
      L("  the paywalled resource was NEVER fetched.");
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // -------------------------------------------------------------------------
  step(6, "On-chain result");
  // -------------------------------------------------------------------------
  const merchBal = (await publicClient.readContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [merchant],
  })) as bigint;
  L(`  merchant on-chain USDC balance: ${fromBaseUnits(merchBal)} USDC`);

  // -------------------------------------------------------------------------
  L(`\n  ${"-".repeat(70)}`);
  const checks: [string, boolean][] = [
    ["(A) agent received the premium data", aData === "the answer is 42"],
    ["(A) payment produced an on-chain proof tx", /^0x[0-9a-fA-F]{64}$/.test(aProof)],
    ["(A) merchant actually received 0.25 USDC on-chain", merchBal === toBaseUnits("0.25")],
    ["(B) the 3 USDC payment was blocked by the mandate", bBlocked],
    ["(B) rejection was the per-tx limit", /PerTxLimitExceeded|per-?transaction/i.test(bReason)],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    L(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  L(`  ${"-".repeat(70)}`);
  if (!ok) throw new Error("x402 demo assertions failed");
  L('\n  All checks passed.  An agent paid a paywalled URL from its on-chain-enforced mandate —');
  L('  and the same mandate blocked an over-limit payment.  "Give your agent a mandate, not a wallet."\n');
}

main().catch((e) => {
  console.error("\nx402-demo failed:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
