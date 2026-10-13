"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { buildSiwsMessage } from "@/lib/siws";

interface NodeInfo {
  node: string;
  pubkey: string;
  available: string | null;
  perTxLimit: string | null;
  dailyLimit: string | null;
  status: string | null;
}
interface Prep {
  chain: string;
  project: string;
  owner: string;
  nodes: NodeInfo[];
  clientId: string;
  codeChallenge: string;
}

function short(a: string, n = 4) {
  return a.length <= 2 * n + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}

export default function Consent() {
  const { publicKey, signMessage, connected } = useWallet();
  const [rt, setRt] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URL(window.location.href).searchParams.get("rt");
    setRt(t);
    if (!t) {
      setErr("Missing authorize request — start from your MCP client.");
      return;
    }
    fetch(`/api/oauth/prepare?rt=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setErr(d.error_description || d.error || "Failed to load.");
          return;
        }
        setPrep(d as Prep);
        if ((d as Prep).nodes[0]) setSelected((d as Prep).nodes[0].node);
      })
      .catch(() => setErr("Failed to load the consent request."));
  }, []);

  const isOwner = useMemo(
    () => !!publicKey && !!prep && publicKey.toBase58() === prep.owner,
    [publicKey, prep]
  );

  async function approve() {
    setErr("");
    if (!rt || !prep || !selected) return;
    if (!connected || !publicKey || !signMessage) {
      setErr("Connect the project owner's wallet first.");
      return;
    }
    if (!isOwner) {
      setErr(`Connected wallet is not the project owner (${short(prep.owner)}).`);
      return;
    }
    setBusy(true);
    try {
      const nonce = crypto.randomUUID();
      const issuedAt = new Date().toISOString();
      const message = buildSiwsMessage({
        project: prep.project,
        node: selected,
        clientId: prep.clientId,
        codeChallenge: prep.codeChallenge,
        nonce,
        issuedAt,
      });
      const sig = await signMessage(new TextEncoder().encode(message));
      const res = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rt, node: selected, nonce, issuedAt, signature: bs58.encode(sig) }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error_description || d.error || "Consent failed.");
        setBusy(false);
        return;
      }
      window.location.href = d.redirect as string;
    } catch (e) {
      setErr((e as Error).message || "Signing was cancelled.");
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <p className="label">Quaestor connector</p>
      <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, margin: "8px 0 4px" }}>
        Authorize an MCP token
      </h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Approve binding a claude.ai connection to <strong>one</strong> mandate node. The agent key stays
        custodied — the model never sees it. This moves no funds.
      </p>

      {!prep && !err && <p className="muted">Loading…</p>}

      {prep && (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <span>
              Project <b>{short(prep.project)}</b>
            </span>
            <span>
              Owner <b>{short(prep.owner)}</b>
            </span>
          </div>

          <p className="label" style={{ marginTop: 16 }}>
            Mandate node
          </p>
          {prep.nodes.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              No custodied nodes yet. Provision one with the connector CLI, then retry.
            </p>
          )}
          {prep.nodes.map((n) => (
            <label key={n.node} className={`node${selected === n.node ? " sel" : ""}`}>
              <input
                type="radio"
                name="node"
                checked={selected === n.node}
                onChange={() => setSelected(n.node)}
                style={{ marginTop: 3 }}
              />
              <span style={{ minWidth: 0 }}>
                <span className="mono">{n.pubkey}</span>
                <span className="row">
                  <span>
                    available <b>{n.available ?? "—"}</b>
                  </span>
                  <span>
                    per-tx <b>{n.perTxLimit ?? "unlimited"}</b>
                  </span>
                  <span>
                    daily <b>{n.dailyLimit ?? "unlimited"}</b>
                  </span>
                  {n.status && (
                    <span>
                      status <b>{n.status}</b>
                    </span>
                  )}
                </span>
              </span>
            </label>
          ))}

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
            <WalletMultiButton />
            <button className="btn" onClick={approve} disabled={busy || !selected || prep.nodes.length === 0}>
              {busy ? "Signing…" : "Approve & connect"}
            </button>
          </div>
          {connected && !isOwner && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Connect the owner wallet <span className="mono">{short(prep.owner)}</span> to approve.
            </p>
          )}
        </div>
      )}

      {err && <p className="err">{err}</p>}
    </div>
  );
}
