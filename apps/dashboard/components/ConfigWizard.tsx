"use client";

import { useState } from "react";
import { CodeBlock } from "./CodeBlock";
import { EVM_DEFAULTS, SOLANA_DEFAULTS } from "@/lib/data";

type Chain = "solana" | "base";
type Host = "desktop" | "code";

function stripSlash(p: string) {
  return p.replace(/[\/\\]+$/, "");
}

export function ConfigWizard() {
  const [chain, setChain] = useState<Chain>("solana");
  const [host, setHost] = useState<Host>("desktop");

  // Shared
  const [repoPath, setRepoPath] = useState("");
  const [agent, setAgent] = useState("orchestrator");
  const [passphrase, setPassphrase] = useState("");

  // Solana
  const [rpcUrl, setRpcUrl] = useState<string>(SOLANA_DEFAULTS.rpcUrl);
  const [project, setProject] = useState("");
  const [relayerPath, setRelayerPath] = useState<string>(SOLANA_DEFAULTS.relayerPath);

  // EVM (Base Sepolia)
  const [evmRpcUrl, setEvmRpcUrl] = useState<string>(EVM_DEFAULTS.rpcUrl);
  const [contract, setContract] = useState<string>(EVM_DEFAULTS.contract);
  const [forwarder, setForwarder] = useState<string>(EVM_DEFAULTS.forwarder);
  const [chainId, setChainId] = useState<string>(EVM_DEFAULTS.chainId);
  const [evmProject, setEvmProject] = useState<string>(EVM_DEFAULTS.project);
  const [evmRelayerKey, setEvmRelayerKey] = useState("");

  const serverName = `quaestor-${agent.trim() || "orchestrator"}`;
  const serverPath = `${stripSlash(repoPath.trim()) || "<ABS_PATH>"}/packages/mcp-server/dist/server.js`;

  const env: [string, string][] =
    chain === "solana"
      ? [
          ["QUAESTOR_RPC_URL", rpcUrl.trim() || SOLANA_DEFAULTS.rpcUrl],
          ["QUAESTOR_PROJECT", project.trim() || "<PROJECT>"],
          ["QUAESTOR_AGENT", agent.trim() || "orchestrator"],
          ["QUAESTOR_KEYSTORE_PASSPHRASE", passphrase.trim() || "choose-a-strong-passphrase"],
          ["QUAESTOR_RELAYER_KEYPAIR", relayerPath.trim() || SOLANA_DEFAULTS.relayerPath],
        ]
      : [
          ["QUAESTOR_CHAIN", "base"],
          ["QUAESTOR_EVM_RPC_URL", evmRpcUrl.trim() || EVM_DEFAULTS.rpcUrl],
          ["QUAESTOR_CONTRACT", contract.trim() || EVM_DEFAULTS.contract],
          ["QUAESTOR_FORWARDER", forwarder.trim() || EVM_DEFAULTS.forwarder],
          ["QUAESTOR_CHAIN_ID", chainId.trim() || EVM_DEFAULTS.chainId],
          ["QUAESTOR_EVM_PROJECT", evmProject.trim() || EVM_DEFAULTS.project],
          ["QUAESTOR_AGENT", agent.trim() || "orchestrator"],
          ["QUAESTOR_KEYSTORE_PASSPHRASE", passphrase.trim() || "choose-a-strong-passphrase"],
          ["QUAESTOR_EVM_RELAYER_KEY", evmRelayerKey.trim() || "0x<relayer-private-key>"],
        ];

  const config = {
    mcpServers: {
      [serverName]: {
        command: "node",
        args: [serverPath],
        env: Object.fromEntries(env),
      },
    },
  };
  const json = JSON.stringify(config, null, 2);

  const cli = [
    `claude mcp add ${serverName}`,
    ...env.map(([k, v]) => `  -e ${k}="${v}"`),
    `  -- node ${serverPath}`,
  ].join(" \\\n");

  return (
    <div className="wizard">
      <div className="wizard-row">
        <div className="segmented" role="group" aria-label="Chain">
          <button type="button" aria-pressed={chain === "solana"} onClick={() => setChain("solana")}>
            Solana
          </button>
          <button type="button" aria-pressed={chain === "base"} onClick={() => setChain("base")}>
            Base (EVM)
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Host">
          <button type="button" aria-pressed={host === "desktop"} onClick={() => setHost("desktop")}>
            Claude Desktop
          </button>
          <button type="button" aria-pressed={host === "code"} onClick={() => setHost("code")}>
            Claude Code
          </button>
        </div>
      </div>

      <div className="field-grid">
        <Field className="col-span" label="Path to your Quaestor clone" req={!repoPath.trim()}>
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/Users/you/code/Quaestor"
            spellCheck={false}
          />
        </Field>

        {chain === "solana" ? (
          <>
            <Field label="RPC URL">
              <input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Project address" req={!project.trim()}>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="base58 project PDA from `init`"
                spellCheck={false}
              />
            </Field>
            <Field label="Agent name">
              <input value={agent} onChange={(e) => setAgent(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Relayer keypair path">
              <input value={relayerPath} onChange={(e) => setRelayerPath(e.target.value)} spellCheck={false} />
            </Field>
          </>
        ) : (
          <>
            <Field label="EVM RPC URL">
              <input value={evmRpcUrl} onChange={(e) => setEvmRpcUrl(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Chain ID">
              <input value={chainId} onChange={(e) => setChainId(e.target.value)} spellCheck={false} />
            </Field>
            <Field className="col-span" label="Quaestor contract">
              <input value={contract} onChange={(e) => setContract(e.target.value)} spellCheck={false} />
            </Field>
            <Field className="col-span" label="ERC-2771 forwarder">
              <input value={forwarder} onChange={(e) => setForwarder(e.target.value)} spellCheck={false} />
            </Field>
            <Field className="col-span" label="Project key (bytes32)">
              <input value={evmProject} onChange={(e) => setEvmProject(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Agent name">
              <input value={agent} onChange={(e) => setAgent(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Relayer private key" req={!evmRelayerKey.trim()}>
              <input
                value={evmRelayerKey}
                onChange={(e) => setEvmRelayerKey(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
              />
            </Field>
          </>
        )}

        <Field className="col-span" label="Keystore passphrase" req={!passphrase.trim()}>
          <input
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="choose-a-strong-passphrase"
            spellCheck={false}
          />
        </Field>
      </div>

      {host === "desktop" ? (
        <CodeBlock label="claude_desktop_config.json" code={json} />
      ) : (
        <>
          <CodeBlock label=".mcp.json (project root)" code={json} />
          <CodeBlock label="…or run in the terminal" code={cli} />
        </>
      )}

      <p className="note">
        The passphrase is stored in your host&rsquo;s config in plain text — use a throwaway devnet
        passphrase, never a mainnet key. Quaestor runs on devnet / testnet; the agent&rsquo;s key stays
        encrypted in a local keystore and the model never sees it.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
  className,
  req,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  req?: boolean;
}) {
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <label>
        <span>{label}</span>
        {req ? <span className="req">required</span> : null}
      </label>
      {children}
    </div>
  );
}
