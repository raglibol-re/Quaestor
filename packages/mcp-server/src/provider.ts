import { AnchorProvider } from "@coral-xyz/anchor";
import {
  type ConfirmOptions,
  type Commitment,
  Connection,
  type Signer,
  Transaction,
  type TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * An AnchorProvider that confirms transactions by POLLING `getSignatureStatuses` instead of a
 * websocket signature subscription.
 *
 * The default provider calls `connection.confirmTransaction`, which opens a websocket
 * subscription. On some RPCs — notably a `solana-test-validator` running under WSL — that
 * subscription never delivers, so `.rpc()` hangs until the blockhash expires (~60–90s) and the
 * caller (e.g. an MCP tool request) times out. Polling is reliable everywhere, including devnet.
 *
 * Only `sendAndConfirm` is overridden; construction is untouched so server startup is unchanged.
 */
export class PollingProvider extends AnchorProvider {
  async sendAndConfirm(
    tx: Transaction | VersionedTransaction,
    signers: Signer[] = [],
    opts?: ConfirmOptions
  ): Promise<TransactionSignature> {
    // Our instructions use legacy transactions; defer anything versioned to the default path.
    if (tx instanceof VersionedTransaction) {
      return super.sendAndConfirm(tx, signers, opts);
    }
    const commitment: Commitment =
      opts?.preflightCommitment ?? this.opts.preflightCommitment ?? "confirmed";

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash(commitment);
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = this.wallet.publicKey;

    tx = await this.wallet.signTransaction(tx);
    for (const s of signers) tx.partialSign(s);

    // skipPreflight=false: a failing tx (e.g. over-limit) throws here with program logs, so the
    // existing error-code parsing (errors.ts) still works; only successful txs reach polling.
    const t0 = Date.now();
    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: commitment,
    });
    if (process.env.QUAESTOR_DEBUG) console.error(`[prov] sent ${sig} (+${Date.now() - t0}ms)`);
    await this.pollConfirm(sig, lastValidBlockHeight, commitment);
    if (process.env.QUAESTOR_DEBUG) console.error(`[prov] confirmed ${sig} (+${Date.now() - t0}ms)`);
    return sig;
  }

  private async pollConfirm(
    sig: TransactionSignature,
    lastValidBlockHeight: number,
    commitment: Commitment
  ): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const { value } = await this.connection.getSignatureStatuses([sig]);
      const st = value[0];
      if (st) {
        if (st.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(st.err)}`);
        if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") {
          return;
        }
      } else {
        // Not yet seen: if the blockhash has expired, it will never land.
        const height = await this.connection.getBlockHeight(commitment);
        if (height > lastValidBlockHeight) {
          throw new Error(`Transaction ${sig} expired (blockhash no longer valid).`);
        }
      }
      await sleep(800);
    }
    throw new Error(`Transaction ${sig} not confirmed within 60s.`);
  }
}
