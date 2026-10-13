/**
 * Populate a deployed EVM Quaestor with a realistic, "lived-in" demo project: a 4-level tree with
 * real gasless spends to several merchants and a frozen branch — so the explorer and dashboard show
 * actual usage. All agents hold ZERO native gas; the relayer (owner) pays. Idempotent-ish: pick a
 * fresh QUAESTOR_PROJECT_ID if the chosen one already exists.
 *
 * Env: QUAESTOR_EVM_RPC_URL, QUAESTOR_CHAIN_ID, QUAESTOR_CONTRACT, QUAESTOR_FORWARDER,
 *      QUAESTOR_USDC, QUAESTOR_EVM_PRIVATE_KEY, [QUAESTOR_PROJECT_ID=7].
 */
import {
  ERC20_ABI,
  QuaestorEvmClient,
  availableOf,
  budgetKeyOf,
  createPublicClient,
  createWalletClient,
  decodeLabel,
  defineChain,
  fromBaseUnits,
  generatePrivateKey,
  http,
  labelToBytes32,
  privateKeyToAccount,
  projectKeyOf,
  statusName,
  toBaseUnits,
} from "../packages/evm-sdk/dist/index.js";
import type { BudgetNode, Hex, LocalAccount } from "../packages/evm-sdk/dist/index.js";

const RPC = process.env.QUAESTOR_EVM_RPC_URL as string;
const CHAIN_ID = Number(process.env.QUAESTOR_CHAIN_ID || "84532");
const CONTRACT = process.env.QUAESTOR_CONTRACT as `0x${string}`;
const FORWARDER = process.env.QUAESTOR_FORWARDER as `0x${string}`;
const USDC = process.env.QUAESTOR_USDC as `0x${string}`;
const KEY = process.env.QUAESTOR_EVM_PRIVATE_KEY as `0x${string}`;
let PROJECT_ID = BigInt(process.env.QUAESTOR_PROJECT_ID || "7");
// Some chains (e.g. Tempo) meter gas several× higher, so the forwarder's default inner gas is too
// low. Override per-chain with QUAESTOR_FWD_GAS.
const FWD_GAS = process.env.QUAESTOR_FWD_GAS ? BigInt(process.env.QUAESTOR_FWD_GAS) : undefined;

