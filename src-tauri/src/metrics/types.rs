use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureMetrics {
    pub timestamp: DateTime<Utc>,
    pub metadata_ms: u64,
    pub screenshot_ms: u64,
    pub screenshot_bytes: usize,
    pub phash_ms: u64,
    pub ocr_ms: Option<u64>,
    pub ocr_skipped_reason: Option<String>,
    pub db_write_ms: u64,
    pub total_ms: u64,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSnapshot {
    pub system: SystemMetrics,
    pub recent_captures: Vec<CaptureMetrics>,
    pub capture_count: u64,
    pub ocr_count: u64,
    pub ocr_skip_count: u64,
}

impl Default for MetricsSnapshot {
    fn default() -> Self {
        Self {
            system: SystemMetrics {
                cpu_percent: 0.0,
                memory_mb: 0.0,
            },
            recent_captures: Vec::new(),
            capture_count: 0,
            ocr_count: 0,
            ocr_skip_count: 0,
        }
    }
}
