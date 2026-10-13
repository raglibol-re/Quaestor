// Server-side config for the connector. Reads env once, validates, and refuses mainnet
// (security principle 4). NEVER log any field of this object — it holds secrets.
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export const CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback";

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

/** Is a redirect URI allowed? (exact match against the allowlist) */
export function isAllowedRedirect(uri: string): boolean {
  return env().allowedRedirects.includes(uri);
}
