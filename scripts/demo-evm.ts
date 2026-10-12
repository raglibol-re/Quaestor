/**
 * Quaestor EVM live demo (gasless). Mirrors scripts/demo/run-demo.ts, but for the
 * Solidity/viem port with ERC-2771 meta-transactions:
 *   create project + deposit -> orchestrator budget (owner, direct)
 *   -> research sub-agent allocated GASLESS by the orchestrator (0 ETH)
 *   -> research spends GASLESS -> over-limit spend REJECTED
 *   -> freeze orchestrator stops the sub-tree -> revoke + reclaim returns unused funds.
 *
 * Env:
 *   QUAESTOR_EVM_RPC_URL   (default http://127.0.0.1:8545)
 *   QUAESTOR_EVM_PRIVATE_KEY  (owner + relayer; must hold ETH. default = anvil account #0)
 *   QUAESTOR_CONTRACT / QUAESTOR_FORWARDER / QUAESTOR_USDC  (optional; else deployed fresh)
 *   QUAESTOR_CONTRACTS_OUT  (default ../contracts/out relative to this file)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QuaestorEvmClient,
  ERC20_ABI,
  projectKeyOf,
  budgetKeyOf,
  labelToBytes32,
  decodeLabel,
  toBaseUnits,
  fromBaseUnits,
  availableOf,
  statusName,
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  privateKeyToAccount,
  generatePrivateKey,
  type BudgetNode,
} from "../packages/evm-sdk/dist/index.js";

const RPC = process.env.QUAESTOR_EVM_RPC_URL || "http://127.0.0.1:8545";
const OWNER_PK = (process.env.QUAESTOR_EVM_PRIVATE_KEY ||
  // anvil default account #0 (funded)
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`;
const OUT_DIR = process.env.QUAESTOR_CONTRACTS_OUT || join(__dirname, "../contracts/out");

const L = (s = "") => console.log(s);
const step = (n: number, t: string) =>
  L(`\n${"=".repeat(68)}\n  STEP ${n}  ·  ${t}\n${"=".repeat(68)}`);
const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`;

function loadArtifact(rel: string): { abi: any; bytecode: `0x${string}` } {
  const art = JSON.parse(readFileSync(join(OUT_DIR, rel), "utf8"));
  return { abi: art.abi, bytecode: art.bytecode.object as `0x${string}` };
}

/** Build the 14-arg allocateChild tuple (used for the owner's direct allocation). */
function allocArgs(opts: {
  parentKey: `0x${string}`;
  childAgent: `0x${string}`;
  label: `0x${string}`;
  amount: bigint;
  perTx?: bigint;
  canDelegate?: boolean;
  maxChildDepth?: number;
}): readonly unknown[] {
  return [
    opts.parentKey,
    opts.childAgent,
    opts.label,
    opts.amount,
    opts.perTx !== undefined,
    opts.perTx ?? 0n,
    false, // hasPeriod
    0n, // period
    0n, // periodSeconds
    false, // hasExpiry
    0n, // expiresAt
    opts.canDelegate ?? false,
    opts.maxChildDepth ?? 4,
    [], // allowlist
  ];
}

