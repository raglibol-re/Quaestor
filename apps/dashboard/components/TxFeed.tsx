"use client";

import { Connection, PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/config";
import { short } from "@/lib/quaestor";

interface Entry {
  signature: string;
  blockTime: number | null;
  err: boolean;
}

export function TxFeed({ rpc, address }: { rpc: string; address: PublicKey | null }) {
  const [items, setItems] = useState<Entry[]>([]);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const load = async () => {
      try {
        const conn = new Connection(rpc, "confirmed");
        const sigs = await conn.getSignaturesForAddress(address, { limit: 12 });
        if (!alive) return;
        setItems(
          sigs.map((s) => ({ signature: s.signature, blockTime: s.blockTime ?? null, err: !!s.err }))
        );
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [rpc, address]);

  if (!address) return <div className="empty">Load a project to see activity.</div>;
  if (items.length === 0) return <div className="empty">No transactions yet.</div>;

  return (
    <div className="feed">
      {items.map((e) => (
        <div className="feed-item" key={e.signature}>
          <a className="sig" href={explorerTx(e.signature)} target="_blank" rel="noreferrer">
            {short(e.signature, 6)}
          </a>
          <span className={e.err ? "err" : "t"}>
            {e.err ? "failed · " : ""}
            {e.blockTime ? new Date(e.blockTime * 1000).toLocaleTimeString() : "pending"}
          </span>
        </div>
      ))}
    </div>
  );
}
