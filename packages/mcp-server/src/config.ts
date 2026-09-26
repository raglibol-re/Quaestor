import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace(/^~/, homedir()) : p;
}

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

/** Load a Solana CLI keypair json file ([u8; 64] array). */
export function loadKeypairFile(path: string): Keypair {
  const raw = JSON.parse(readFileSync(expandHome(path), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
}

export const DEFAULT_RPC = "https://api.devnet.solana.com";

export interface McpConfig {
  rpcUrl: string;
  project: PublicKey;
  agent: string;
  passphrase: string;
  relayer: Keypair;
}

/** Config for the per-agent MCP server. */
export function loadMcpConfig(): McpConfig {
  return {
    rpcUrl: process.env.QUAESTOR_RPC_URL || DEFAULT_RPC,
    project: new PublicKey(reqEnv("QUAESTOR_PROJECT")),
    agent: reqEnv("QUAESTOR_AGENT"),
    passphrase: reqEnv("QUAESTOR_KEYSTORE_PASSPHRASE"),
    relayer: loadKeypairFile(reqEnv("QUAESTOR_RELAYER_KEYPAIR")),
  };
}
