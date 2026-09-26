use anchor_lang::prelude::*;

#[error_code]
pub enum QuaestorError {
    #[msg("Unauthorized: signer is not the required agent or owner")]
    Unauthorized,
    #[msg("Only the project owner may perform this action")]
    OwnerOnly,
    #[msg("Budget is not active (frozen or revoked)")]
    NotActive,
    #[msg("An ancestor budget is frozen, revoked, or expired")]
    AncestorNotActive,
    #[msg("Budget has expired")]
    Expired,
    #[msg("Parent budget is not allowed to delegate")]
    CannotDelegate,
    #[msg("Maximum tree depth exceeded")]
    MaxDepthExceeded,
    #[msg("Depth exceeds parent's max_child_depth")]
    MaxChildDepthExceeded,
    #[msg("Amount exceeds available balance")]
    InsufficientAvailable,
    #[msg("Amount exceeds per-transaction limit")]
    PerTxLimitExceeded,
    #[msg("Amount exceeds period limit")]
    PeriodLimitExceeded,
    #[msg("Child limit is looser than the parent limit")]
    LimitTooLoose,
    #[msg("Child expiry is later than the parent expiry")]
    ExpiryTooLate,
    #[msg("Recipient is not in the allowlist")]
    RecipientNotAllowed,
    #[msg("Child allowlist is not a subset of the parent allowlist")]
    AllowlistNotSubset,
    #[msg("Allowlist exceeds the maximum number of entries")]
    AllowlistFull,
    #[msg("Ancestor chain is invalid (broken link, wrong PDA, or wrong depth)")]
    InvalidChain,
    #[msg("Ancestor chain length does not match the node depth")]
    ChainLengthMismatch,
    #[msg("Account belongs to a different project")]
    WrongProject,
    #[msg("Provided account is not the expected PDA")]
    InvalidPda,
    #[msg("Budget still has funds reserved for children")]
    HasReservedChildren,
    #[msg("Budget is not reclaimable (not revoked/expired and no revoked ancestor)")]
    NotReclaimable,
    #[msg("Child is not linked to the provided parent")]
    WrongParent,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Budget is already revoked")]
    AlreadyRevoked,
}
