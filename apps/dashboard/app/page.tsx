"use client";

import { BN, availableOf, fromBaseUnits, type BudgetTreeNode, type ProjectData } from "@quaestor/sdk";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BudgetNode, type NodeAction } from "@/components/BudgetNode";
import { TxFeed } from "@/components/TxFeed";
import { DEMO_PROJECT, RPC_URL } from "@/lib/config";
import { readClient, writeClient } from "@/lib/quaestor";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

function walk(node: BudgetTreeNode, fn: (n: BudgetTreeNode) => void) {
  fn(node);
  node.children.forEach((c) => walk(c, fn));
}

export default function Page() {
  const wallet = useAnchorWallet();
  const [projectInput, setProjectInput] = useState(DEMO_PROJECT);
  const [project, setProject] = useState(DEMO_PROJECT);
  const [tree, setTree] = useState<BudgetTreeNode | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectPk = useMemo(() => {
    try {
      return project ? new PublicKey(project) : null;
    } catch {
      return null;
    }
  }, [project]);

  const load = useCallback(async () => {
    if (!projectPk) return;
    try {
      const c = readClient(RPC_URL);
      const [t, pd] = await Promise.all([c.fetchBudgetTree(projectPk), c.getProject(projectPk)]);
      setTree(t);
      setProjectData(pd);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "failed to load project");
      setTree(null);
      setProjectData(null);
    }
  }, [projectPk]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const canManage = !!wallet && !!projectData && wallet.publicKey.equals(projectData.owner);

  const onAction = useCallback(
    async (action: NodeAction, node: BudgetTreeNode) => {
      if (!wallet || !projectPk) return;
      setBusy(node.pubkey.toBase58());
      try {
        const c = writeClient(RPC_URL, wallet);
        if (action === "freeze" || action === "unfreeze") {
          await c
            .setStatus({ owner: wallet.publicKey, project: projectPk, budget: node.pubkey, freeze: action === "freeze" })
            .rpc();
        } else if (action === "revoke") {
          await c.revoke({ owner: wallet.publicKey, project: projectPk, budget: node.pubkey }).rpc();
        } else {
          await (
            await c.reclaim({
              authority: wallet.publicKey,
              project: projectPk,
              parent: node.account.parent!,
              child: node.pubkey,
            })
          ).rpc();
        }
        setToast({ msg: `${action} succeeded` });
        await load();
      } catch (e: unknown) {
        setToast({ msg: e instanceof Error ? e.message : "action failed", err: true });
      } finally {
        setBusy(null);
      }
    },
    [wallet, projectPk, load]
  );

  const stats = useMemo(() => {
    if (!tree) return null;
    let spent = new BN(0);
    let nodes = 0;
    walk(tree, (n) => {
      spent = spent.add(n.account.spent as BN);
      nodes += 1;
    });
    return {
      allocated: tree.account.allocated as BN,
      available: availableOf(tree.account),
      spent,
      agents: nodes,
    };
  }, [tree]);

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">
          <h1>
            Quaestor<span className="dot">.</span>
          </h1>
          <span className="tagline">Give agents budgets, not keys.</span>
        </div>
        <div className="controls">
          <input
            className="input"
            placeholder="Project address (base58)"
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && setProject(projectInput)}
          />
          <button className="btn" onClick={() => setProject(projectInput)}>
            Load
          </button>
          <WalletMultiButton />
        </div>
      </header>

      <section className="summary">
        <div className="stat">
          <div className="k">Total budget</div>
          <div className="v">
            {stats ? fromBaseUnits(stats.allocated) : "—"} <small>USDC</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Spent</div>
          <div className="v">
            {stats ? fromBaseUnits(stats.spent) : "—"} <small>USDC</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Root available</div>
          <div className="v">
            {stats ? fromBaseUnits(stats.available) : "—"} <small>USDC</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">Agents</div>
          <div className="v">{stats ? stats.agents : "—"}</div>
        </div>
      </section>

      <div className="layout">
        <div className="panel">
          <div className="panel-title">Budget tree {canManage ? "· you are the owner" : ""}</div>
          {error && <div className="empty">⚠ {error}</div>}
          {!error && !tree && <div className="empty">Enter a project address to load its budget tree.</div>}
          {tree && (
            <div className="tree">
              <BudgetNode node={tree} depth={0} canManage={canManage} onAction={onAction} busy={busy} />
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">Vault activity</div>
          <TxFeed rpc={RPC_URL} address={projectData?.vault ?? null} />
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
