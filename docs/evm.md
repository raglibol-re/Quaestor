# Quaestor on EVM (Base Sepolia · Tempo)

## Live on Base Sepolia (chain 84532)

| | Address |
|---|---|
| **Quaestor** | [`0xe704014D856aecD47B797CF47d42648060276d43`](https://sepolia.basescan.org/address/0xe704014D856aecD47B797CF47d42648060276d43) |
| **ERC2771Forwarder** | [`0x10D587C78896a621328475d000a613a96eD64d6b`](https://sepolia.basescan.org/address/0x10D587C78896a621328475d000a613a96eD64d6b) |
| **MockUSDC** (6-dec) | [`0xC34F2245E68c0e2EaA631066921f7EAbC6980069`](https://sepolia.basescan.org/address/0xC34F2245E68c0e2EaA631066921f7EAbC6980069) |
| **Demo project key** | `0xf47c977ba5a30f063d199af1956ebffe5581347d370c77f622dfc54efe2bb579` |

Demo tree (`scripts/populate-evm.ts`) — a lived-in 4-level tree with real **gasless** spends and a
frozen branch; every agent holds zero native gas (the relayer pays):

```
acme-research  alloc 50 USDC
└─ orchestrator  30
   ├─ research   12  (≤3/tx)   spent 3.5
   │  └─ scraper  4  (≤1/tx)   spent 1.3
   └─ writer      6  (≤2/tx)   spent 1.5   [FROZEN by the orchestrator]
```

---



Quaestor's reservation-accounting core is ported 1:1 to Solidity (`contracts/src/Quaestor.sol`):
the same invariant `spent + reserved_for_children ≤ allocated`, the same ancestor-chain
enforcement, `Option`-typed limits, snap-to-now period reset, and ancestor-agent freeze. Agents
hold **no native gas** — they sign an EIP-712 request and a relayer forwards it (ERC-2771), exactly
mirroring the Solana relayer model. The same MCP tools drive either chain via `QUAESTOR_CHAIN`.

```
contracts/                 Foundry project (self-contained; deps vendored under lib/)
  src/Quaestor.sol         the contract (ERC2771Context, SafeERC20)
  test/Quaestor.t.sol      18 tests incl. an invariant fuzz (4096 calls, 0 reverts)
  script/Deploy.s.sol      MockUSDC + ERC2771Forwarder + Quaestor
packages/evm-sdk/          @quaestor/evm-sdk — viem client + gasless forwarder helper
scripts/demo-evm.ts        the full gasless story (verified on anvil)
```

## Build & test

```bash
cd contracts
forge build
forge test            # 18 passing, incl. invariant_NodeAndConservation
```

## Deploy

The deployer needs native gas on the target chain. `Deploy.s.sol` deploys a 6-decimal `MockUSDC`
(for testnets without a faucet-able USDC), the `ERC2771Forwarder`, and `Quaestor`. Pass `USDC=0x…`
to reuse an existing token instead of the mock.

```bash
cd contracts
PRIVATE_KEY=0x<deployer>  [USDC=0x<existing-usdc>] \
  forge script script/Deploy.s.sol:Deploy --rpc-url <RPC_URL> --broadcast
# prints: MockUSDC, ERC2771Forwarder, Quaestor, Deployer, ChainId
```

Add `--verify --etherscan-api-key <key>` for a verified contract on public explorers.

### Target chains

| Chain | Chain ID | RPC | Explorer | USDC |
|---|---|---|---|---|
| **Base Sepolia** | `84532` | `https://sepolia.base.org` | `https://sepolia.basescan.org` | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Circle testnet USDC) — or deploy the mock |
| **Tempo testnet** | _see Tempo docs_ | _Tempo testnet RPC_ | _Tempo explorer_ | _Tempo stablecoin — or deploy the mock_ |

Faucets: Base Sepolia ETH — Coinbase / Alchemy / thirdweb faucets; Base Sepolia USDC — Circle
faucet. Tempo — see the Tempo testnet faucet in their docs. (Tempo is EVM-compatible; the same
`Deploy.s.sol` + `@quaestor/evm-sdk` work unchanged — only RPC/chain-id/USDC differ.)

## Point the MCP server at an EVM deployment

Set `QUAESTOR_CHAIN=base` (or `tempo`) and the EVM env (see `.env.example`):

```bash
QUAESTOR_CHAIN=base
QUAESTOR_EVM_RPC_URL=https://sepolia.base.org
QUAESTOR_CONTRACT=0x<Quaestor>
QUAESTOR_FORWARDER=0x<ERC2771Forwarder>
QUAESTOR_CHAIN_ID=84532
QUAESTOR_EVM_PROJECT=0x<projectKey>      # keccak256(abi.encode(owner, projectId))
QUAESTOR_AGENT=<keystore-name>           # a secp256k1 agent key (created on create_subagent)
QUAESTOR_KEYSTORE_PASSPHRASE=<passphrase>
QUAESTOR_EVM_RELAYER_KEY=0x<relayer-key> # pays gas; forwards agents' signed meta-txns
```

The 8 MCP tools (`get_my_budget`, `pay`, `create_subagent_budget`, `list_subagents`,
`freeze_subagent`, `revoke_subagent`, `reclaim_subagent`, `get_history`) behave identically to the
Solana backend; agent actions are gasless (forwarded), owner actions are sent directly.

## Dashboard EVM view

The dashboard gains a **Solana / EVM** chain toggle once these `NEXT_PUBLIC_*` vars are set (the EVM
tab is hidden otherwise). It renders the EVM project's budget tree read-only, reusing the same
components as the Solana view:

```bash
NEXT_PUBLIC_EVM_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_EVM_CONTRACT=0xe704014D856aecD47B797CF47d42648060276d43
NEXT_PUBLIC_EVM_CHAIN_ID=84532
NEXT_PUBLIC_EVM_PROJECT=0xf47c977ba5a30f063d199af1956ebffe5581347d370c77f622dfc54efe2bb579
NEXT_PUBLIC_EVM_EXPLORER=https://sepolia.basescan.org
NEXT_PUBLIC_EVM_LABEL=Base Sepolia
```

## Reproduce the gasless demo (anvil)

```bash
anvil &                       # local EVM node
# deploy (prints addresses), then:
pnpm exec ts-node --transpile-only scripts/demo-evm.ts
# 2 gasless spends (agents hold 0 ETH), 2 on-chain rejections, reclaim — all enforced on-chain.
```

## Design parity with Solana

- **Keys instead of PDAs:** `projectKey = keccak256(owner, projectId)`,
  `budgetKey = keccak256(projectKey, agent)`. Hierarchy is `mapping(bytes32 ⇒ Budget)` with a
  `parent` pointer; the ancestor walk is a storage loop bounded by `MAX_DEPTH`.
- **`Option<T>` → `(bool has, uintN value)`** so "unlimited"/"never" can't be confused with `0`.
- **Gasless:** `ERC2771Context` + OZ `ERC2771Forwarder`; authority is `_msgSender()`.
- **Custody:** the contract holds the ERC-20; `spend`/`withdraw` use SafeERC20 with
  checks-effects-interactions.
