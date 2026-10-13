// KMS-wrapped-DEK custody. An agent's Ed25519 secret key is stored ENVELOPE-encrypted, never in
// plaintext at rest and never seen by the model:
//   secret  --AES-256-GCM(DEK)-->  sk        (per-key data key)
//   DEK     --wrap(master key)-->   dek       (master key: dev = env; prod = AWS KMS)
// At signing time the DEK is unwrapped and the secret decrypted IN MEMORY, then discarded.
// The `scheme` tag lets a future AWS-KMS provider coexist with dev envelopes.
import { Keypair } from "@solana/web3.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";
import { getAgentKey, insertAgentKey } from "./db";

const SCHEME_DEV = "dev-aesgcm";

interface GcmBlob {
  iv: string;
  tag: string;
  ct: string;
}
interface Envelope {
  v: 1;
  scheme: string;
  dek: GcmBlob; // DEK wrapped by the master key
  sk: GcmBlob; // agent secret encrypted under the DEK
}

function gcmEncrypt(key: Buffer, data: Buffer): GcmBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  return { iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}
function gcmDecrypt(key: Buffer, b: GcmBlob): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(b.iv, "hex"));
  decipher.setAuthTag(Buffer.from(b.tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(b.ct, "hex")), decipher.final()]);
}

// --- master key provider (dev) ---
// wrap/unwrap the DEK. To switch to AWS KMS, add a scheme "aws-kms" branch calling KMS Encrypt/Decrypt.
function wrapDek(dek: Buffer): GcmBlob {
  return gcmEncrypt(env().masterKey, dek);
}
function unwrapDek(scheme: string, dek: GcmBlob): Buffer {
  if (scheme !== SCHEME_DEV) throw new Error(`unknown custody scheme: ${scheme}`);
  return gcmDecrypt(env().masterKey, dek);
}

/** Envelope-encrypt an agent secret key into the stored blob. */
export function sealSecret(secret: Uint8Array): string {
  const dek = randomBytes(32);
  const env1: Envelope = {
    v: 1,
    scheme: SCHEME_DEV,
    dek: wrapDek(dek),
    sk: gcmEncrypt(dek, Buffer.from(secret)),
  };
  dek.fill(0);
  return Buffer.from(JSON.stringify(env1), "utf8").toString("base64");
}

/** Decrypt an envelope back to the agent secret key bytes (in memory only). */
export function openSecret(encBlob: string): Uint8Array {
  const e = JSON.parse(Buffer.from(encBlob, "base64").toString("utf8")) as Envelope;
  const dek = unwrapDek(e.scheme, e.dek);
  try {
    return new Uint8Array(gcmDecrypt(dek, e.sk));
  } finally {
    dek.fill(0);
  }
}

/** Generate a fresh custodied agent key, store its envelope, and return the keypair. */
export async function provisionAgentKey(chain: string, project: string, kp: Keypair): Promise<void> {
  await insertAgentKey({
    chain,
    project,
    node: kp.publicKey.toBase58(),
    pubkey: kp.publicKey.toBase58(),
    curve: "ed25519",
    enc_blob: sealSecret(kp.secretKey),
  });
}

/** Load and decrypt a custodied agent keypair for one node. Throws if the node has no key. */
export async function loadCustodiedKeypair(chain: string, project: string, node: string): Promise<Keypair> {
  const row = await getAgentKey(chain, project, node);
  if (!row) throw new Error(`no custodied key for node ${node}`);
  const secret = openSecret(row.enc_blob);
  try {
    return Keypair.fromSecretKey(secret);
  } finally {
    secret.fill(0);
  }
}
