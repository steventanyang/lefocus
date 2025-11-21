//! Label-related data models.
//!
//! See system design documentation:
//! - `Label`, `LabelInput`: Phase 7 (phase-7-labels.md)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Represents a label for categorizing sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub order_index: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Input data for creating or updating a label
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelInput {
    pub name: String,
    pub color: String,
}
