import {
  QUAESTOR_DESK_ABI,
  fromBaseUnits,
  keccak256,
  labelToBytes32,
  statusName,
} from "@quaestor/evm-sdk";
import type { Hex } from "@quaestor/evm-sdk";
import { appendAttribution } from "./attribution";
import { loadDeskConfig } from "./config";
import { buildDeskContext, type DeskContext } from "./deskContext";

/** QuaestorDesk custom-error name -> human message. */
const DESK_ERR: Record<string, string> = {
  Unauthorized: "Unauthorized: you are not the agent for this mandate.",
  OwnerOnly: "Only the desk operator may do this.",
  PrincipalOnly: "Only the mandate principal may do this.",
  NotActive: "This mandate is not active (frozen or revoked).",
  Expired: "This mandate has expired.",
  AlreadyExists: "That mandate already exists.",
  NotFound: "Mandate not found.",
  InvalidAmount: "Amount must be greater than zero.",
  TooManyAssets: "Too many allowed assets (max 8).",
  AssetNotAllowed: "This asset is not in the mandate's allowed-assets list.",
  OrderNotionalExceeded: "Order notional exceeds the per-order limit.",
  DayNotionalExceeded: "Order notional exceeds the rolling 24h limit.",
  EquityFloorBreached: "Desk equity is below the mandate's equity floor (drawdown stop).",
  AlreadyRevoked: "Mandate is already revoked.",
  InsufficientCustody: "Insufficient custodied USDC for this withdrawal.",
};

export interface PlaceOrderInput {
  asset: number;
  isBuy: boolean;
  px: bigint | number | string;
  sz: bigint | number | string;
  tif?: number;
  cloid?: bigint | number | string;
  taskId?: string;
  reason?: string;
}

export interface PlaceOrderResult {
  signature: string;
  asset: number;
  isBuy: boolean;
  px: string;
  sz: string;
  notional: string;
  taskId?: string;
  reason?: string;
}

export interface CancelInput {
  asset: number;
  oidOrCloid: bigint | number | string;
  byCloid: boolean;
}

export interface DeskStatusResult {
  signature: string;
  status: string;
}

const toU64 = (x: bigint | number | string): bigint => BigInt(x);

/**
 * Hyperliquid trading-desk operations over @quaestor/evm-sdk's QuaestorDeskClient. Agent trades
 * (place/cancel) and the principal freeze are forwarded gaslessly (ERC-2771). Pre-trade risk is
 * enforced on-chain by QuaestorDesk; this class only encodes/attributes and formats results.
 */
export class DeskOps {
  constructor(private readonly ctx: DeskContext) {}

  describe(): string {
    const c = this.ctx.config;
    return `desk(${c.chain}) agent="${c.agent}" (${this.ctx.agentAccount.address}) desk=${c.deskContract} mandate=${this.ctx.mandateId} rpc=${c.rpcUrl}`;
  }

  networkLabel(): string {
    return "hyperliquid";
  }

  payerAddress(): string {
    return this.ctx.agentAccount.address;
  }

  /**
   * Simulate the inner desk call (msg.sender = agent) against the desk ABI so an on-chain revert
   * surfaces as a clean, decodable custom error instead of the opaque data a reverted
   * forwarder.execute would bubble. Called before forwarding a gasless write.
   */
  private async preflight(fn: string, args: readonly unknown[]): Promise<void> {
    await (this.ctx.publicClient.simulateContract as (opts: unknown) => Promise<unknown>)({
      address: this.ctx.config.deskContract,
      abi: QUAESTOR_DESK_ABI,
      functionName: fn,
      args,
      account: this.ctx.agentAccount.address,
    });
  }

  async getMyMandate(): Promise<unknown> {
    const m = await this.ctx.client.getMandate(this.ctx.mandateId);
    return {
      mandateId: this.ctx.mandateId,
      chain: this.ctx.config.chain,
      principal: m.principal,
      agent: m.agent,
      status: statusName(m.status),
      allowedAssets: m.allowedAssets.slice(0, m.allowedLen),
      deposited: fromBaseUnits(m.deposited),
      maxNotionalPerOrder: m.hasMaxOrder ? m.maxNotionalPerOrder.toString() : null,
      maxNotionalPerDay: m.hasMaxDay ? m.maxNotionalPerDay.toString() : null,
      dayNotionalUsed: m.dayNotionalUsed.toString(),
      equityFloor: m.equityFloor > 0n ? m.equityFloor.toString() : null,
      expiresAt: m.hasExpiry ? Number(m.expiresAt) : null,
    };
  }

