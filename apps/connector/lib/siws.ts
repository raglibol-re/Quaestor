// Sign-In-With-Solana for the consent screen. The project OWNER signs a human-readable message
// (Phantom signMessage) that binds an MCP token to exactly one mandate node; we verify the Ed25519
// signature against Project.owner. The message moves no funds and grants no access by itself.
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export interface SiwsFields {
  project: string;
  node: string;
  clientId: string;
  codeChallenge: string;
  nonce: string;
  issuedAt: string; // ISO-8601
}

/** The exact message the owner signs. Deterministic from the fields (server-generated). */
export function buildSiwsMessage(f: SiwsFields): string {
  return [
    "Quaestor connector — bind an MCP token to a mandate node.",
    "",
    `Project: ${f.project}`,
    `Agent node: ${f.node}`,
    `Client: ${f.clientId}`,
    `PKCE: ${f.codeChallenge}`,
    `Nonce: ${f.nonce}`,
    `Issued: ${f.issuedAt}`,
    "",
    "Signing binds a token to THIS node only. It moves no funds.",
  ].join("\n");
}

/** Verify that `signatureB58` is `ownerB58`'s Ed25519 signature over `message`. */
export function verifySiws(message: string, signatureB58: string, ownerB58: string): boolean {
  try {
    const msg = new TextEncoder().encode(message);
    const sig = bs58.decode(signatureB58);
    const owner = new PublicKey(ownerB58).toBytes();
    return nacl.sign.detached.verify(msg, sig, owner);
  } catch {
    return false;
  }
}
