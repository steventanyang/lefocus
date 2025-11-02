//! Session-related data models.
//!
//! See system design documentation:
//! - `Session`, `SessionStatus`, `SessionInfo`: Phase 2 (phase-2-timer-database.md)
//! - `TopApp`, `SessionSummary`: Phase 4.5 (phase-4.5-activities-view.md)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Running,
    Completed,
    Cancelled,
    Interrupted,
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionStatus::Running => "Running",
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub target_ms: u64,
    pub active_ms: u64,
}

impl From<Session> for SessionInfo {
    fn from(session: Session) -> Self {
        Self {
            id: session.id,
            started_at: session.started_at,
            stopped_at: session.stopped_at,
            status: session.status,
            target_ms: session.target_ms,
            active_ms: session.active_ms,
        }
    }
}

/// Aggregated app duration for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopApp {
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub duration_secs: u32,
    pub percentage: f64,
}

/// Summary of a session for the activities list view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub target_ms: u64,
    pub active_ms: u64,
    pub top_apps: Vec<TopApp>,
}
