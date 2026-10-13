// Static content for the landing page. Sourced from docs/mcp-setup.md, docs/evm.md,
// README.md and PITCH.md so the page stays faithful to the product.

export const LINKS = {
  dashboard: "https://quaestor-dashboard.vercel.app",
  github: "https://github.com/raglibol-re/Quaestor",
  programExplorer:
    "https://explorer.solana.com/address/FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP?cluster=devnet",
  // The lived-in "acme-research" devnet tree (scripts/populate-solana.ts): 250 USDC, 7 agents
  // across 3 levels, 10 spends, a frozen writer branch.
  demoProjectExplorer:
    "https://explorer.solana.com/address/4USdYpZTWyXK5s1688VPzaszCPsrNPirtDJ2anWgFmNH?cluster=devnet",
  evmContract: "https://sepolia.basescan.org/address/0xe704014D856aecD47B797CF47d42648060276d43",
  evmForwarder: "https://sepolia.basescan.org/address/0x10D587C78896a621328475d000a613a96eD64d6b",
  evmUsdc: "https://sepolia.basescan.org/address/0xC34F2245E68c0e2EaA631066921f7EAbC6980069",
  // Also live: Tempo Moderato (42431) and Hyperliquid HyperEVM testnet (998) — see docs/evm.md.
  tempoContract: "https://explore.testnet.tempo.xyz/address/0x68Bdc12A933E690A3573E802E8833ffd2243e91c",
  hyperliquidDesk: "https://github.com/raglibol-re/Quaestor/blob/main/docs/evm.md",
  mcpSetupDoc: "https://github.com/raglibol-re/Quaestor/blob/main/docs/mcp-setup.md",
  evmDoc: "https://github.com/raglibol-re/Quaestor/blob/main/docs/evm.md",
  remoteConnectorDoc: "https://github.com/raglibol-re/Quaestor/blob/main/docs/remote-connector.md",
  connectorMcp: "https://quaestor-connector.vercel.app/api/mcp",
} as const;

// Live Base Sepolia deployment — prefilled defaults for the EVM wizard (docs/evm.md).
// project = the lived-in "acme-research" tree (scripts/populate-evm.ts): 50 USDC, a 4-level tree
// with real gasless spends and a frozen writer branch.
export const EVM_DEFAULTS = {
  rpcUrl: "https://sepolia.base.org",
  contract: "0xe704014D856aecD47B797CF47d42648060276d43",
  forwarder: "0x10D587C78896a621328475d000a613a96eD64d6b",
  chainId: "84532",
  project: "0xf47c977ba5a30f063d199af1956ebffe5581347d370c77f622dfc54efe2bb579",
} as const;

export const SOLANA_DEFAULTS = {
  rpcUrl: "https://api.devnet.solana.com",
  relayerPath: "~/.quaestor/relayer.json",
} as const;

export type Tool = { name: string; desc: string };

// The 9 MCP tools an agent sees (docs/mcp-setup.md, README.md).
export const TOOLS: Tool[] = [
  { name: "get_my_mandate", desc: "Available balance, allocated / spent, per-tx and daily limits, status and expiry." },
  { name: "pay", desc: "Send USDC to a recipient wallet — enforced onchain against every limit and ancestor." },
  { name: "create_submandate", desc: "Delegate a sub-mandate (limits ≤ your own) and get a ready-to-paste config snippet." },
  { name: "list_subagents", desc: "This agent's direct subagent mandates, with status and balances." },
  { name: "freeze_subagent", desc: "Freeze or unfreeze a subagent — instantly blocks it and its whole subtree." },
  { name: "revoke_subagent", desc: "Permanently revoke a subagent (terminal); requires owner authority." },
  { name: "reclaim_subagent", desc: "Pull a revoked or expired subagent's unused funds back into your balance." },
  { name: "get_history", desc: "Recent transactions touching this agent's mandate account." },
  { name: "pay_x402", desc: "Fetch a paywalled URL; on HTTP 402, pay the required USDC straight from the mandate." },
];

export type CmpRow = { dim: string; flat: string; quaestor: string };

// Flat agent wallets vs Quaestor (PITCH.md).
export const COMPARISON: CmpRow[] = [
  { dim: "Structure", flat: "One human → one agent", quaestor: "Arbitrary hierarchy — orchestrator → researcher → scraper" },
  { dim: "Delegation", flat: "—", quaestor: "An agent sub-delegates, capped by what it holds" },
  { dim: "Limits", flat: "Balance only", quaestor: "Per-tx + time-window + expiry, tighter-or-equal down the tree" },
  { dim: "Enforcement", flat: "Server / SDK", quaestor: "In the onchain program" },
  { dim: "Kill switch", flat: "Revoke one key", quaestor: "Freeze a node → the whole subtree stops" },
  { dim: "Agent needs gas?", flat: "Yes", quaestor: "No — a relayer pays the fees" },
  { dim: "Blast radius if compromised", flat: "The whole wallet", quaestor: "One mandate node" },
];
