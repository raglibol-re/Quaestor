use anchor_lang::prelude::*;

/// PDA seed for a Project account: ["project", owner, project_id_le].
#[constant]
pub const PROJECT_SEED: &[u8] = b"project";

/// PDA seed for a Budget account: ["budget", project, agent].
#[constant]
pub const BUDGET_SEED: &[u8] = b"budget";

/// Maximum tree depth. Root = 0, so the deepest node has depth == MAX_DEPTH.
/// Keeps the ancestor-chain verification bounded and cheap.
pub const MAX_DEPTH: u8 = 4;

/// Maximum number of entries in a budget allowlist.
pub const MAX_ALLOWLIST: usize = 8;

/// Fixed byte length of a human-readable label.
pub const LABEL_LEN: usize = 32;
