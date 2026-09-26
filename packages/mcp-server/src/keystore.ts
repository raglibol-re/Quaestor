import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Local, encrypted keystore for agent keypairs. The model never sees a secret key. */

export function keystoreDir(): string {
  return process.env.QUAESTOR_KEYSTORE_DIR || join(homedir(), ".quaestor", "keys");
}

interface EncryptedKey {
  name: string;
  pubkey: string;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

function keyPath(name: string): string {
  return join(keystoreDir(), `${name}.json`);
}

export function hasAgent(name: string): boolean {
  return existsSync(keyPath(name));
}

/** Encrypt and store an agent keypair. Returns the file path. */
export function saveAgent(name: string, keypair: Keypair, passphrase: string): string {
  const dir = keystoreDir();
  mkdirSync(dir, { recursive: true });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const secret = Buffer.from(keypair.secretKey);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const rec: EncryptedKey = {
    name,
    pubkey: keypair.publicKey.toBase58(),
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  writeFileSync(keyPath(name), JSON.stringify(rec, null, 2), { mode: 0o600 });
  return keyPath(name);
}

/** Decrypt and return an agent keypair (throws on wrong passphrase / missing). */
export function loadAgent(name: string, passphrase: string): Keypair {
  if (!hasAgent(name)) throw new Error(`agent '${name}' not found in keystore (${keystoreDir()})`);
  const rec: EncryptedKey = JSON.parse(readFileSync(keyPath(name), "utf8"));
  const key = deriveKey(passphrase, Buffer.from(rec.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "hex"));
  decipher.setAuthTag(Buffer.from(rec.authTag, "hex"));
  let secret: Buffer;
  try {
    secret = Buffer.concat([decipher.update(Buffer.from(rec.ciphertext, "hex")), decipher.final()]);
  } catch {
    throw new Error(`failed to decrypt agent '${name}' — wrong passphrase?`);
  }
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

/** Public key of a stored agent, without decrypting the secret. */
export function agentPubkey(name: string): PublicKey {
  const rec: EncryptedKey = JSON.parse(readFileSync(keyPath(name), "utf8"));
  return new PublicKey(rec.pubkey);
}

/** List stored agents (names + pubkeys only). */
export function listAgents(): { name: string; pubkey: string }[] {
  const dir = keystoreDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const rec: EncryptedKey = JSON.parse(readFileSync(join(dir, f), "utf8"));
      return { name: rec.name, pubkey: rec.pubkey };
    });
}

/** Create + store a fresh agent keypair. */
export function createAgent(name: string, passphrase: string): Keypair {
  if (hasAgent(name)) throw new Error(`agent '${name}' already exists`);
  const kp = Keypair.generate();
  saveAgent(name, kp, passphrase);
  return kp;
}
