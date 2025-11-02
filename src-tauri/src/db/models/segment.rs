//! Segment and interruption data models.
//!
//! See system design documentation: Phase 4 (phase-4-segmentation.md)
//!
//! Segments represent continuous time intervals where the user focused on a single context (app/window).
//! Interruptions represent brief context switches that were merged into a parent segment.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub session_id: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_secs: i64,
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub confidence: f64,
    pub duration_score: Option<f64>,
    pub stability_score: Option<f64>,
    pub visual_clarity_score: Option<f64>,
    pub ocr_quality_score: Option<f64>,
    pub reading_count: i64,
    pub unique_phash_count: Option<i64>,
    pub segment_summary: Option<String>,
}

impl Segment {
    pub fn duration(&self) -> Duration {
        Duration::seconds(self.duration_secs)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Interruption {
    pub id: String,
    pub segment_id: String,
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub duration_secs: i64,
}

impl Interruption {
    pub fn duration(&self) -> Duration {
        Duration::seconds(self.duration_secs)
    }
}