async function main() {
  const chain = defineChain({ id: CHAIN_ID, name: "base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const owner = privateKeyToAccount(KEY);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const client = new QuaestorEvmClient({ publicClient, contract: CONTRACT, forwarder: FORWARDER, chainId: CHAIN_ID });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const wait = async (hash: Hex, what: string) => {
    const r = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ${what}  (${r.status})`);
    if (r.status !== "success") throw new Error(`${what} reverted`);
    await sleep(6000); // public-RPC propagation
  };

  // Pick a free project id.
  for (;;) {
    const pk = projectKeyOf(owner.address, PROJECT_ID);
    if (!(await client.getProject(pk)).exists) break;
    PROJECT_ID += 1n;
  }
  const projectKey = projectKeyOf(owner.address, PROJECT_ID);
  console.log(`project #${PROJECT_ID}  key ${projectKey}\n`);

  // Fund.
  await wait(await client.createProjectDirect({ walletClient: ownerWallet, projectId: PROJECT_ID, label: "acme-research", mint: USDC, feePayer: owner.address }), "create project 'acme-research'");
  await wait(await ownerWallet.writeContract({ address: USDC, abi: ERC20_ABI as never, functionName: "mint", args: [owner.address, toBaseUnits("50")], account: owner, chain }), "mint 50 USDC");
  await wait(await ownerWallet.writeContract({ address: USDC, abi: ERC20_ABI as never, functionName: "approve", args: [CONTRACT, toBaseUnits("50")], account: owner, chain }), "approve");
  await wait(await client.depositDirect({ walletClient: ownerWallet, projectKey, amount: toBaseUnits("50") }), "deposit 50 USDC");

  // Tree (all agents hold 0 ETH; forwarded = gasless).
  const rootBudget = budgetKeyOf(projectKey, owner.address);
  const orch = privateKeyToAccount(generatePrivateKey());
  await wait(await client.send({ walletClient: ownerWallet, fn: "allocateChild", args: [rootBudget, orch.address, labelToBytes32("orchestrator"), toBaseUnits("30"), false, 0n, false, 0n, 0n, false, 0n, true, 4, []] }), "owner -> orchestrator 30 USDC");
  const orchBudget = budgetKeyOf(projectKey, orch.address);

  const alloc = async (parentAgent: LocalAccount, parentKey: Hex, child: LocalAccount, label: string, amount: string, perTx: string, canDelegate = false) => {
    await wait(
      await client.allocateChildForwarded({ agentAccount: parentAgent, relayerWalletClient: ownerWallet, parentKey, childAgent: child.address, label, amount: toBaseUnits(amount), perTx: toBaseUnits(perTx), canDelegate, gas: FWD_GAS }),
      `${label} <- ${amount} USDC (${perTx}/tx, gasless)`
    );
  };
  const research = privateKeyToAccount(generatePrivateKey());
  const writer = privateKeyToAccount(generatePrivateKey());
  const scraper = privateKeyToAccount(generatePrivateKey());
  await alloc(orch, orchBudget, research, "research", "12", "3", true);
  await alloc(orch, orchBudget, writer, "writer", "6", "2");
  const researchBudget = budgetKeyOf(projectKey, research.address);
  await alloc(research, researchBudget, scraper, "scraper", "4", "1");
  const scraperBudget = budgetKeyOf(projectKey, scraper.address);
  const writerBudget = budgetKeyOf(projectKey, writer.address);

  // Real spends to a handful of merchants (within each budget's per-tx limit).
  const merchants = Array.from({ length: 3 }, () => privateKeyToAccount(generatePrivateKey()).address);
  const spend = async (agent: LocalAccount, budget: Hex, m: number, amount: string, who: string) => {
    await wait(
      await client.spendForwarded({ agentAccount: agent, relayerWalletClient: ownerWallet, budgetKey: budget, recipient: merchants[m], amount: toBaseUnits(amount), gas: FWD_GAS }),
      `${who} pays ${amount} USDC -> merchant${m + 1} (gasless)`
    );
  };
  await spend(research, researchBudget, 0, "2.5", "research");
  await spend(research, researchBudget, 1, "1.0", "research");
  await spend(scraper, scraperBudget, 2, "0.8", "scraper");
  await spend(scraper, scraperBudget, 0, "0.5", "scraper");
  await spend(writer, writerBudget, 1, "1.5", "writer");

  // Freeze the writer branch (ancestor-agent freeze, gasless) to show enforcement in the UI.
  await wait(
    await client.agentSetStatusForwarded({ agentAccount: orch, relayerWalletClient: ownerWallet, budgetKey: writerBudget, freeze: true, gas: FWD_GAS }),
    "orchestrator FREEZES writer (gasless ancestor-agent freeze)"
  );

  // Show the final lived-in tree.
  console.log(`\nfinal tree:`);
  const tree = await client.fetchBudgetTree(projectKey);
  const print = (n: BudgetNode, d: number) => {
    const b = n.budget;
    console.log(`  ${"  ".repeat(d)}- ${decodeLabel(b.label) || "root"} [${statusName(b.status)}] alloc=${fromBaseUnits(b.allocated)} spent=${fromBaseUnits(b.spent)} avail=${fromBaseUnits(availableOf(b))}`);
    n.children.forEach((c) => print(c, d + 1));
  };
  if (tree) print(tree, 0);
  console.log(`\nNEXT_PUBLIC_EVM_PROJECT=${projectKey}`);
}

main().catch((e) => { console.error("populate failed:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
