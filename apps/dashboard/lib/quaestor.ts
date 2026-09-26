import { AnchorProvider } from "@coral-xyz/anchor";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { QuaestorClient } from "@quaestor/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const READONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: async <T>(t: T) => t,
  signAllTransactions: async <T>(t: T[]) => t,
} as unknown as AnchorWallet;

export function readClient(rpc: string): QuaestorClient {
  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, READONLY_WALLET, { commitment: "confirmed" });
  return QuaestorClient.fromProvider(provider);
}

export function writeClient(rpc: string, wallet: AnchorWallet): QuaestorClient {
  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return QuaestorClient.fromProvider(provider);
}

export function short(addr: string, n = 4): string {
  return `${addr.slice(0, n)}…${addr.slice(-n)}`;
}
