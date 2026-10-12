/**
 * Tiny x402 resource server for the Quaestor "quaestor-onchain" scheme (no web framework).
 *
 * GET /premium
 *   - With no (or an invalid) X-PAYMENT header -> HTTP 402 + PaymentRequirements:
 *       { x402Version: 1, accepts: [{ scheme: "quaestor-onchain", network, maxAmountRequired,
 *                                     resource, description, payTo, asset, extra: { contract } }] }
 *   - With a valid X-PAYMENT header -> VERIFY THE PAYMENT TX ON-CHAIN, then HTTP 200 + premium data:
 *       { data: "the answer is 42", resource, paidTx, amountPaid, asset, network }
 *
 * Verification (EVM): fetch the tx receipt and require an ERC-20 Transfer(_, payTo, value) log on
 * `asset` with value >= the required base-units amount. This is exactly the on-chain Quaestor spend
 * the agent made from its budget, so the merchant is paid and budget limits were enforced upstream.
 *
 * The per-request price is `?amount=<baseUnits>` if present, else the configured default — this lets
 * one server drive both the "within-budget" and the "over-limit" demo cases.
 *
 * Standalone:  X402_CONTRACT=0x.. X402_ASSET=0x.. X402_PAYTO=0x.. ts-node scripts/x402-demo-server.ts
 * Env: X402_PORT X402_NETWORK X402_RPC_URL X402_CONTRACT X402_ASSET X402_PAYTO X402_MAX_AMOUNT X402_DESCRIPTION
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createPublicClient,
  defineChain,
  http,
  type Hex,
  type PublicClient,
} from "../packages/evm-sdk/dist/index.js";

/** keccak256("Transfer(address,address,uint256)") — standard ERC-20 Transfer topic0. */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface X402ServerConfig {
  port: number;
  network: string;
  rpcUrl: string;
  /** Quaestor contract (advertised in `extra.contract`; its Spent event mirrors the transfer). */
  contract: string;
  /** Token (USDC / MockUSDC) that must be transferred to the merchant. */
  asset: string;
  /** Merchant address that must receive the payment. */
  payTo: string;
  /** Default required amount in base-units (integer string), overridable per-request via ?amount=. */
  maxAmountRequired: string;
  description: string;
}

interface DecodedHeader {
  x402Version?: number;
  scheme?: string;
  network?: string;
  payload?: { txHash?: string; payer?: string; amount?: string };
}

function decodePaymentHeader(value: string): DecodedHeader {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as DecodedHeader;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verify the on-chain payment tx transferred >= `required` base-units of `asset` to `payTo`.
 * Polls for the receipt (the agent may have only just submitted the tx).
 */
async function verifyPayment(
  publicClient: PublicClient,
  txHash: Hex,
  asset: string,
  payTo: string,
  required: bigint
): Promise<{ ok: boolean; reason?: string; value?: bigint }> {
  let receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>> | undefined;
  for (let i = 0; i < 15; i++) {
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      break;
    } catch {
      await sleep(300);
    }
  }
  if (!receipt) return { ok: false, reason: "payment tx not found / not yet mined" };
  if (receipt.status !== "success") return { ok: false, reason: "payment tx reverted on-chain" };

  const assetLc = asset.toLowerCase();
  const payToLc = payTo.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== assetLc) continue;
    if ((log.topics?.[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!log.topics || log.topics.length < 3) continue;
    const to = ("0x" + log.topics[2]!.slice(26)).toLowerCase(); // indexed `to` (right-aligned)
    if (to !== payToLc) continue;
    const value = BigInt(log.data); // non-indexed `value`
    if (value >= required) return { ok: true, value };
  }
  return {
    ok: false,
    reason: `no ERC-20 Transfer of >= ${required} base-units of ${asset} to ${payTo} in tx ${txHash}`,
  };
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function paymentRequirements(cfg: X402ServerConfig, required: string, resource: string, error?: string) {
  const reqs = {
    x402Version: 1,
    accepts: [
      {
        scheme: "quaestor-onchain",
        network: cfg.network,
        maxAmountRequired: required,
        resource,
        description: cfg.description,
        payTo: cfg.payTo,
        asset: cfg.asset,
        extra: { contract: cfg.contract },
      },
    ],
  };
  return error ? { ...reqs, error } : reqs;
}

/** Build (but do not start) the x402 resource server. */
export function createX402Server(cfg: X402ServerConfig): Server {
  const chain = defineChain({
    id: 0, // id is not used for reads; viem fills it from the node on first call
    name: cfg.network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) }) as PublicClient;

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method !== "GET" || url.pathname !== "/premium") {
      sendJson(res, 404, { error: "not found", hint: "GET /premium" });
      return;
    }

    const required = url.searchParams.get("amount") ?? cfg.maxAmountRequired;
    const resource = url.pathname + url.search;
    const raw = req.headers["x-payment"];
    const xpay = Array.isArray(raw) ? raw[0] : raw;

    if (!xpay) {
      sendJson(res, 402, paymentRequirements(cfg, required, resource));
      return;
    }

    let header: DecodedHeader;
    try {
      header = decodePaymentHeader(xpay);
    } catch {
      sendJson(res, 402, paymentRequirements(cfg, required, resource, "malformed X-PAYMENT header"));
      return;
    }
    if (header.scheme !== "quaestor-onchain" || header.network !== cfg.network) {
      sendJson(
        res,
        402,
        paymentRequirements(cfg, required, resource, "X-PAYMENT scheme/network mismatch")
      );
      return;
    }
    const txHash = header.payload?.txHash;
    if (!txHash) {
      sendJson(res, 402, paymentRequirements(cfg, required, resource, "X-PAYMENT missing txHash"));
      return;
    }

    const v = await verifyPayment(publicClient, txHash as Hex, cfg.asset, cfg.payTo, BigInt(required));
    if (!v.ok) {
      sendJson(res, 402, paymentRequirements(cfg, required, resource, v.reason));
      return;
    }

    sendJson(res, 200, {
      data: "the answer is 42",
      resource,
      paidTx: txHash,
      amountPaid: required,
      asset: cfg.asset,
      network: cfg.network,
    });
  };

  return createServer((req, res) => {
    handler(req, res).catch((e) => {
      sendJson(res, 500, { error: String((e as Error)?.message ?? e) });
    });
  });
}

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export function configFromEnv(): X402ServerConfig {
  return {
    port: Number(process.env.X402_PORT ?? 4021),
    network: process.env.X402_NETWORK ?? "anvil",
    rpcUrl: process.env.X402_RPC_URL ?? "http://127.0.0.1:8545",
    contract: reqEnv("X402_CONTRACT"),
    asset: reqEnv("X402_ASSET"),
    payTo: reqEnv("X402_PAYTO"),
    maxAmountRequired: process.env.X402_MAX_AMOUNT ?? "250000", // 0.25 USDC default
    description: process.env.X402_DESCRIPTION ?? "Quaestor premium data endpoint",
  };
}

// Standalone entrypoint.
if (require.main === module) {
  const cfg = configFromEnv();
  const server = createX402Server(cfg);
  server.listen(cfg.port, () => {
    console.log(
      `x402 demo server on http://127.0.0.1:${cfg.port}/premium  ` +
        `network=${cfg.network} payTo=${cfg.payTo} price=${cfg.maxAmountRequired} base-units`
    );
  });
}
