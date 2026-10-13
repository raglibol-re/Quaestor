-- Quaestor remote connector — persistence schema (Neon Postgres).
-- OAuth 2.1 AS state, single-use invites, and the node→custodied-signer-key mapping.
-- Every token/code/invite carries the binding (chain, project, mandate_node): a credential can
-- only ever address the one node it was issued for. No secret is stored in plaintext.

-- claude.ai (and other MCP hosts) self-register here via Dynamic Client Registration.
CREATE TABLE IF NOT EXISTS oauth_client (
  client_id                   text PRIMARY KEY,
  client_secret_hash          text,                                   -- null for public PKCE clients
  client_name                 text,
  redirect_uris               text[] NOT NULL,
  token_endpoint_auth_method  text NOT NULL DEFAULT 'none',
  grant_types                 text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Authorization codes: short-lived, single-use, PKCE S256, bound to one mandate node.
CREATE TABLE IF NOT EXISTS auth_code (
  code_hash       text PRIMARY KEY,                                   -- sha256(code), never the code
  client_id       text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  scope           text,
  chain           text NOT NULL,
  project         text NOT NULL,
  mandate_node    text NOT NULL,
  expires_at      timestamptz NOT NULL,
  consumed        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Access tokens: issued as JWTs; the jti is recorded so a revoke invalidates it server-side.
CREATE TABLE IF NOT EXISTS access_token (
  jti           text PRIMARY KEY,
  client_id     text NOT NULL,
  chain         text NOT NULL,
  project       text NOT NULL,
  mandate_node  text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Refresh tokens: hashed-at-rest, rotated on use, bound to one mandate node.
CREATE TABLE IF NOT EXISTS refresh_token (
  token_hash    text PRIMARY KEY,                                     -- sha256(refresh token)
  client_id     text NOT NULL,
  chain         text NOT NULL,
  project       text NOT NULL,
  mandate_node  text NOT NULL,
  rotated_from  text,                                                 -- previous token_hash in the chain
  expires_at    timestamptz NOT NULL,
  revoked       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Single-use, expiring invite links for remote create_submandate. The link only starts the
-- consent flow; it grants no access. Stored hashed; invalidated on use or expiry.
CREATE TABLE IF NOT EXISTS invite (
  token_hash    text PRIMARY KEY,                                     -- sha256(invite token)
  chain         text NOT NULL,
  project       text NOT NULL,
  parent_node   text NOT NULL,
  child_params  jsonb NOT NULL,                                       -- label, amount, limits, etc.
  child_node    text,                                                 -- set once the child key is provisioned
  expires_at    timestamptz NOT NULL,
  consumed      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- node → custodied signer key. enc_blob is the ENVELOPE-ENCRYPTED agent private key (never
-- plaintext): the key is AES-256-GCM encrypted under a per-key DEK, and the DEK is wrapped by the
-- master key (dev: env master key; prod: AWS KMS). `node` is the agent pubkey/address = the token
-- binding (mandate_node).
CREATE TABLE IF NOT EXISTS agent_key (
  chain       text NOT NULL,
  project     text NOT NULL,
  node        text NOT NULL,
  pubkey      text NOT NULL,
  curve       text NOT NULL,                                          -- 'ed25519' | 'secp256k1'
  enc_blob    text NOT NULL,                                          -- base64 envelope JSON
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, project, node)
);

-- Tool-call audit log (secret-free) — also the backing store for write-tool rate limiting.
CREATE TABLE IF NOT EXISTS tool_call (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain       text NOT NULL,
  project     text NOT NULL,
  node        text NOT NULL,
  tool        text NOT NULL,
  ok          boolean NOT NULL,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_call_rate ON tool_call (node, tool, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_call_ip   ON tool_call (ip, created_at);

CREATE INDEX IF NOT EXISTS idx_auth_code_expires     ON auth_code (expires_at);
CREATE INDEX IF NOT EXISTS idx_access_token_expires  ON access_token (expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_token_expires ON refresh_token (expires_at);
CREATE INDEX IF NOT EXISTS idx_invite_expires        ON invite (expires_at);
