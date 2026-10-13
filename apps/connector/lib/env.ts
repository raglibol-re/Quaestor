// Server-side config for the connector. Reads env once, validates, and refuses mainnet
// (security principle 4). NEVER log any field of this object — it holds secrets.
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";

// Claude registers via DCR with a redirect under claude.ai / claude.com (the exact path has
// varied: auth_callback / oauth_callback). Accept any https MCP callback on those hosts.
function isClaudeCallback(uri: string): boolean {
  try {
    const u = new URL(uri);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && (host === "claude.ai" || host === "claude.com") && u.pathname.startsWith("/api/mcp/");
  } catch {
    return false;
  }
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

/** Parse a relayer secret: base58 secret key, or a Solana-CLI JSON [u8;64] array. */
function parseRelayer(secret: string): Keypair {
  const s = secret.trim();
  if (s.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(s));
}

export interface ConnectorEnv {
  chain: "solana";
  rpcUrl: string;
  project: PublicKey;
  connectorUrl: string;
  allowedRedirects: string[];
  databaseUrl: string;
  relayer: Keypair;
  masterKey: Buffer; // 32 bytes
  jwtSecret: Uint8Array;
}

let cached: ConnectorEnv | null = null;

export function env(): ConnectorEnv {
  if (cached) return cached;

  const rpcUrl = process.env.QUAESTOR_RPC_URL || "https://api.devnet.solana.com";
  if (/mainnet/i.test(rpcUrl)) {
    throw new Error("Quaestor connector refuses mainnet (devnet/testnet only).");
  }

  const masterKey = Buffer.from(req("QUAESTOR_MASTER_KEY"), "base64");
  if (masterKey.length !== 32) {
    throw new Error("QUAESTOR_MASTER_KEY must be base64 of exactly 32 bytes.");
  }

  const connectorUrl = req("QUAESTOR_CONNECTOR_URL").replace(/\/+$/, "");
  const extra = (process.env.QUAESTOR_ALLOWED_REDIRECTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  cached = {
    chain: "solana",
    rpcUrl,
    project: new PublicKey(req("QUAESTOR_PROJECT")),
    connectorUrl,
    allowedRedirects: [CLAUDE_REDIRECT, ...extra],
    databaseUrl: req("DATABASE_URL"),
    relayer: parseRelayer(req("QUAESTOR_RELAYER_SECRET")),
    masterKey,
    jwtSecret: new Uint8Array(Buffer.from(req("QUAESTOR_JWT_SECRET"), "base64")),
  };
  return cached;
}

/** Is a redirect URI allowed? (exact allowlist OR a Claude MCP callback host) */
export function isAllowedRedirect(uri: string): boolean {
  return env().allowedRedirects.includes(uri) || isClaudeCallback(uri);
}

/** Secret values that must never appear in logs/errors (for redaction). */
export function secretValues(): string[] {
  const e = env();
  return [
    e.databaseUrl,
    e.masterKey.toString("base64"),
    Buffer.from(e.jwtSecret).toString("base64"),
    bs58.encode(e.relayer.secretKey),
  ].filter(Boolean);
}
