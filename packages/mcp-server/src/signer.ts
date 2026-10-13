// Agent key custody abstraction. A signer owns HOW the agent's Ed25519 key is custodied and
// produces the signing Keypair on demand — without the model ever seeing it:
//   - LocalKeystoreSolanaSigner: the key is encrypted in the local file keystore (stdio).
//   - InjectedKeypairSigner: a keypair already resolved by the caller (e.g. the remote host
//     after envelope-decrypting a KMS-wrapped key). Keep its lifetime as short as possible.
// Onchain authority is unchanged — the agent still signs its own transactions (no delegation).
import { Keypair } from "@solana/web3.js";
import { loadAgent } from "./keystore";

export interface SolanaAgentSigner {
  readonly kind: "solana";
  /** Resolve the signing keypair (decrypt-on-demand for custodied keys). */
  keypair(): Promise<Keypair>;
}

/** stdio custody: the key lives encrypted in `~/.quaestor/keys` and is decrypted with the
 *  passphrase from env. Identical behavior to the pre-abstraction path. */
export class LocalKeystoreSolanaSigner implements SolanaAgentSigner {
  readonly kind = "solana" as const;
  constructor(
    private readonly name: string,
    private readonly passphrase: string
  ) {}
  async keypair(): Promise<Keypair> {
    return loadAgent(this.name, this.passphrase);
  }
}

/** Remote/host custody: the caller resolved the keypair already (e.g. envelope-decrypted a
 *  KMS-wrapped key). Used by apps/connector; also handy in tests. */
export class InjectedKeypairSigner implements SolanaAgentSigner {
  readonly kind = "solana" as const;
  constructor(private readonly kp: Keypair) {}
  async keypair(): Promise<Keypair> {
    return this.kp;
  }
}
