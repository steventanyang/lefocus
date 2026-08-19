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
    /// Legacy screenshot-derived value. New metadata-only readings store `None`.
    pub phash: Option<String>,
    /// Legacy OCR value retained so historical databases remain readable.
    pub ocr_text: Option<String>,
    /// Legacy OCR value retained so historical databases remain readable.
    pub ocr_confidence: Option<f64>,
    /// Legacy OCR value retained so historical databases remain readable.
    pub ocr_word_count: Option<u64>,
    /// Segment ID that this reading belongs to (set after segmentation)
    pub segment_id: Option<String>,
}
