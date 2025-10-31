use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SegmentType {
    Stable,
    Transitioning,
    Distracted,
}

impl SegmentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SegmentType::Stable => "stable",
            SegmentType::Transitioning => "transitioning",
            SegmentType::Distracted => "distracted",
        }
    }
}

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
    pub segment_type: SegmentType,
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

