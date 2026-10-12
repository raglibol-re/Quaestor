import { encodeFunctionData, isHex } from "viem";
import type { Abi, Account, Address, Hex, LocalAccount, PublicClient, WalletClient } from "viem";
import { ERC2771_FORWARDER_ABI, QUAESTOR_ABI } from "./abi/quaestor";
import { labelToBytes32 } from "./keys";
import {
  fetchBudgetTree,
  getAncestorChain,
  type Budget,
  type BudgetNode,
} from "./tree";

/** Decoded on-chain Project struct (as returned by Quaestor.getProject). */
export interface Project {
  owner: Address;
  projectId: bigint;
  mint: Address;
  vaultBalance: bigint;
  rootBudget: Hex;
  feePayer: Address;
  label: Hex;
  exists: boolean;
}

/** EIP-712 field layout of the OZ v5 ERC2771Forwarder ForwardRequest (includes nonce). */
const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

const DEFAULT_INNER_GAS = 1_000_000n;
const RELAYER_GAS_BUFFER = 200_000n;
const DEADLINE_WINDOW_SECONDS = 3600;

export interface QuaestorEvmClientConfig {
  publicClient: PublicClient;
  /** Address of the deployed Quaestor contract. */
  contract: Address;
  /** Address of the deployed ERC2771Forwarder (trusted by the Quaestor contract). */
  forwarder: Address;
  /** Chain id (used for the EIP-712 domain). */
  chainId: number;
}

export interface ForwardParams {
  /** The agent account that authorizes the action (signs, pays no gas). */
  agentAccount: LocalAccount;
  /** The relayer wallet client that submits the transaction and pays gas. */
  relayerWalletClient: WalletClient;
  /** Quaestor function name to forward. */
  fn: string;
  /** Arguments for the Quaestor function. */
  args: readonly unknown[];
  /** Inner gas limit forwarded to the Quaestor call (default 1,000,000). */
  gas?: bigint;
}

export interface SendParams {
  /** Wallet client (must have an account) that signs and pays directly. */
  walletClient: WalletClient;
  fn: string;
  args: readonly unknown[];
}

export interface AllocateChildForwardedParams {
  agentAccount: LocalAccount;
  relayerWalletClient: WalletClient;
  parentKey: Hex;
  childAgent: Address;
  label: string | Hex;
  amount: bigint;
  /** Per-transaction cap (uint64 base units). Omit for UNLIMITED. */
  perTx?: bigint;
  /** Rolling-period cap (uint64 base units). Omit for UNLIMITED. */
  period?: bigint;
  /** Period length in seconds (only meaningful with `period`). */
  periodSeconds?: bigint | number;
  /** Unix expiry timestamp. Omit for NEVER. */
  expiresAt?: bigint | number;
  /** Whether the child may itself allocate sub-budgets (default false). */
  canDelegate?: boolean;
  /** Max sub-tree depth below the child (default 4 = MAX_DEPTH). */
  maxChildDepth?: number;
  /** Optional recipient allowlist (max 8). Empty => ANY recipient. */
  allowlist?: Address[];
  gas?: bigint;
}

function toLabel32(label: string | Hex): Hex {
  if (isHex(label) && label.length === 66) return label;
  return labelToBytes32(label as string);
}

/**
 * High-level client for the Quaestor EVM contract.
 *
 * Owner (human) actions go through the DIRECT path (`send`) since the owner holds gas.
 * Agent actions go through the GASLESS path (`forward`): the agent signs an ERC-2771
 * ForwardRequest and a relayer submits it, so the agent never needs native tokens.
 */
export class QuaestorEvmClient {
  readonly publicClient: PublicClient;
  readonly contract: Address;
  readonly forwarder: Address;
  readonly chainId: number;
  private _forwarderName?: string;

