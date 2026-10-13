# Quaestor remote connector (claude.ai) — Streamable HTTP + OAuth

The remote connector lets you add Quaestor as a **Custom Connector in claude.ai** (web + app). An
agent gets a Quaestor **mandate** — an onchain-enforced USDC budget — over MCP, with no local setup.
It complements the **stdio** server (`docs/mcp-setup.md`), which keeps working unchanged for Claude
Desktop / Claude Code.

Code: `apps/connector` (Next.js App Router, Vercel). Live MCP endpoint: `<deployment>/api/mcp`.

## Security model (vs stdio)

| | stdio (local) | Remote connector |
|---|---|---|
| Identity | env (`QUAESTOR_AGENT`) | **OAuth access token**, bound server-side to one `(chain, project, mandate_node)` |
| Agent key custody | encrypted local keystore | **envelope-encrypted in Postgres** (KMS-wrapped DEK; dev master key now, AWS KMS in prod), decrypted in-memory only to sign |
| Who can act | whoever runs the process | whoever holds a valid token — and only for its **one** node |
| Enforcement | onchain | onchain (unchanged — the server is convenience only) |

Non-negotiables, all enforced here: **a token can only ever address its one node** (no tool input
selects the acting agent); **the model never sees a key, passphrase, refresh token, or relayer key**
(never in a tool result, error, or log); **devnet/testnet only** (the connector refuses mainnet RPC).

## How a connection works

1. **DCR** — claude.ai registers itself at `/api/oauth/register` (redirect allowlisted to
   `https://claude.ai/api/mcp/auth_callback`).
2. **Authorize + PKCE** — `/api/oauth/authorize` validates the request and hands off to the consent
   screen with a signed authreq token.
3. **Consent** — the project **owner** connects a wallet and signs a **Sign-In-With-Solana** message
   (verified against `Project.owner`), picks **one** custodied node (its limits are shown), and
   approves. (A delegated sub-mandate is approved instead with its one-time **invite code** — no
   wallet.) A single-use, node-bound authorization code is issued.
4. **Token** — `/api/oauth/token` exchanges the code (PKCE S256) for a short-lived access JWT (jti
   recorded) + a rotated, hashed refresh token — both carrying the node binding.
5. **MCP** — `POST /api/mcp` with the bearer token: the server resolves the one bound node, decrypts
   its custodied key in memory, and serves the 9 tools acting **as that node**.

`create_submandate` over HTTP returns a single-use **invite code** (the parent's custodied key signs
the on-chain allocation; a fresh child key is custodied). The invitee pastes the code into the
consent screen to bind a token to the new child — no wallet needed below the root.

## Deploy

Hosting: Vercel (Node runtime). Persistence: Neon Postgres (`db/schema.sql`). Custody master key:
dev env key now, AWS KMS later (swap the `scheme` branch in `lib/custody.ts`).

1. **Database** — apply `apps/connector/db/schema.sql` to a Neon project; set `DATABASE_URL`.
2. **Secrets / config** (Vercel env, see `.env.example`):
   - `QUAESTOR_PROJECT` — the Solana project PDA this deployment serves (its owner gates consent).
   - `QUAESTOR_RPC_URL` — a devnet RPC (dedicated recommended).
   - `QUAESTOR_CONNECTOR_URL` — the public HTTPS base (OAuth issuer / resource id).
   - `QUAESTOR_RELAYER_SECRET` — relayer key (base58 or JSON `[u8;64]`), pays fees/rent.
   - `QUAESTOR_MASTER_KEY` — `base64` of 32 random bytes (dev custody master key).
   - `QUAESTOR_JWT_SECRET` — `base64` of ≥32 random bytes (access-token HMAC key).
   - `DATABASE_URL` — Neon connection string.
   - optional `QUAESTOR_X402_MAX_USDC`, `QUAESTOR_ALLOWED_REDIRECTS`.
   Generate the keys: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. **Provision the first node** — the owner signs an on-chain allocation to a server-custodied agent:
   ```bash
   cd apps/connector
   QUAESTOR_OWNER_KEYPAIR=~/.config/solana/id.json \
     node scripts/provision-agent.mjs --label research --amount 20 --per-tx 0.5 --daily 5
   ```
4. **Deploy** — `vercel deploy --prod` (new Vercel project rooted at `apps/connector`). The dashboard
   and landing are untouched.

## Add it in claude.ai

Settings → Connectors → **Add custom connector** → paste `<deployment>/api/mcp`. Complete the OAuth
flow (owner SIWS, or an invite code), pick the node, and the Quaestor tools appear:
`get_my_mandate`, `pay`, `create_submandate`, `list_subagents`, `freeze_subagent`, `revoke_subagent`,
`reclaim_subagent`, `get_history`, `pay_x402` — each with the right read-only / destructive hints.

## Verify

- Unit (pure, no devnet): `node apps/connector/test/crypto.test.mjs` — custody envelope round-trip +
  tamper rejection, PKCE S256, SIWS Ed25519.
- Discovery: `curl <deployment>/.well-known/oauth-protected-resource` and `/oauth-authorization-server`.
- MCP Inspector (HTTP): point it at `<deployment>/api/mcp`, complete OAuth, list tools.
- End-to-end (devnet): OAuth → `get_my_mandate`; `pay` within a limit succeeds, over-limit returns a
  human-readable rejection; freezing the parent blocks the child's `pay`.
