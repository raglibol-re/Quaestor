# Devnet deployment

- **Program id:** `FVytqbLtyRAqshYkP8iacSGHbdT53tZNiLmoTG9Xu5dP` (BPFLoaderUpgradeable, authority = deployer)
- **Cluster:** devnet
- **Demo project:** `Bgo4nN4D5mVB7yjT5ymcGjhA83k23fbFPf5Ta44L3Kkr`
  - test USDC mint: `CQGHbRTAjruy7Gw47cemenSfDq7gxDjwF8QZfXoxkhdQ`
  - tree: root 100 → orchestrator 60 → research 20 (5/tx) + writer 10 (2/tx)

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
