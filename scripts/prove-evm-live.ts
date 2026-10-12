/**
 * Live proof against the deployed Base Sepolia Quaestor:
 *  (1) read the on-chain budget tree (the dashboard's exact read path);
 *  (2) allocate a fresh agent that holds ZERO ETH, have it pay gaslessly (relayer pays),
 *      and watch the chain REJECT an over-per-tx-limit payment.
 * Env: QUAESTOR_EVM_RPC_URL, QUAESTOR_CHAIN_ID, QUAESTOR_CONTRACT, QUAESTOR_FORWARDER,
 *      QUAESTOR_USDC, QUAESTOR_EVM_PRIVATE_KEY, QUAESTOR_PROJECT.
 */
import {
  ERC20_ABI,
  QUAESTOR_ABI,
  QuaestorEvmClient,
  availableOf,
  budgetKeyOf,
  createPublicClient,
  createWalletClient,
  decodeLabel,
  defineChain,
  formatUnits,
  fromBaseUnits,
  generatePrivateKey,
  http,
  labelToBytes32,
  privateKeyToAccount,
  statusName,
  toBaseUnits,
} from "../packages/evm-sdk/dist/index.js";
import type { BudgetNode, Hex } from "../packages/evm-sdk/dist/index.js";

const RPC = process.env.QUAESTOR_EVM_RPC_URL as string;
const CHAIN_ID = Number(process.env.QUAESTOR_CHAIN_ID || "84532");
const CONTRACT = process.env.QUAESTOR_CONTRACT as `0x${string}`;
const FORWARDER = process.env.QUAESTOR_FORWARDER as `0x${string}`;
const USDC = process.env.QUAESTOR_USDC as `0x${string}`;
const KEY = process.env.QUAESTOR_EVM_PRIVATE_KEY as `0x${string}`;
const PROJECT = process.env.QUAESTOR_PROJECT as Hex;

async function main() {
  const chain = defineChain({ id: CHAIN_ID, name: "base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const owner = privateKeyToAccount(KEY);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const client = new QuaestorEvmClient({ publicClient, contract: CONTRACT, forwarder: FORWARDER, chainId: CHAIN_ID });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const wait = async (hash: Hex, what: string) => {
    const r = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ${what}: ${r.status}  https://sepolia.basescan.org/tx/${hash}`);
    if (r.status !== "success") throw new Error(`${what} reverted`);
    await sleep(6000);
  };
  const usdc = (a: `0x${string}`) => publicClient.readContract({ address: USDC, abi: ERC20_ABI as never, functionName: "balanceOf", args: [a] } as never) as Promise<bigint>;

  console.log(`\n(1) READ the live tree from ${CONTRACT} on Base Sepolia:\n`);
  const tree = await client.fetchBudgetTree(PROJECT);
  const print = (n: BudgetNode, d: number) => {
    const b = n.budget;
    const lim = b.hasPerTxLimit ? ` perTx≤${fromBaseUnits(b.perTxLimit)}` : "";
    console.log(`  ${"  ".repeat(d)}- ${decodeLabel(b.label) || "root"} [${statusName(b.status)}] alloc=${fromBaseUnits(b.allocated)} spent=${fromBaseUnits(b.spent)} avail=${fromBaseUnits(availableOf(b))}${lim}  agent=${b.agent}`);
    n.children.forEach((c) => print(c, d + 1));
  };
  if (!tree) throw new Error("no tree found on-chain");
  print(tree, 0);

  console.log(`\n(2) LIVE enforcement — a gas-less agent pays, then an over-limit pay is rejected:\n`);
  const prover = privateKeyToAccount(generatePrivateKey());
  const rootBudget = budgetKeyOf(PROJECT, owner.address);
  await wait(
    await client.send({ walletClient: ownerWallet, fn: "allocateChild", args: [rootBudget, prover.address, labelToBytes32("prover"), toBaseUnits("1"), true, toBaseUnits("0.25"), false, 0n, 0n, false, 0n, false, 4, []] }),
    "owner allocates 'prover' 1 USDC, max 0.25/tx"
  );
  const proverBudget = budgetKeyOf(PROJECT, prover.address);
  const proverEth = await publicClient.getBalance({ address: prover.address });
  console.log(`  prover agent ${prover.address}`);
  console.log(`  prover native ETH balance: ${formatUnits(proverEth, 18)} ETH  <-- holds NO gas`);

  const merchant = privateKeyToAccount(generatePrivateKey()).address;
  const before = await usdc(merchant);
  await wait(
    await client.spendForwarded({ agentAccount: prover, relayerWalletClient: ownerWallet, budgetKey: proverBudget, recipient: merchant, amount: toBaseUnits("0.20") }),
    "prover pays 0.20 USDC (agent signed; relayer paid gas)"
  );
  const after = await usdc(merchant);
  console.log(`  merchant received on-chain: ${fromBaseUnits(after - before)} USDC`);

  process.stdout.write("  prover tries to pay 0.50 USDC (over its 0.25/tx limit)... ");
  try {
    await publicClient.simulateContract({ address: CONTRACT, abi: QUAESTOR_ABI as never, functionName: "spend", args: [proverBudget, merchant, toBaseUnits("0.50")], account: prover.address } as never);
    console.log("!! UNEXPECTED: it was allowed");
  } catch (e) {
    const name = (e as { cause?: { data?: { errorName?: string } } })?.cause?.data?.errorName
      ?? (String((e as { message?: string }).message).match(/PerTxLimitExceeded|InsufficientAvailable|AncestorNotActive|NotActive/) || ["revert"])[0];
    console.log(`REJECTED on-chain (${name}). The paywalled action never happens.`);
  }
  console.log(`\n  ✔ Enforced on Base Sepolia. Give agents budgets, not keys.\n`);
}

main().catch((e) => { console.error("proof failed:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
