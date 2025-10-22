use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Running,
    Paused,
    Completed,
    Cancelled,
    Interrupted,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionStatus::Running => "Running",
            SessionStatus::Paused => "Paused",
            SessionStatus::Completed => "Completed",
            SessionStatus::Cancelled => "Cancelled",
            SessionStatus::Interrupted => "Interrupted",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub target_ms: u64,
    pub active_ms: u64,
    pub paused_ms: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
