// Library surface for @quaestor/mcp-server. Importing this module has NO side effects
// (unlike server.ts, which is the stdio bin and runs main() on import). The remote host
// (apps/connector) imports from here to build per-request, context-bound MCP servers.
export { buildServer, describeOps } from "./buildServer";
export { registerTools, registerDeskTools, ICON_DATA_URI } from "./tools";
export { handleStatelessMcpRequest, startDevHttpServer, handleMcpWeb } from "./httpServer";
export { buildOps, type BuiltOps } from "./opsFactory";
export { buildAgentContext, type AgentContext } from "./context";
export { SolanaOps } from "./solanaOps";
export {
  LocalKeystoreSolanaSigner,
  InjectedKeypairSigner,
  type SolanaAgentSigner,
} from "./signer";
export type {
  ChainOps,
  Attribution,
  CreateSubagentParams,
  CreateSubagentResult,
  PayResult,
  StatusResult,
  ReclaimResult,
} from "./chainOps";
export { BudgetRejection } from "./chainOps";
export type { McpConfig, EvmConfig } from "./config";
