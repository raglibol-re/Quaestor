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

/** Which chain this MCP server instance targets. `tempo`/`base` are EVM. */
export type ChainKind = "solana" | "tempo" | "base";

export function chainKind(): ChainKind {
  const c = (process.env.QUAESTOR_CHAIN || "solana").toLowerCase();
  if (c === "solana" || c === "tempo" || c === "base") return c;
  throw new Error(`unknown QUAESTOR_CHAIN "${c}" (expected solana|tempo|base)`);
}

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

export interface EvmConfig {
  chain: ChainKind; // tempo | base
  rpcUrl: string;
  contract: `0x${string}`;
  forwarder: `0x${string}`;
  chainId: number;
  projectKey: `0x${string}`;
  agent: string;
  passphrase: string;
  relayerKey: `0x${string}`;
}

function reqHex(name: string): `0x${string}` {
  const v = reqEnv(name);
  if (!v.startsWith("0x")) throw new Error(`${name} must be a 0x-prefixed hex string`);
  return v as `0x${string}`;
}

/** Config for an EVM-targeted MCP server instance (QUAESTOR_CHAIN=tempo|base). */
export function loadEvmConfig(chain: ChainKind): EvmConfig {
  return {
    chain,
    rpcUrl: reqEnv("QUAESTOR_EVM_RPC_URL"),
    contract: reqHex("QUAESTOR_CONTRACT"),
    forwarder: reqHex("QUAESTOR_FORWARDER"),
    chainId: Number(reqEnv("QUAESTOR_CHAIN_ID")),
    projectKey: reqHex("QUAESTOR_EVM_PROJECT"),
    agent: reqEnv("QUAESTOR_AGENT"),
    passphrase: reqEnv("QUAESTOR_KEYSTORE_PASSPHRASE"),
    relayerKey: reqHex("QUAESTOR_EVM_RELAYER_KEY"),
  };
}
