//! Limit-inheritance helpers. `None` means "unlimited" (for caps) or "never" (for expiry).

/// A child cap must be at least as tight as the parent cap.
/// parent None (unlimited) -> any child ok. parent Some(p) -> child must be Some(c) with c <= p.
pub fn limit_within(child: Option<u64>, parent: Option<u64>) -> bool {
    match parent {
        None => true,
        Some(p) => matches!(child, Some(c) if c <= p),
    }
}

/// A child expiry must be no later than the parent expiry.
/// parent None (never) -> any child ok. parent Some(p) -> child must be Some(c) with c <= p.
pub fn expiry_within(child: Option<i64>, parent: Option<i64>) -> bool {
    match parent {
        None => true,
        Some(p) => matches!(child, Some(c) if c <= p),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits() {
        assert!(limit_within(Some(5), None)); // parent unlimited
        assert!(limit_within(None, None)); // both unlimited
        assert!(!limit_within(None, Some(5))); // child unlimited under finite parent
        assert!(limit_within(Some(5), Some(5)));
        assert!(limit_within(Some(4), Some(5)));
        assert!(!limit_within(Some(6), Some(5)));
    }

    #[test]
    fn expiries() {
        assert!(expiry_within(Some(100), None)); // parent never expires
        assert!(!expiry_within(None, Some(100))); // child never under expiring parent
        assert!(expiry_within(Some(90), Some(100)));
        assert!(!expiry_within(Some(101), Some(100)));
    }
}
