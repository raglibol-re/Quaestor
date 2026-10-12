/**
 * Seed a demo budget tree on a deployed EVM Quaestor, so the dashboard's EVM tab has a live tree.
 *   root (owner) --60--> orchestrator --20 (5/tx)--> research
 *                                     \--10 (2/tx)--> writer
 * Env: QUAESTOR_EVM_RPC_URL, QUAESTOR_CHAIN_ID, QUAESTOR_CONTRACT, QUAESTOR_FORWARDER,
 *      QUAESTOR_USDC, QUAESTOR_EVM_PRIVATE_KEY, [QUAESTOR_PROJECT_ID=1].
 * Prints the projectKey to set as NEXT_PUBLIC_EVM_PROJECT.
 */
import {
  ERC20_ABI,
  QuaestorEvmClient,
  budgetKeyOf,
  createPublicClient,
  createWalletClient,
  defineChain,
  generatePrivateKey,
  http,
  labelToBytes32,
  privateKeyToAccount,
  projectKeyOf,
  toBaseUnits,
} from "../packages/evm-sdk/dist/index.js";
import type { Hex } from "../packages/evm-sdk/dist/index.js";

const RPC = process.env.QUAESTOR_EVM_RPC_URL as string;
const CHAIN_ID = Number(process.env.QUAESTOR_CHAIN_ID || "84532");
const CONTRACT = process.env.QUAESTOR_CONTRACT as `0x${string}`;
const FORWARDER = process.env.QUAESTOR_FORWARDER as `0x${string}`;
const USDC = process.env.QUAESTOR_USDC as `0x${string}`;
const KEY = process.env.QUAESTOR_EVM_PRIVATE_KEY as `0x${string}`;
const PROJECT_ID = BigInt(process.env.QUAESTOR_PROJECT_ID || "1");

async function main() {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "evm",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const owner = privateKeyToAccount(KEY);
  const ownerWallet = createWalletClient({ account: owner, chain, transport: http(RPC) });
  const client = new QuaestorEvmClient({ publicClient, contract: CONTRACT, forwarder: FORWARDER, chainId: CHAIN_ID });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const wait = async (hash: Hex, what: string) => {
    const r = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ${what}: ${r.status} (${hash})`);
    if (r.status !== "success") throw new Error(`${what} reverted`);
    // Public/load-balanced RPCs lag: give the just-mined state time to propagate to all nodes
    // before the next step's gas estimation reads it.
    await sleep(6000);
  };

  const projectKey = projectKeyOf(owner.address, PROJECT_ID);
  console.log(`owner ${owner.address}  project ${projectKey}`);
  const amt = toBaseUnits("100");
  const read = (fn: string, args: unknown[]) =>
    publicClient.readContract({ address: USDC, abi: ERC20_ABI as never, functionName: fn, args } as never) as Promise<bigint>;

  // --- idempotent setup (safe to re-run against a public/lagging RPC) ---
  const proj = await client.getProject(projectKey);
  if (!proj.exists) {
    await wait(await client.createProjectDirect({ walletClient: ownerWallet, projectId: PROJECT_ID, label: "demo", mint: USDC, feePayer: owner.address }), "createProject");
  } else console.log("  project already exists — skip create");

  if ((await read("balanceOf", [owner.address])) < amt) {
    await wait(await ownerWallet.writeContract({ address: USDC, abi: ERC20_ABI as never, functionName: "mint", args: [owner.address, amt], account: owner, chain }), "mint 100 USDC");
  } else console.log("  owner already holds >=100 USDC — skip mint");

  if ((await read("allowance", [owner.address, CONTRACT])) < amt) {
    await wait(await ownerWallet.writeContract({ address: USDC, abi: ERC20_ABI as never, functionName: "approve", args: [CONTRACT, amt], account: owner, chain }), "approve");
  } else console.log("  allowance already set — skip approve");

  if ((await client.getProject(projectKey)).vaultBalance < amt) {
    await wait(await client.depositDirect({ walletClient: ownerWallet, projectKey, amount: amt }), "deposit 100");
  } else console.log("  vault already funded — skip deposit");

  const rootBudget = budgetKeyOf(projectKey, owner.address);
  if ((await client.getBudget(rootBudget)).reservedForChildren > 0n) {
    console.log(`\n  tree already allocated. NEXT_PUBLIC_EVM_PROJECT=${projectKey}`);
    return;
  }
  const orch = privateKeyToAccount(generatePrivateKey());
  await wait(
    await client.send({
      walletClient: ownerWallet,
      fn: "allocateChild",
      args: [rootBudget, orch.address, labelToBytes32("orchestrator"), toBaseUnits("60"), false, 0n, false, 0n, 0n, false, 0n, true, 4, []],
    }),
    "allocate orchestrator 60"
  );

  const orchBudget = budgetKeyOf(projectKey, orch.address);
  const research = privateKeyToAccount(generatePrivateKey());
  await wait(
    await client.allocateChildForwarded({ agentAccount: orch, relayerWalletClient: ownerWallet, parentKey: orchBudget, childAgent: research.address, label: "research", amount: toBaseUnits("20"), perTx: toBaseUnits("5"), canDelegate: false }),
    "orchestrator -> research 20 (5/tx, gasless)"
  );
  const writer = privateKeyToAccount(generatePrivateKey());
  await wait(
    await client.allocateChildForwarded({ agentAccount: orch, relayerWalletClient: ownerWallet, parentKey: orchBudget, childAgent: writer.address, label: "writer", amount: toBaseUnits("10"), perTx: toBaseUnits("2"), canDelegate: false }),
    "orchestrator -> writer 10 (2/tx, gasless)"
  );

  console.log(`\nSeeded. NEXT_PUBLIC_EVM_PROJECT=${projectKey}`);
}

main().catch((e) => {
  console.error("seed failed:", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
