use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pause {
    pub id: String,
    pub session_id: String,
    pub pause_started_at: DateTime<Utc>,
    pub pause_ended_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
}
