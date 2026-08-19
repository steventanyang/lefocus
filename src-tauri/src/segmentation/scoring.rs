use crate::db::models::{ContextReading, Segment};
use crate::segmentation::config::SegmentationConfig;

/// Compute confidence from signals available in metadata-only sensing.
pub fn compute_confidence(
    segment: &Segment,
    readings: &[ContextReading],
    config: &SegmentationConfig,
) -> (f64, f64, f64) {
    let duration_score = score_duration(segment.duration_secs);
    let stability_score = score_stability(segment, readings);

    let confidence =
        config.weight_duration * duration_score + config.weight_stability * stability_score;

    (confidence, duration_score, stability_score)
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