async function main() {
  const transport = http(RPC);
  const probe = createPublicClient({ transport });
  const chainId = await probe.getChainId();
  const chain = defineChain({
    id: chainId,
    name: `quaestor-evm-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });

  const publicClient = createPublicClient({ chain, transport });
  const owner = privateKeyToAccount(OWNER_PK);
  // owner doubles as the gas-paying relayer for agent meta-transactions
  const ownerWallet = createWalletClient({ account: owner, chain, transport });

  const waitTx = async (hash: `0x${string}`) =>
    publicClient.waitForTransactionReceipt({ hash });

  L("\n  QUAESTOR (EVM) — Give agents budgets, not keys.");
  L(`  rpc: ${RPC}   chainId: ${chainId}`);
  L(`  owner / relayer: ${owner.address}`);

  // ---------------------------------------------------------------------
  step(1, "Owner deploys contracts, mints 10 USDC, creates project, deposits 10 USDC");
  // ---------------------------------------------------------------------
  let usdc = process.env.QUAESTOR_USDC as `0x${string}` | undefined;
  let forwarder = process.env.QUAESTOR_FORWARDER as `0x${string}` | undefined;
  let quaestorAddr = process.env.QUAESTOR_CONTRACT as `0x${string}` | undefined;

  if (!usdc) {
    const art = loadArtifact("Deploy.s.sol/MockUSDC.json");
    const hash = await ownerWallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args: [] });
    usdc = (await waitTx(hash)).contractAddress!;
    L(`  MockUSDC deployed:        ${usdc}`);
  }
  if (!forwarder) {
    const art = loadArtifact("ERC2771Forwarder.sol/ERC2771Forwarder.json");
    const hash = await ownerWallet.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: ["Quaestor Forwarder"],
    });
    forwarder = (await waitTx(hash)).contractAddress!;
    L(`  ERC2771Forwarder deployed: ${forwarder}`);
  }
  if (!quaestorAddr) {
    const art = loadArtifact("Quaestor.sol/Quaestor.json");
    const hash = await ownerWallet.deployContract({
      abi: art.abi,
      bytecode: art.bytecode,
      args: [forwarder],
    });
    quaestorAddr = (await waitTx(hash)).contractAddress!;
    L(`  Quaestor deployed:        ${quaestorAddr}`);
  }

  const client = new QuaestorEvmClient({
    publicClient,
    contract: quaestorAddr,
    forwarder,
    chainId,
  });

  const projectId = BigInt(Date.now() % 1_000_000_000);
  const projectKey = projectKeyOf(owner.address, projectId);
  const rootBudget = budgetKeyOf(projectKey, owner.address);

  // mint + approve + create + deposit (owner pays its own gas — direct path)
  await waitTx(
    await ownerWallet.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [owner.address, toBaseUnits("10")],
    }),
  );
  await waitTx(
    await ownerWallet.writeContract({
      address: usdc,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [quaestorAddr, toBaseUnits("10")],
    }),
  );
  await waitTx(
    await client.createProjectDirect({
      walletClient: ownerWallet,
      projectId,
      label: "demo",
      mint: usdc,
      feePayer: owner.address,
    }),
  );
  const depHash = await client.depositDirect({
    walletClient: ownerWallet,
    projectKey,
    amount: toBaseUnits("10"),
  });
  await waitTx(depHash);
  L(`  project key: ${projectKey}`);
  L(`  deposited 10 USDC into the project vault   tx ${depHash}`);

  // ---------------------------------------------------------------------
  step(2, "Owner allocates the orchestrator a 6 USDC budget (DIRECT)");
  // ---------------------------------------------------------------------
  const orch = privateKeyToAccount(generatePrivateKey());
  const orchBudget = budgetKeyOf(projectKey, orch.address);
  const aHash = await client.send({
    walletClient: ownerWallet,
    fn: "allocateChild",
    args: allocArgs({
      parentKey: rootBudget,
      childAgent: orch.address,
      label: labelToBytes32("orchestrator"),
      amount: toBaseUnits("6"),
      canDelegate: true,
    }),
  });
  await waitTx(aHash);
  L(`  orchestrator ${short(orch.address)} funded with 6 USDC   tx ${aHash}`);

  // ---------------------------------------------------------------------
  step(3, "Orchestrator delegates 2 USDC to a research sub-agent (max 0.50/tx) — GASLESS");
  // ---------------------------------------------------------------------
  const research = privateKeyToAccount(generatePrivateKey());
  const researchBudget = budgetKeyOf(projectKey, research.address);
  const orchEth = await publicClient.getBalance({ address: orch.address });
  L(`  orchestrator agent ETH balance: ${orchEth}   (signs the request; relayer pays gas)`);
  const r3 = await client.allocateChildForwarded({
    agentAccount: orch,
    relayerWalletClient: ownerWallet,
    parentKey: orchBudget,
    childAgent: research.address,
    label: "research",
    amount: toBaseUnits("2"),
    perTx: toBaseUnits("0.5"),
    canDelegate: false,
  });
  await waitTx(r3);
  L(`  research ${short(research.address)} funded with 2 USDC, 0.50/tx cap   tx ${r3}`);

  // ---------------------------------------------------------------------
  step(4, "Research agent pays for data: 2 × 0.50 USDC — GASLESS");
  // ---------------------------------------------------------------------
  const merchant = privateKeyToAccount(generatePrivateKey()).address;
  const resEth = await publicClient.getBalance({ address: research.address });
  L(`  research agent ETH balance: ${resEth}`);
  let successfulSpends = 0;
  for (let i = 1; i <= 2; i++) {
    const h = await client.spendForwarded({
      agentAccount: research,
      relayerWalletClient: ownerWallet,
      budgetKey: researchBudget,
      recipient: merchant,
      amount: toBaseUnits("0.5"),
    });
    await waitTx(h);
    successfulSpends++;
    L(`  paid 0.50 USDC   tx ${h}`);
  }
  const merchBal = (await publicClient.readContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [merchant],
  })) as bigint;
  L(`  merchant received: ${fromBaseUnits(merchBal)} USDC`);

  // ---------------------------------------------------------------------
  step(5, "Research tries to spend 3 USDC -> REJECTED on-chain (per-tx limit)");
  // ---------------------------------------------------------------------
  let rejections = 0;
  try {
    await client.spendForwarded({
      agentAccount: research,
      relayerWalletClient: ownerWallet,
      budgetKey: researchBudget,
      recipient: merchant,
      amount: toBaseUnits("3"),
    });
    L("  (!) unexpected: the 3 USDC payment went through");
  } catch {
    rejections++;
    L("  BLOCKED: 3 USDC exceeds the 0.50 USDC per-transaction limit");
  }

  // ---------------------------------------------------------------------
  step(6, "Owner FREEZES the orchestrator -> the whole sub-tree stops instantly");
  // ---------------------------------------------------------------------
  const fHash = await client.setStatusDirect({
    walletClient: ownerWallet,
    budgetKey: orchBudget,
    freeze: true,
  });
  await waitTx(fHash);
  L(`  orchestrator frozen   tx ${fHash}`);
  try {
    await client.spendForwarded({
      agentAccount: research,
      relayerWalletClient: ownerWallet,
      budgetKey: researchBudget,
      recipient: merchant,
      amount: toBaseUnits("0.25"),
    });
    L("  (!) unexpected: research could still pay");
  } catch {
    rejections++;
    L("  BLOCKED: research payment rejected because an ancestor (orchestrator) is frozen");
  }

  // ---------------------------------------------------------------------
  step(7, "Owner revokes research, then reclaims its unused 1 USDC");
  // ---------------------------------------------------------------------
  await waitTx(
    await client.revokeDirect({ walletClient: ownerWallet, budgetKey: researchBudget }),
  );
  const availBefore = await client.available(orchBudget);
  const rcHash = await client.reclaimDirect({
    walletClient: ownerWallet,
    parentKey: orchBudget,
    childKey: researchBudget,
  });
  await waitTx(rcHash);
  const availAfter = await client.available(orchBudget);
  L(`  reclaimed research's unused 1.00 USDC   tx ${rcHash}`);
  L(
    `  orchestrator available: ${fromBaseUnits(availBefore)} -> ${fromBaseUnits(availAfter)} USDC`,
  );

  // ---------------------------------------------------------------------
  step(8, "Final budget tree");
  // ---------------------------------------------------------------------
  const tree = await client.fetchBudgetTree(projectKey);
  const printNode = (n: BudgetNode, d: number) => {
    const b = n.budget;
    L(
      `  ${"  ".repeat(d)}- ${decodeLabel(b.label) || "root"} [${statusName(b.status)}]  ` +
        `alloc=${fromBaseUnits(b.allocated)} spent=${fromBaseUnits(b.spent)} ` +
        `reserved=${fromBaseUnits(b.reservedForChildren)} avail=${fromBaseUnits(availableOf(b))}`,
    );
    n.children.forEach((c) => printNode(c, d + 1));
  };
  if (tree) printNode(tree, 0);

  // ---------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------
  L(`\n  ${"-".repeat(68)}`);
  const reclaimed = availAfter - availBefore;
  const checks: [string, boolean][] = [
    ["two gasless spends succeeded", successfulSpends === 2],
    ["two over-policy actions were rejected", rejections === 2],
    ["reclaim returned 1.00 USDC to the orchestrator", reclaimed === toBaseUnits("1")],
    ["merchant received exactly 1.00 USDC", merchBal === toBaseUnits("1")],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    L(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  L(`  ${"-".repeat(68)}`);
  if (!ok) throw new Error("demo assertions failed");
  L('\n  All checks passed.  "Give agents budgets, not keys."\n');
}

main().catch((e) => {
  console.error("\ndemo-evm failed:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
