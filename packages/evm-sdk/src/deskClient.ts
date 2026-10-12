import { encodeFunctionData } from "viem";
import type { Abi, Account, Address, Hex, LocalAccount, PublicClient, WalletClient } from "viem";
import { ERC2771_FORWARDER_ABI } from "./abi/quaestor";
import { QUAESTOR_DESK_ABI } from "./abi/quaestorDesk";

/**
 * Decoded on-chain DeskMandate struct (as returned by QuaestorDesk.getMandate).
 * Mirrors the Solidity struct field-for-field (uint256 -> bigint, int64 -> bigint,
 * uint32[8] -> readonly number[], uint8/bool -> number/boolean).
 */
export interface DeskMandate {
  principal: Address;
  agent: Address;
  deposited: bigint;
  allowedAssets: readonly number[];
  allowedLen: number;
  hasMaxOrder: boolean;
  maxNotionalPerOrder: bigint;
  hasMaxDay: boolean;
  maxNotionalPerDay: bigint;
  dayStart: bigint;
  dayNotionalUsed: bigint;
  equityFloor: bigint;
  hasExpiry: boolean;
  expiresAt: bigint;
  status: number;
  exists: boolean;
}

/** bytes32 zero — default taskId / reasonHash. */
const ZERO32 = `0x${"0".repeat(64)}` as Hex;

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

export interface QuaestorDeskClientConfig {
  /** Address of the deployed QuaestorDesk contract. */
  deskContract: Address;
  /** Address of the deployed ERC2771Forwarder (trusted by the desk contract). */
  forwarder: Address;
  /** Chain id (used for the EIP-712 domain). */
  chainId: number;
  publicClient: PublicClient;
}

export interface PlaceOrderForwardedParams {
  /** The agent account that authorizes the trade (signs, pays no gas). */
  agentAccount: LocalAccount;
  /** The relayer wallet client that submits the transaction and pays gas. */
  relayerWalletClient: WalletClient;
  /** Mandate id (bytes32). */
  id: Hex;
  /** HyperCore asset index. */
  asset: number;
  isBuy: boolean;
  /** Limit price (uint64, HyperCore units). */
  px: bigint;
  /** Size (uint64, HyperCore units). */
  sz: bigint;
  /** Time-in-force byte. */
  tif: number;
  /** Client order id (uint64). */
  cloid: bigint;
  /** Optional attribution task id (bytes32, default ZERO32). */
  taskId?: Hex;
  /** Optional attribution reason hash (bytes32, default ZERO32). */
  reasonHash?: Hex;
  gas?: bigint;
}

export interface CancelForwardedParams {
  agentAccount: LocalAccount;
  relayerWalletClient: WalletClient;
  id: Hex;
  asset: number;
  /** Either the exchange oid or the client cloid, depending on `byCloid`. */
  oidOrCloid: bigint;
  byCloid: boolean;
  gas?: bigint;
}

export interface SetStatusForwardedParams {
  agentAccount: LocalAccount;
  relayerWalletClient: WalletClient;
  id: Hex;
  freeze: boolean;
  gas?: bigint;
}

/**
 * High-level client for the QuaestorDesk trading-mandate contract on Hyperliquid (HyperEVM).
 *
 * Agent actions (placeOrder/cancel) and the principal/owner freeze go through the GASLESS path:
 * the agent signs an ERC-2771 ForwardRequest and a relayer submits forwarder.execute(...), so the
 * agent never needs native gas. This mirrors `QuaestorEvmClient.spendForwarded` exactly — only the
 * target contract, ABI, and function differ.
 */
export class QuaestorDeskClient {
  readonly deskContract: Address;
  readonly forwarder: Address;
  readonly chainId: number;
  readonly publicClient: PublicClient;
  private _forwarderName?: string;

  constructor(config: QuaestorDeskClientConfig) {
    this.deskContract = config.deskContract;
    this.forwarder = config.forwarder;
    this.chainId = config.chainId;
    this.publicClient = config.publicClient;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------
  async getMandate(id: Hex): Promise<DeskMandate> {
    return (await this.publicClient.readContract({
      address: this.deskContract,
      abi: QUAESTOR_DESK_ABI,
      functionName: "getMandate",
      args: [id],
    })) as unknown as DeskMandate;
  }

  async getMandateKeys(): Promise<Hex[]> {
    return (await this.publicClient.readContract({
      address: this.deskContract,
      abi: QUAESTOR_DESK_ABI,
      functionName: "getMandateKeys",
    })) as unknown as Hex[];
  }

  // -------------------------------------------------------------------------
  // Gasless write path (ERC-2771 meta-transaction) — replicated from client.ts
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
   * Gasless write: the agent signs an EIP-712 ForwardRequest for a QuaestorDesk call and the
   * relayer submits forwarder.execute(...). Returns the relayer tx hash.
   */
  private async forward(params: {
    agentAccount: LocalAccount;
    relayerWalletClient: WalletClient;
    fn: string;
    args: readonly unknown[];
    gas?: bigint;
  }): Promise<Hex> {
    const { agentAccount, relayerWalletClient, fn, args } = params;
    const innerGas = params.gas ?? DEFAULT_INNER_GAS;

    const data = encodeFunctionData({
      abi: QUAESTOR_DESK_ABI as unknown as Abi,
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
      to: this.deskContract,
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
      to: this.deskContract,
      value: 0n,
      gas: innerGas,
      deadline,
      data,
      signature,
    };

    const relayer = this.requireAccount(relayerWalletClient);
    const outerGas = innerGas + RELAYER_GAS_BUFFER;

    // Simulate first so an on-chain revert in the forwarded call (e.g. a policy limit or a frozen
    // mandate) surfaces as a thrown error here, instead of a silently reverted transaction. We pass
    // explicit gas, so viem would otherwise skip estimation.
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

  private requireAccount(wc: WalletClient): Account {
    if (!wc.account) {
      throw new Error("walletClient must be created with an account to submit transactions");
    }
    return wc.account;
  }

  // -------------------------------------------------------------------------
  // Convenience wrappers — agent / principal actions (gasless / forwarded)
  // -------------------------------------------------------------------------
  placeOrderForwarded(params: PlaceOrderForwardedParams): Promise<Hex> {
    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "placeOrder",
      args: [
        params.id,
        params.asset,
        params.isBuy,
        params.px,
        params.sz,
        params.tif,
        params.cloid,
        params.taskId ?? ZERO32,
        params.reasonHash ?? ZERO32,
      ],
      gas: params.gas,
    });
  }

  cancelForwarded(params: CancelForwardedParams): Promise<Hex> {
    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "cancel",
      args: [params.id, params.asset, params.oidOrCloid, params.byCloid],
      gas: params.gas,
    });
  }

  setStatusForwarded(params: SetStatusForwardedParams): Promise<Hex> {
    return this.forward({
      agentAccount: params.agentAccount,
      relayerWalletClient: params.relayerWalletClient,
      fn: "setStatus",
      args: [params.id, params.freeze],
      gas: params.gas,
    });
  }
}
