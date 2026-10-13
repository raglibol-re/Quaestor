// Resolve an authenticated request to the single mandate node its token is bound to, then build
// the MCP backend acting AS that node (custodied key injected). A token can never address any
// other node — the binding comes only from the verified JWT, never from tool input.
import { PublicKey } from "@solana/web3.js";
import { InjectedKeypairSigner, SolanaOps, type BuiltOps, type McpConfig } from "@quaestor/mcp-server";
import { env } from "./env";
import { verifyAccessToken } from "./tokens";
import { isAccessRevoked } from "./db";
import { loadCustodiedKeypair } from "./custody";

export interface Principal {
  chain: string;
  project: string;
  node: string;
  clientId: string;
}

/** Parse + verify a Bearer access token into its node binding. Throws if missing/invalid/revoked. */
export async function principalFromBearer(authHeader: string | null): Promise<Principal> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("missing bearer token");
  }
  const claims = await verifyAccessToken(authHeader.slice(7).trim());
  if (await isAccessRevoked(claims.jti)) throw new Error("token revoked");
  return { chain: claims.chain, project: claims.project, node: claims.node, clientId: claims.cid };
}

/** Build the per-request MCP backend for the token's node (Solana). */
export async function builtOpsFor(p: Principal): Promise<BuiltOps> {
  if (p.chain !== "solana") throw new Error(`unsupported chain for remote connector: ${p.chain}`);
  const kp = await loadCustodiedKeypair(p.chain, p.project, p.node);
  const config: McpConfig = {
    rpcUrl: env().rpcUrl,
    project: new PublicKey(p.project),
    agent: p.node,
    passphrase: "", // unused — key is injected, not loaded from a keystore
    relayer: env().relayer,
  };
  const ops = await SolanaOps.fromConfig(config, new InjectedKeypairSigner(kp));
  return { kind: "budget", ops };
}
