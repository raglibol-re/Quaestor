// Read-only on-chain helpers for the consent screen: who owns the project (to verify the SIWS
// signature), and each custodied node's current limits (so the owner sees what they're approving).
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, availableOf, findBudgetPda, formatUSDC } from "@quaestor/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "./env";
import { listAgentKeys } from "./db";

let _client: QuaestorClient | null = null;
function client(): QuaestorClient {
  if (!_client) {
    const connection = new Connection(env().rpcUrl, "confirmed");
    const provider = new AnchorProvider(connection, new Wallet(env().relayer), { commitment: "confirmed" });
    _client = QuaestorClient.fromProvider(provider);
  }
  return _client;
}

/** The project's on-chain owner (base58). Consent is only valid if the SIWS signer equals this. */
export async function projectOwner(): Promise<string> {
  const p = await client().getProject(env().project);
  return p.owner.toBase58();
}

export interface NodeInfo {
  node: string;
  pubkey: string;
  available: string | null;
  perTxLimit: string | null;
  dailyLimit: string | null;
  status: string | null;
}

function fmtOpt(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  try {
    return formatUSDC(BigInt(v.toString()), { unit: true });
  } catch {
    return null;
  }
}

/** Custodied nodes for this project, each with its current limits for the consent display. */
export async function listNodesWithInfo(): Promise<NodeInfo[]> {
  const rows = await listAgentKeys(env().chain, env().project.toBase58());
  const out: NodeInfo[] = [];
  for (const r of rows) {
    const info: NodeInfo = { node: r.node, pubkey: r.pubkey, available: null, perTxLimit: null, dailyLimit: null, status: null };
    try {
      const [pda] = findBudgetPda(env().project, new PublicKey(r.pubkey));
      const b = (await client().getBudget(pda)) as Record<string, unknown>;
      info.available = fmtOpt(availableOf(b as never) as unknown as { toString(): string });
      info.perTxLimit = fmtOpt((b.perTxLimit as { toString(): string } | null) ?? null);
      info.dailyLimit = fmtOpt((b.periodLimit as { toString(): string } | null) ?? null);
      const st = b.status as unknown;
      info.status = st && typeof st === "object" ? Object.keys(st)[0] : String(st ?? "");
    } catch {
      // Node not yet funded/allocated on-chain — show it without numbers.
    }
    out.push(info);
  }
  return out;
}
