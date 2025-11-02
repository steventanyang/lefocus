//! Context reading data model.
//!
//! See system design documentation: Phase 3 (phase-3-sensing-pipeline.md)
//!
//! Represents a single sensing snapshot captured during a focus session.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::macos_bridge::WindowMetadata;

/// Represents a single sensing snapshot captured during a focus session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextReading {
    pub id: Option<i64>,
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub window_metadata: WindowMetadata,
    pub phash: Option<String>,
    pub ocr_text: Option<String>,
    pub ocr_confidence: Option<f64>,
    pub ocr_word_count: Option<u64>,
}
