"use client";

import { BN, availableOf, type BudgetTreeNode, type ProjectData } from "@quaestor/sdk";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BudgetNode, type NodeAction } from "@/components/BudgetNode";
import { EvmBudgetTree } from "@/components/EvmBudgetTree";
import { TxFeed } from "@/components/TxFeed";
import { Amount } from "@/components/brand/Amount";
import { Button } from "@/components/brand/Button";
import { Mark } from "@/components/brand/Mark";
import { DEMO_PROJECT, EVM, EVM_ENABLED, RPC_URL, evmExplorerAddress } from "@/lib/config";
import { fetchEvmTree, type EvmBudgetNode } from "@/lib/evm";
import { readClient, writeClient } from "@/lib/quaestor";

type Chain = "solana" | "evm";

const ACTION_MSG: Record<NodeAction, string> = {
  freeze: "Branch frozen.",
  unfreeze: "Branch unfrozen.",
  revoke: "Mandate revoked onchain.",
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
function walkEvm(node: EvmBudgetNode, fn: (n: EvmBudgetNode) => void) {
  fn(node);
  node.children.forEach((c) => walkEvm(c, fn));
}
const toBN = (x: bigint) => new BN(x.toString());

export default function Page() {
  const wallet = useAnchorWallet();
  const [chain, setChain] = useState<Chain>("solana");
  const [projectInput, setProjectInput] = useState(DEMO_PROJECT);
  const [project, setProject] = useState(DEMO_PROJECT);
  const [tree, setTree] = useState<BudgetTreeNode | null>(null);
  const [evmTree, setEvmTree] = useState<EvmBudgetNode | null>(null);
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
    try {
      if (chain === "evm") {
        setEvmTree(await fetchEvmTree());
        setError(null);
        return;
      }
      if (!projectPk) return;
      const c = readClient(RPC_URL);
      const [t, pd] = await Promise.all([c.fetchBudgetTree(projectPk), c.getProject(projectPk)]);
      setTree(t);
      setProjectData(pd);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "failed to load project");
      setTree(null);
      setEvmTree(null);
      setProjectData(null);
    }
  }, [chain, projectPk]);

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

  const canManage = chain === "solana" && !!wallet && !!projectData && wallet.publicKey.equals(projectData.owner);

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
    if (chain === "solana" && tree) {
      let spent = new BN(0);
      let nodes = 0;
      walk(tree, (n) => {
        spent = spent.add(n.account.spent as BN);
        nodes += 1;
      });
      return { allocated: tree.account.allocated as BN, available: availableOf(tree.account), spent, agents: nodes };
    }
    if (chain === "evm" && evmTree) {
      let spent = 0n;
      let nodes = 0;
      walkEvm(evmTree, (n) => {
        spent += n.budget.spent;
        nodes += 1;
      });
      const r = evmTree.budget;
      return {
        allocated: toBN(r.allocated),
        available: toBN(r.allocated - r.spent - r.reservedForChildren),
        spent: toBN(spent),
        agents: nodes,
      };
    }
    return null;
  }, [chain, tree, evmTree]);

  const activeTree = chain === "solana" ? tree : evmTree;

  return (
    <div className="wrap">
      <header className="header">
        <div className="brand">
          <Mark className="brand-mark" />
          <h1 className="wordmark">Quaestor</h1>
          <span className="tagline">Onchain spending mandates for AI agents.</span>
        </div>
        <div className="controls">
          {EVM_ENABLED && (
            <div className="chain-switch">
              <Button variant={chain === "solana" ? "primary" : "secondary"} size="sm" onClick={() => setChain("solana")}>
                Solana
              </Button>
              <Button variant={chain === "evm" ? "primary" : "secondary"} size="sm" onClick={() => setChain("evm")}>
                {EVM.label}
              </Button>
            </div>
          )}
          {chain === "solana" ? (
            <>
              <input
                className="input"
                placeholder="Project address (base58)"
                value={projectInput}
                onChange={(e) => setProjectInput(e.target.value.trim())}
                onKeyDown={(e) => e.key === "Enter" && setProject(projectInput)}
              />
              <Button onClick={() => setProject(projectInput)}>Load</Button>
              <WalletMultiButton />
            </>
          ) : (
            <a className="input" href={evmExplorerAddress(EVM.contract)} target="_blank" rel="noreferrer">
              {EVM.label} · contract {EVM.contract.slice(0, 6)}…{EVM.contract.slice(-4)}
            </a>
          )}
        </div>
      </header>

      <section className="summary">
        <div className="stat">
          <div className="label">Total allocated</div>
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
          <div className="panel-title label">
            Mandate tree{chain === "solana" && canManage ? " · you are the owner" : ""}
            {chain === "evm" ? ` · ${EVM.label} (read-only)` : ""}
          </div>
          {error && <div className="empty">{error}</div>}
          {!error && !activeTree && (
            <div className="empty">
              {chain === "evm"
                ? "No mandates found for the configured EVM project."
                : "Enter a project address to load its mandate tree."}
            </div>
          )}
          {chain === "solana" && tree && (
            <div className="tree">
              <BudgetNode node={tree} depth={0} canManage={canManage} onAction={onAction} busy={busy} />
            </div>
          )}
          {chain === "evm" && evmTree && (
            <div className="tree">
              <EvmBudgetTree node={evmTree} depth={0} />
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-title label">Vault activity</div>
          {chain === "solana" ? (
            <TxFeed rpc={RPC_URL} address={projectData?.vault ?? null} />
          ) : (
            <div className="empty">
              <a href={evmExplorerAddress(EVM.contract)} target="_blank" rel="noreferrer">
                View the contract on the {EVM.label} explorer →
              </a>
            </div>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}
