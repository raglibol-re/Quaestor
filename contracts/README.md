# Quaestor — EVM contract (Foundry)

A faithful Solidity port of the Quaestor Solana program: hierarchical, on-chain-enforced USDC
budgets with the same reservation invariant, ancestor-chain enforcement, and ancestor-agent freeze.
Agents hold no gas (ERC-2771 gasless meta-transactions).

- `src/Quaestor.sol` — the contract (`ERC2771Context`, `SafeERC20`; 10 state-changing functions +
  views). Invariant: `spent + reservedForChildren ≤ allocated`, enforced by checked `_available`.
- `test/Quaestor.t.sol` — 17 functional tests + `invariant_NodeAndConservation` (fuzz: 4096 calls,
  0 reverts) asserting the per-node invariant and `Σ available == vaultBalance == token balance`.
- `script/Deploy.s.sol` — deploys MockUSDC + ERC2771Forwarder + Quaestor.

```bash
forge build && forge test
```

Deploy + MCP wiring + target-chain details (Tempo, Base Sepolia): see [`../docs/evm.md`](../docs/evm.md).
Dependencies (`forge-std`, OpenZeppelin v5) are vendored under `lib/` so the project is
self-contained — no `forge install` needed.
