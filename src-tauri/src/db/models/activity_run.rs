use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ActivityRun {
    pub session_id: String,
    pub start_time: DateTime<Utc>,
    /// Exclusive end of observed coverage (last sample timestamp + capture interval).
    pub end_time: DateTime<Utc>,
    pub duration_secs: i64,
    pub sample_count: i64,
    pub bundle_id: String,
    pub app_name: Option<String>,
    /// Historical-only metadata. New app-level readings normalize empty titles to None.
    pub window_title: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ReadingArchive {
    pub session_id: String,
    pub format_version: i64,
    pub reading_count: i64,
    pub uncompressed_bytes: i64,
    pub checksum: String,
    pub compressed_data: Vec<u8>,
    pub created_at: DateTime<Utc>,
}