  constructor(config: QuaestorEvmClientConfig) {
    this.publicClient = config.publicClient;
    this.contract = config.contract;
    this.forwarder = config.forwarder;
    this.chainId = config.chainId;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  async getProject(projectKey: Hex): Promise<Project> {
    return (await this.publicClient.readContract({
      address: this.contract,
      abi: QUAESTOR_ABI,
      functionName: "getProject",
      args: [projectKey],
    })) as unknown as Project;
  }

  async getBudget(budgetKey: Hex): Promise<Budget> {
    return (await this.publicClient.readContract({
      address: this.contract,
      abi: QUAESTOR_ABI,
      functionName: "getBudget",
      args: [budgetKey],
    })) as unknown as Budget;
  }

  async getProjectBudgetKeys(projectKey: Hex): Promise<readonly Hex[]> {
    return (await this.publicClient.readContract({
      address: this.contract,
      abi: QUAESTOR_ABI,
      functionName: "getProjectBudgetKeys",
      args: [projectKey],
    })) as readonly Hex[];
  }

  async available(budgetKey: Hex): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contract,
      abi: QUAESTOR_ABI,
      functionName: "available",
      args: [budgetKey],
    })) as bigint;
  }

  fetchBudgetTree(projectKey: Hex): Promise<BudgetNode | null> {
    return fetchBudgetTree(this.publicClient, this.contract, projectKey);
  }

  getAncestorChain(budgetKey: Hex): Promise<{ key: Hex; budget: Budget }[]> {
    return getAncestorChain(this.publicClient, this.contract, budgetKey);
  }

  // -------------------------------------------------------------------------
  // Gasless write path (ERC-2771 meta-transaction)
  // -------------------------------------------------------------------------
  private async forwarderName(): Promise<string> {
    if (this._forwarderName) return this._forwarderName;
    const domain = (await this.publicClient.readContract({
      address: this.forwarder,
      abi: ERC2771_FORWARDER_ABI,
      functionName: "eip712Domain",
    })) as readonly unknown[];
    // eip712Domain returns: fields, name, version, chainId, verifyingContract, salt, extensions
    this._forwarderName = domain[1] as string;
    return this._forwarderName;
  }

  /**
   * Gasless write: the agent signs an EIP-712 ForwardRequest for a Quaestor call
   * and the relayer submits forwarder.execute(...). Returns the relayer tx hash.
   */
  async forward(params: ForwardParams): Promise<Hex> {
    const { agentAccount, relayerWalletClient, fn, args } = params;
    const innerGas = params.gas ?? DEFAULT_INNER_GAS;

    const data = encodeFunctionData({
      abi: QUAESTOR_ABI as unknown as Abi,
      functionName: fn,
      args: args as readonly unknown[],
    });

    const from = agentAccount.address;
    const nonce = (await this.publicClient.readContract({
      address: this.forwarder,
      abi: ERC2771_FORWARDER_ABI,
      functionName: "nonces",
      args: [from],
    })) as bigint;

    const name = await this.forwarderName();
    // uint48 — viem represents this as a JS number in both the typed-data message and the struct.
    const deadline = Math.floor(Date.now() / 1000) + DEADLINE_WINDOW_SECONDS;

    const message = {
      from,
      to: this.contract,
      value: 0n,
      gas: innerGas,
      nonce,
      deadline,
      data,
    };

    const signature = await agentAccount.signTypedData({
      domain: {
        name,
        version: "1",
        chainId: this.chainId,
        verifyingContract: this.forwarder,
      },
      types: FORWARD_REQUEST_TYPES,
      primaryType: "ForwardRequest",
      message,
    });

    // On-chain ForwardRequestData omits `nonce` (consumed internally via nonces(from)).
    const request = {
      from,
      to: this.contract,
      value: 0n,
      gas: innerGas,
      deadline,
      data,
      signature,
    };

    const relayer = this.requireAccount(relayerWalletClient);
    const outerGas = innerGas + RELAYER_GAS_BUFFER;

    // Simulate first so an on-chain revert in the forwarded call (e.g. a per-tx limit
    // or a frozen ancestor) surfaces as a thrown error here, instead of a silently
    // reverted transaction. We pass explicit gas, so viem would otherwise skip estimation.
    await this.publicClient.simulateContract({
      address: this.forwarder,
      abi: ERC2771_FORWARDER_ABI as unknown as Abi,
      functionName: "execute",
      args: [request],
      value: 0n,
      gas: outerGas,
      account: relayer,
    });

    return relayerWalletClient.writeContract({
      address: this.forwarder,
      abi: ERC2771_FORWARDER_ABI as unknown as Abi,
      functionName: "execute",
      args: [request],
      value: 0n,
      gas: outerGas,
      account: relayer,
      chain: relayerWalletClient.chain,
    });
  }

  // -------------------------------------------------------------------------
  // Direct write path (owner ops — owner holds gas)
  // -------------------------------------------------------------------------
  async send(params: SendParams): Promise<Hex> {
    return params.walletClient.writeContract({
      address: this.contract,
      abi: QUAESTOR_ABI as unknown as Abi,
      functionName: params.fn,
      args: params.args as readonly unknown[],
      account: this.requireAccount(params.walletClient),
      chain: params.walletClient.chain,
    });
  }

  private requireAccount(wc: WalletClient): Account {
    if (!wc.account) {
      throw new Error("walletClient must be created with an account to submit transactions");
    }
    return wc.account;
  }

  // -------------------------------------------------------------------------
  // Convenience wrappers — owner actions (direct)
  // -------------------------------------------------------------------------
  createProjectDirect(params: {
    walletClient: WalletClient;
    projectId: bigint | number;
    label: string | Hex;
    mint: Address;
    feePayer: Address;
  }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "createProject",
      args: [BigInt(params.projectId), toLabel32(params.label), params.mint, params.feePayer],
    });
  }

  depositDirect(params: {
    walletClient: WalletClient;
    projectKey: Hex;
    amount: bigint;
  }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "deposit",
      args: [params.projectKey, params.amount],
    });
  }

  setStatusDirect(params: {
    walletClient: WalletClient;
    budgetKey: Hex;
    freeze: boolean;
  }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "setStatus",
      args: [params.budgetKey, params.freeze],
    });
  }

  revokeDirect(params: { walletClient: WalletClient; budgetKey: Hex }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "revoke",
      args: [params.budgetKey],
    });
  }

  reclaimDirect(params: {
    walletClient: WalletClient;
    parentKey: Hex;
    childKey: Hex;
  }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "reclaim",
      args: [params.parentKey, params.childKey],
    });
  }

  withdrawDirect(params: {
    walletClient: WalletClient;
    projectKey: Hex;
    to: Address;
    amount: bigint;
  }): Promise<Hex> {
    return this.send({
      walletClient: params.walletClient,
      fn: "withdraw",
      args: [params.projectKey, params.to, params.amount],
    });
  }

  // -------------------------------------------------------------------------
  // Convenience wrappers — agent actions (gasless / forwarded)
  // -------------------------------------------------------------------------
  allocateChildForwarded(params: AllocateChildForwardedParams): Promise<Hex> {
    const hasPerTx = params.perTx !== undefined;
    const perTx = params.perTx ?? 0n;
    const hasPeriod = params.period !== undefined;
    const period = params.period ?? 0n;
    const periodSeconds = BigInt(params.periodSeconds ?? 0);
    const hasExpiry = params.expiresAt !== undefined;
    const expiresAt = BigInt(params.expiresAt ?? 0);
    const canDelegate = params.canDelegate ?? false;
    const maxChildDepth = params.maxChildDepth ?? 4;
    const allowlist = params.allowlist ?? [];

    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "allocateChild",
      args: [
        params.parentKey,
        params.childAgent,
        toLabel32(params.label),
        params.amount,
        hasPerTx,
        perTx,
        hasPeriod,
        period,
        periodSeconds,
        hasExpiry,
        expiresAt,
        canDelegate,
        maxChildDepth,
        allowlist,
      ],
      gas: params.gas,
    });
  }

  spendForwarded(params: {
    agentAccount: LocalAccount;
    relayerWalletClient: WalletClient;
    budgetKey: Hex;
    recipient: Address;
    amount: bigint;
    taskId?: Hex;
    reasonHash?: Hex;
    gas?: bigint;
  }): Promise<Hex> {
    const ZERO32 = `0x${"0".repeat(64)}` as Hex;
    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "spend",
      args: [
        params.budgetKey,
        params.recipient,
        params.amount,
        params.taskId ?? ZERO32,
        params.reasonHash ?? ZERO32,
      ],
      gas: params.gas,
    });
  }

  agentSetStatusForwarded(params: {
    agentAccount: LocalAccount;
    relayerWalletClient: WalletClient;
    budgetKey: Hex;
    freeze: boolean;
    gas?: bigint;
  }): Promise<Hex> {
    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "agentSetStatus",
      args: [params.budgetKey, params.freeze],
      gas: params.gas,
    });
  }
}
