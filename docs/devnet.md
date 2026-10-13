# Devnet deployment

- **Program id:** `FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP` (BPFLoaderUpgradeable, authority = deployer)
- **Cluster:** devnet
- **Demo project:** `4USdYpZTWyXK5s1688VPzaszCPsrNPirtDJ2anWgFmNH` (label `acme-research`)
  - test USDC mint: `FsaEAmm2K6aek6gidM7rVnwjQbjs6KgCHMq9akwwByFh`
  - lived-in tree (`scripts/populate-solana.ts`): 250 USDC → orchestrator 180 →
    research 80 (10/tx) / writer 50 (5/tx, **frozen** by the orchestrator agent) / analyst 30 (5/tx);
    research → scraper 30 (3/tx) / indexer 20 (2/tx); writer → editor 15 (3/tx); 10 real spends
    across 5 merchants.

## RPC note

Use a **dedicated devnet RPC** (Helius/QuickNode/Alchemy). The public
`api.devnet.solana.com` rate-limits program deploys and commonly disables
`getProgramAccounts`, which the dashboard needs to load the budget tree.

## Redeploy the program

```bash
solana program deploy \
  --program-id target/deploy/quaestor-keypair.json \
  target/deploy/quaestor.so \
  --url <devnet-rpc>
```

## Recreate a demo project + tree

```bash
QUAESTOR_RPC_URL=<devnet-rpc> \
QUAESTOR_KEYSTORE_PASSPHRASE=<passphrase> \
QUAESTOR_OWNER_KEYPAIR=~/.config/solana/id.json \
bash scripts/devnet-demo.sh
```

## Dashboard (Vercel) env

- `NEXT_PUBLIC_RPC_URL` = your dedicated devnet RPC
- `NEXT_PUBLIC_CLUSTER` = `devnet`
- `NEXT_PUBLIC_DEMO_PROJECT` = the project address above