  async placeOrder(p: PlaceOrderInput): Promise<PlaceOrderResult> {
    const px = toU64(p.px);
    const sz = toU64(p.sz);
    const cloid = p.cloid != null ? toU64(p.cloid) : 0n;
    const tif = p.tif ?? 2; // default GTC (VERIFY against HL tif byte values)
    const notional = px * sz;
    const reason = p.reason?.trim();
    const taskIdStr = p.taskId?.trim();
    const taskId: Hex | undefined = taskIdStr
      ? labelToBytes32(taskIdStr.slice(0, 31))
      : undefined;
    const reasonHash: Hex | undefined = reason
      ? keccak256(Buffer.from(reason, "utf8"))
      : undefined;

    await this.preflight("placeOrder", [
      this.ctx.mandateId,
      p.asset,
      p.isBuy,
      px,
      sz,
      tif,
      cloid,
      taskId ?? (`0x${"0".repeat(64)}` as Hex),
      reasonHash ?? (`0x${"0".repeat(64)}` as Hex),
    ]);

    const hash = await this.ctx.client.placeOrderForwarded({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      id: this.ctx.mandateId,
      asset: p.asset,
      isBuy: p.isBuy,
      px,
      sz,
      tif,
      cloid,
      taskId,
      reasonHash,
    });

    if (taskIdStr || reason) {
      appendAttribution({
        ts: Date.now(),
        chain: this.networkLabel(),
        signature: hash,
        recipient: this.ctx.config.deskContract,
        amount: notional.toString(),
        taskId: taskIdStr || undefined,
        reason: reason || undefined,
        reasonHash: reason ? keccak256(Buffer.from(reason, "utf8")) : undefined,
      });
    }

    return {
      signature: hash,
      asset: p.asset,
      isBuy: p.isBuy,
      px: px.toString(),
      sz: sz.toString(),
      notional: notional.toString(),
      taskId: taskIdStr || undefined,
      reason: reason || undefined,
    };
  }

  async cancelOrder(p: CancelInput): Promise<{ signature: string; asset: number; oidOrCloid: string; byCloid: boolean }> {
    const oidOrCloid = toU64(p.oidOrCloid);
    await this.preflight("cancel", [this.ctx.mandateId, p.asset, oidOrCloid, p.byCloid]);
    const hash = await this.ctx.client.cancelForwarded({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      id: this.ctx.mandateId,
      asset: p.asset,
      oidOrCloid,
      byCloid: p.byCloid,
    });
    return { signature: hash, asset: p.asset, oidOrCloid: oidOrCloid.toString(), byCloid: p.byCloid };
  }

  async setStatus(freeze: boolean): Promise<DeskStatusResult> {
    await this.preflight("setStatus", [this.ctx.mandateId, freeze]);
    const hash = await this.ctx.client.setStatusForwarded({
      agentAccount: this.ctx.agentAccount,
      relayerWalletClient: this.ctx.relayerWalletClient,
      id: this.ctx.mandateId,
      freeze,
    });
    return { signature: hash, status: freeze ? "frozen" : "active" };
  }

  toFriendlyError(e: unknown): string {
    const err = e as {
      shortMessage?: string;
      message?: string;
      cause?: { data?: { errorName?: string }; cause?: { data?: { errorName?: string } } };
      data?: { errorName?: string };
    };
    const name =
      err?.cause?.data?.errorName ??
      err?.data?.errorName ??
      err?.cause?.cause?.data?.errorName;
    if (name && DESK_ERR[name]) return DESK_ERR[name];

    const msg = err?.shortMessage ?? err?.message ?? String(e);
    for (const [n, f] of Object.entries(DESK_ERR)) {
      if (String(msg).includes(n)) return f;
    }
    return String(msg).split("\n")[0];
  }
}

/** Factory used by opsFactory for the Hyperliquid desk chain. */
export async function buildDeskOps(): Promise<DeskOps> {
  return new DeskOps(buildDeskContext(loadDeskConfig()));
}
