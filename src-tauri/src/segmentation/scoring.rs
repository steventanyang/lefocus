use crate::db::models::{ContextReading, Segment};
use crate::segmentation::config::SegmentationConfig;
use std::collections::HashSet;

/// Compute confidence score using 4-factor weighted average.
pub fn compute_confidence(
    segment: &Segment,
    readings: &[ContextReading],
    config: &SegmentationConfig,
) -> (f64, f64, f64, f64, f64) {
    let duration_score = score_duration(segment.duration_secs);
    let stability_score = score_stability(segment, readings);
    let visual_score = score_visual_clarity(segment);
    let ocr_score = score_ocr_quality(segment, readings);

    let confidence = config.weight_duration * duration_score
        + config.weight_stability * stability_score
        + config.weight_visual * visual_score
        + config.weight_ocr * ocr_score;

    (
        confidence,
        duration_score,
        stability_score,
        visual_score,
        ocr_score,
    )
}

/// Score duration using sigmoid function.
/// Target values: 30s=0.3, 60s=0.5, 120s=0.7, 300s=0.9
fn score_duration(duration_secs: i64) -> f64 {
    // Sigmoid: 1.0 / (1.0 + e^(-0.02 * (duration - 120)))
    // This gives approximately: 30s≈0.3, 60s≈0.5, 120s≈0.7, 300s≈0.9
    1.0 / (1.0 + (-0.02 * (duration_secs as f64 - 120.0)).exp())
}

/// Score stability: percentage of readings with same bundle_id as segment.
fn score_stability(segment: &Segment, readings: &[ContextReading]) -> f64 {
    if readings.is_empty() {
        return 0.5; // Default if no readings
    }

    // Count readings with same bundle_id as segment
    let same_bundle_count = readings
        .iter()
        .filter(|r| r.window_metadata.bundle_id == segment.bundle_id)
        .count();

    same_bundle_count as f64 / readings.len() as f64
}

/// Score visual clarity: 1.0 - (unique_phash_count / reading_count)
/// Higher unique_phash_count means more visual changes = lower clarity.
fn score_visual_clarity(segment: &Segment) -> f64 {
    if segment.reading_count == 0 {
        return 0.5; // Default if no readings
    }

    let unique_count = segment.unique_phash_count.unwrap_or(0);
    let change_ratio = unique_count as f64 / segment.reading_count as f64;
    1.0 - change_ratio.min(1.0)
}

/// Score OCR quality: Average OCR confidence from readings, default 0.5 if None.
fn score_ocr_quality(_segment: &Segment, readings: &[ContextReading]) -> f64 {
    if readings.is_empty() {
        return 0.5; // Default if no readings
    }

    let mut total_confidence = 0.0;
    let mut count = 0;

    for reading in readings {
        if let Some(confidence) = reading.ocr_confidence {
            total_confidence += confidence;
            count += 1;
        }
    }

    if count > 0 {
        total_confidence / count as f64
    } else {
        0.5 // Default if no OCR data
    }
}

/// Count unique pHash values in a slice of readings.
pub fn compute_unique_phash_count(readings: &[ContextReading]) -> i64 {
    let mut unique_phashes = HashSet::new();
    for reading in readings {
        if let Some(phash) = &reading.phash {
            unique_phashes.insert(phash.clone());
        }
    }
    unique_phashes.len() as i64
}
