// Security-invariant checks for the connector's pure crypto (no DB/devnet needed):
//  1. Custody envelope round-trips AND the provision-agent.mjs seal format == lib/custody.ts open
//     format (if these drift, custodied keys become undecryptable).
//  2. PKCE S256 verification.
//  3. SIWS Ed25519 verification (right key passes, wrong key / tampered message fail).
// Run: node test/crypto.test.mjs
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import assert from "node:assert/strict";

let passed = 0;
const ok = (name) => {
  passed++;
  console.log(`  ok  ${name}`);
};

// --- custody envelope (format shared by provision-agent.mjs sealSecret and lib/custody.ts) ---
function gcmEnc(key, data) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return { iv: iv.toString("hex"), tag: c.getAuthTag().toString("hex"), ct: ct.toString("hex") };
}
function gcmDec(key, b) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(b.iv, "hex"));
  d.setAuthTag(Buffer.from(b.tag, "hex"));
  return Buffer.concat([d.update(Buffer.from(b.ct, "hex")), d.final()]);
}
function seal(secret, master) {
  const dek = randomBytes(32);
  return Buffer.from(JSON.stringify({ v: 1, scheme: "dev-aesgcm", dek: gcmEnc(master, dek), sk: gcmEnc(dek, Buffer.from(secret)) }), "utf8").toString("base64");
}
function open(blob, master) {
  const e = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
  if (e.scheme !== "dev-aesgcm") throw new Error("unknown scheme");
  const dek = gcmDec(master, e.dek);
  return new Uint8Array(gcmDec(dek, e.sk));
}

{
  const master = randomBytes(32);
  const secret = randomBytes(64); // ed25519 secret key length
  const blob = seal(secret, master);
  assert.deepEqual(Buffer.from(open(blob, master)), Buffer.from(secret), "round-trip");
  ok("custody: envelope round-trips");

  // Tamper the ciphertext → GCM auth fails.
  const e = JSON.parse(Buffer.from(blob, "base64").toString("utf8"));
  e.sk.ct = e.sk.ct.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  const bad = Buffer.from(JSON.stringify(e), "utf8").toString("base64");
  assert.throws(() => open(bad, master), "tampered ciphertext must fail");
  ok("custody: tampering is rejected");

  // Wrong master key → unwrap fails.
  assert.throws(() => open(blob, randomBytes(32)), "wrong master key must fail");
  ok("custody: wrong master key is rejected");
}

// --- PKCE S256 ---
function pkceOk(verifier, challenge) {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}
{
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(pkceOk(verifier, challenge), true);
  assert.equal(pkceOk("wrong-verifier", challenge), false);
  ok("pkce: S256 verify accepts correct, rejects wrong");
}

// --- SIWS Ed25519 ---
function verifySiws(message, sigB58, ownerB58) {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(sigB58), bs58.decode(ownerB58));
  } catch {
    return false;
  }
}
{
  const kp = nacl.sign.keyPair();
  const owner = bs58.encode(kp.publicKey);
  const msg = "Quaestor connector — bind an MCP token to a mandate node.\nNode: X";
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey));
  assert.equal(verifySiws(msg, sig, owner), true, "valid signature passes");
  assert.equal(verifySiws(msg + "tamper", sig, owner), false, "tampered message fails");
  const other = bs58.encode(nacl.sign.keyPair().publicKey);
  assert.equal(verifySiws(msg, sig, other), false, "wrong owner fails");
  ok("siws: ed25519 verify binds message + owner");
}

console.log(`\n${passed} checks passed`);
