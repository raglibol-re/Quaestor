#!/usr/bin/env node
// Provision the FIRST server-custodied agent node for the remote connector: the OWNER signs an
// on-chain allocate_child to a freshly generated child key, which is then envelope-encrypted and
// stored in Neon. After this, the owner adds the connector in claude.ai, signs the SIWS consent,
// and picks this node. (Growth below the root uses create_submandate invites — no CLI needed.)
//
// Run from apps/connector with the connector env set (DATABASE_URL, QUAESTOR_PROJECT, QUAESTOR_RPC_URL,
// QUAESTOR_RELAYER_SECRET, QUAESTOR_MASTER_KEY) plus QUAESTOR_OWNER_KEYPAIR (path to the owner's
// Solana keypair JSON):
//   node scripts/provision-agent.mjs --label research --amount 20 --per-tx 0.5 --daily 5
import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import { QuaestorClient, findBudgetPda, toBaseUnits } from "@quaestor/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { neon } from "@neondatabase/serverless";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}
function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path.replace(/^~/, process.env.HOME || ""), "utf8"))));
}
function parseRelayer(s) {
  return s.trim().startsWith("[")
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)))
    : Keypair.fromSecretKey(Buffer.from(s, "base64").length === 64 ? Buffer.from(s, "base64") : (() => { throw new Error("relayer must be a JSON [u8;64] for the CLI"); })());
}

// Envelope seal — MUST match apps/connector/lib/custody.ts (dev-aesgcm scheme).
function gcm(key, data) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return { iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}
function sealSecret(secret, masterKey) {
  const dek = randomBytes(32);
  const env = { v: 1, scheme: "dev-aesgcm", dek: gcm(masterKey, dek), sk: gcm(dek, Buffer.from(secret)) };
  dek.fill(0);
  return Buffer.from(JSON.stringify(env), "utf8").toString("base64");
}

async function main() {
  const rpcUrl = process.env.QUAESTOR_RPC_URL || "https://api.devnet.solana.com";
  if (/mainnet/i.test(rpcUrl)) throw new Error("refusing mainnet");
  const project = new PublicKey(req("QUAESTOR_PROJECT"));
  const masterKey = Buffer.from(req("QUAESTOR_MASTER_KEY"), "base64");
  if (masterKey.length !== 32) throw new Error("QUAESTOR_MASTER_KEY must be base64 of 32 bytes");
  const owner = loadKeypair(req("QUAESTOR_OWNER_KEYPAIR"));
  const relayer = parseRelayer(req("QUAESTOR_RELAYER_SECRET"));
  const sql = neon(req("DATABASE_URL"));

  const label = arg("label", "agent");
  const amount = arg("amount", "10");
  const perTx = arg("per-tx", null);
  const daily = arg("daily", null);
  const expiresHours = arg("expires-hours", null);

  const connection = new Connection(rpcUrl, "confirmed");
  const client = QuaestorClient.fromProvider(new AnchorProvider(connection, new Wallet(relayer), { commitment: "confirmed" }));

  // Root budget: the owner is the root agent. The new node is a direct child of root.
  const [parent] = findBudgetPda(project, owner.publicKey);
  const child = Keypair.generate();
  const dailyBase = daily ? toBaseUnits(daily) : null;

  const sig = await client
    .allocateChild({
      authority: owner.publicKey,
      feePayer: relayer.publicKey,
      project,
      parent,
      childAgent: child.publicKey,
      label,
      amount: toBaseUnits(amount),
      perTxLimit: perTx ? toBaseUnits(perTx) : null,
      periodLimit: dailyBase,
      periodSeconds: dailyBase ? 86400 : 0,
      expiresAt: expiresHours ? new BN(Math.floor(Date.now() / 1000) + Math.floor(Number(expiresHours) * 3600)) : null,
      canDelegate: true,
      allowlist: [],
    })
    .signers([owner])
    .rpc();

  const node = child.publicKey.toBase58();
  await sql`INSERT INTO agent_key (chain, project, node, pubkey, curve, enc_blob)
    VALUES ('solana', ${project.toBase58()}, ${node}, ${node}, 'ed25519', ${sealSecret(child.secretKey, masterKey)})
    ON CONFLICT (chain, project, node) DO NOTHING`;

  console.log(`\n✓ Provisioned custodied node "${label}"`);
  console.log(`  node (pubkey): ${node}`);
  console.log(`  child budget : ${findBudgetPda(project, child.publicKey)[0].toBase58()}`);
  console.log(`  allocate tx  : ${sig}`);
  console.log(`\nNext: add the connector in claude.ai, complete the SIWS consent as the owner, and pick this node.`);
}

main().catch((e) => {
  console.error("provision failed:", e?.message ?? e);
  process.exit(1);
});
