//! Placeholder repository for future segment-related persistence APIs.

use anyhow::Result;

use crate::db::connection::Database;

impl Database {
    /// Stub method to keep the module wired; real implementations arrive in Phase 4.
    pub async fn insert_segment_stub(&self) -> Result<()> {
        Ok(())
    }
}
