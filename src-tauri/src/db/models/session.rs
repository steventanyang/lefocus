//! Session-related data models.
//!
//! See system design documentation:
//! - `Session`, `SessionStatus`, `SessionInfo`: Phase 2 (phase-2-timer-database.md)
//! - `TopApp`, `SessionSummary`: Phase 4.5 (phase-4.5-activities-view.md)
//! - `app_icons` in SessionSummary: Phase 6 (phase-6-ux-apps-table.md)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub label_id: Option<i64>,
    pub note: Option<String>,
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
    pub label_id: Option<i64>,
    pub note: Option<String>,
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
            label_id: session.label_id,
            note: session.note,
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
    pub label_id: Option<i64>,
    pub note: Option<String>,
    pub top_apps: Vec<TopApp>,
    /// Map of bundle_id -> icon_data_url (base64 PNG)
    /// Deduplicates icons across all sessions returned in the list
    pub app_icons: HashMap<String, Option<String>>,
    /// Map of bundle_id -> icon_color (hex string like "#AABBCC")
    /// Dominant color extracted from app icons
    pub app_colors: HashMap<String, Option<String>>,
}
