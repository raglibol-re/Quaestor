"use client";

import { BN, availableOf, type BudgetTreeNode, type ProjectData } from "@quaestor/sdk";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BudgetNode, type NodeAction } from "@/components/BudgetNode";
import { TxFeed } from "@/components/TxFeed";
import { Amount } from "@/components/brand/Amount";
import { Button } from "@/components/brand/Button";
import { Mark } from "@/components/brand/Mark";
import { DEMO_PROJECT, RPC_URL } from "@/lib/config";
import { readClient, writeClient } from "@/lib/quaestor";

const ACTION_MSG: Record<NodeAction, string> = {
  freeze: "Branch frozen.",
  unfreeze: "Branch unfrozen.",
  revoke: "Budget revoked onchain.",
  reclaim: "Funds reclaimed.",
};

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
        setToast({ msg: ACTION_MSG[action] });
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
          <Mark className="brand-mark" />
          <h1 className="wordmark">Quaestor</h1>
          <span className="tagline">Onchain budgets for AI agents.</span>
        </div>
        <div className="controls">
          <input
            className="input"
            placeholder="Project address (base58)"
            value={projectInput}
            onChange={(e) => setProjectInput(e.target.value.trim())}
            onKeyDown={(e) => e.key === "Enter" && setProject(projectInput)}
          />
          <Button onClick={() => setProject(projectInput)}>Load</Button>
          <WalletMultiButton />
        </div>
      </header>

      <section className="summary">
        <div className="stat">
          <div className="label">Total budget</div>
          <div className="v">
            {stats ? <Amount value={stats.allocated} size="lg" /> : <span className="amount-lg">—</span>}
          </div>
        </div>
        <div className="stat">
          <div className="label">Spent</div>
          <div className="v">
            {stats ? <Amount value={stats.spent} size="lg" /> : <span className="amount-lg">—</span>}
          </div>
        </div>
        <div className="stat">
          <div className="label">Root available</div>
          <div className="v">
            {stats ? <Amount value={stats.available} size="lg" /> : <span className="amount-lg">—</span>}
          </div>
        </div>
        <div className="stat">
          <div className="label">Agents</div>
          <div className="v">
            <span className="amount-lg">{stats ? stats.agents : "—"}</span>
          </div>
        </div>
      </section>

      <div className="layout">
        <div className="panel">
          <div className="panel-title label">Budget tree{canManage ? " · you are the owner" : ""}</div>
          {error && <div className="empty">{error}</div>}
          {!error && !tree && <div className="empty">Enter a project address to load its budget tree.</div>}
          {tree && (
            <div className="tree">
              <BudgetNode node={tree} depth={0} canManage={canManage} onAction={onAction} busy={busy} />
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title label">Vault activity</div>
          <TxFeed rpc={RPC_URL} address={projectData?.vault ?? null} />
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
