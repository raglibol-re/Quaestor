import { generatePrivateKey, privateKeyToAccount } from "@quaestor/evm-sdk";
import type { Address } from "@quaestor/evm-sdk";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hasAgent, keystoreDir } from "./keystore";

/**
 * EVM (secp256k1) agent keystore. Reuses the same scrypt + AES-256-GCM envelope and directory
 * as the Solana keystore (keystore.ts); only the key material differs — a 32-byte secp256k1
 * private key stored as a 0x-hex string, with the derived 0x address kept for display. The model
 * never sees the private key.
 */

interface EncryptedEvmKey {
  name: string;
  curve: "secp256k1";
  address: Address;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function keyPath(name: string): string {
  return join(keystoreDir(), `${name}.json`);
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

function savePrivateKey(name: string, privateKey: `0x${string}`, address: Address, passphrase: string): void {
  mkdirSync(keystoreDir(), { recursive: true });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(privateKey, "utf8")), cipher.final()]);
  const rec: EncryptedEvmKey = {
    name,
    curve: "secp256k1",
    address,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex"),
  };
  writeFileSync(keyPath(name), JSON.stringify(rec, null, 2), { mode: 0o600 });
}

/** Create + store a fresh secp256k1 agent key. */
export function createEvmAgent(name: string, passphrase: string): { privateKey: `0x${string}`; address: Address } {
  if (hasAgent(name)) throw new Error(`agent '${name}' already exists`);
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  savePrivateKey(name, privateKey, address, passphrase);
  return { privateKey, address };
}

/** Decrypt and return a stored secp256k1 agent key (throws on wrong passphrase / missing). */
export function loadEvmAgent(name: string, passphrase: string): { privateKey: `0x${string}`; address: Address } {
  if (!hasAgent(name)) throw new Error(`agent '${name}' not found in keystore (${keystoreDir()})`);
  const rec: EncryptedEvmKey = JSON.parse(readFileSync(keyPath(name), "utf8"));
  if (rec.curve !== "secp256k1") throw new Error(`agent '${name}' is not an EVM key`);
  const key = deriveKey(passphrase, Buffer.from(rec.salt, "hex"));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(rec.iv, "hex"));
  decipher.setAuthTag(Buffer.from(rec.authTag, "hex"));
  let privateKey: string;
  try {
    privateKey = Buffer.concat([
      decipher.update(Buffer.from(rec.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(`failed to decrypt agent '${name}' — wrong passphrase?`);
  }
  return { privateKey: privateKey as `0x${string}`, address: rec.address };
}
