use anyhow::Result;
use chrono::{DateTime, Utc};

use crate::db::models::ContextReading;
use crate::segmentation::config::SegmentationConfig;

/// A group of consecutive readings with the same bundle_id.
#[derive(Debug, Clone)]
pub struct ReadingGroup {
    pub bundle_id: String,
    pub app_name: String,
    pub readings: Vec<ContextReading>,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
}

impl ReadingGroup {
    pub fn duration_secs(&self) -> i64 {
        // Duration includes the capture interval after the last reading
        // e.g., readings at T0, T5 cover [T0, T10), not just [T0, T5)
        const CAPTURE_INTERVAL_SECS: i64 = 5;
        (self.end_time - self.start_time).num_seconds() + CAPTURE_INTERVAL_SECS
    }

    pub fn reading_count(&self) -> usize {
        self.readings.len()
    }
}

/// Helper to track readings for each segment.
struct SegmentWithReadings {
    segment: crate::db::models::Segment,
    readings: Vec<ContextReading>,
}

/// Main segmentation function: transforms readings into segments.
pub fn segment_session(
    readings: Vec<ContextReading>,
    config: &SegmentationConfig,
) -> Result<(Vec<crate::db::models::Segment>, Vec<crate::db::models::Interruption>)> {
    use crate::db::models::Segment;
    use crate::segmentation::{merge::sandwich_merge, scoring::compute_unique_phash_count};

    // Edge case: empty readings
    if readings.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }

    let session_id = readings[0].session_id.clone();
    let session_start = readings[0].timestamp;
    let session_end = readings.last().unwrap().timestamp;
    let session_duration = (session_end - session_start).num_seconds() as u64;

    // Edge case: very short session (<30s) - create single segment
    if session_duration < config.min_segment_duration_secs {
        return Ok(create_single_segment_for_session(readings, session_id, config));
    }

    // Edge case: no switches (all same bundle_id)
    let all_same_bundle = readings
        .iter()
        .all(|r| r.window_metadata.bundle_id == readings[0].window_metadata.bundle_id);
    if all_same_bundle {
        return Ok(create_single_segment_for_session(readings, session_id, config));
    }

    // Step 1: Group readings by bundle_id
    let groups = group_readings(readings);

    // Step 2: Create initial segments (with readings tracked)
    let segments_with_readings = create_initial_segments_with_readings(groups);

    // Step 3: Extract segments for merge
    let segments: Vec<Segment> = segments_with_readings
        .iter()
        .map(|swr| swr.segment.clone())
        .collect();

    // Step 4: Sandwich merge
    let merge_result = sandwich_merge(segments, config);
    let mut final_segments = merge_result.segments;
    let interruptions = merge_result.interruptions;

    // Step 5: Rebuild readings mapping for merged segments
    // After merge, we need to map readings back to segments by time range
    let all_readings: Vec<ContextReading> = segments_with_readings
        .into_iter()
        .flat_map(|swr| swr.readings)
        .collect();

    // Step 6: Compute aggregates and scores for each segment
    for segment in &mut final_segments {
        // Find readings that belong to this segment (by time range)
        let segment_readings: Vec<&ContextReading> = all_readings
            .iter()
            .filter(|r| {
                r.timestamp >= segment.start_time && r.timestamp <= segment.end_time
            })
            .collect();

        // Compute unique_phash_count
        let segment_readings_vec: Vec<ContextReading> =
            segment_readings.iter().map(|r| (*r).clone()).collect();
        let unique_phash_count = compute_unique_phash_count(&segment_readings_vec);
        segment.unique_phash_count = Some(unique_phash_count);
        
        // Update reading_count based on actual readings in this segment (accounts for merged segments)
        segment.reading_count = segment_readings.len() as i64;

        // Compute confidence scores
        let (confidence, duration_score, stability_score, visual_score, ocr_score) =
            crate::segmentation::scoring::compute_confidence(
                segment,
                &segment_readings_vec,
                config,
            );

        segment.confidence = confidence;
        segment.duration_score = Some(duration_score);
        segment.stability_score = Some(stability_score);
        segment.visual_clarity_score = Some(visual_score);
        segment.ocr_quality_score = Some(ocr_score);
    }

    Ok((final_segments, interruptions))
}

/// Create a single segment for very short sessions or no-switch sessions.
fn create_single_segment_for_session(
    readings: Vec<ContextReading>,
    session_id: String,
    config: &SegmentationConfig,
) -> (Vec<crate::db::models::Segment>, Vec<crate::db::models::Interruption>) {
    use crate::db::models::Segment;
    use crate::segmentation::scoring::compute_unique_phash_count;
    use uuid::Uuid;

    if readings.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let first = &readings[0];
    let last = readings.last().unwrap();
    // Duration includes the capture interval after the last reading
    const CAPTURE_INTERVAL_SECS: i64 = 5;
    let duration_secs = (last.timestamp - first.timestamp).num_seconds() + CAPTURE_INTERVAL_SECS;
    let unique_phash_count = compute_unique_phash_count(&readings);

    let window_title = most_common_window_title(&readings);

    let mut segment = Segment {
        id: Uuid::new_v4().to_string(),
        session_id,
        start_time: first.timestamp,
        end_time: last.timestamp,
        duration_secs,
        bundle_id: first.window_metadata.bundle_id.clone(),
        app_name: Some(first.window_metadata.owner_name.clone()),
        window_title,
        confidence: 0.95, // High confidence for single-app session
        duration_score: None,
        stability_score: None,
        visual_clarity_score: None,
        ocr_quality_score: None,
        reading_count: readings.len() as i64,
        unique_phash_count: Some(unique_phash_count),
        segment_summary: None,
        icon_data_url: None, // Populated later by database query
        icon_color: None, // Populated later by database query
    };

    // Compute scores
    let (confidence, duration_score, stability_score, visual_score, ocr_score) =
        crate::segmentation::scoring::compute_confidence(
            &segment,
            &readings,
            config,
        );

    segment.confidence = confidence;
    segment.duration_score = Some(duration_score);
    segment.stability_score = Some(stability_score);
    segment.visual_clarity_score = Some(visual_score);
    segment.ocr_quality_score = Some(ocr_score);

    (vec![segment], Vec::new())
}


/// Group consecutive readings by bundle_id.
pub fn group_readings(readings: Vec<ContextReading>) -> Vec<ReadingGroup> {
    if readings.is_empty() {
        return Vec::new();
    }

    let mut groups = Vec::new();
    let mut current_group: Option<ReadingGroup> = None;

    for reading in readings {
        match &mut current_group {
            Some(group) if group.bundle_id == reading.window_metadata.bundle_id => {
                // Same bundle_id, extend current group
                group.readings.push(reading.clone());
                group.end_time = reading.timestamp;
            }
            _ => {
                // Different bundle_id or no current group, start new group
                if let Some(group) = current_group.take() {
                    groups.push(group);
                }
                current_group = Some(ReadingGroup {
                    bundle_id: reading.window_metadata.bundle_id.clone(),
                    app_name: reading.window_metadata.owner_name.clone(),
                    readings: vec![reading.clone()],
                    start_time: reading.timestamp,
                    end_time: reading.timestamp,
                });
            }
        }
    }

    // Push final group
    if let Some(group) = current_group {
        groups.push(group);
    }

    groups
}


/// Convert ReadingGroups to Segments with readings tracked.
fn create_initial_segments_with_readings(
    groups: Vec<ReadingGroup>,
) -> Vec<SegmentWithReadings> {
    use crate::db::models::Segment;
    use uuid::Uuid;

    if groups.is_empty() {
        return Vec::new();
    }

    groups
        .into_iter()
        .map(|group| {
            let duration_secs = group.duration_secs();
            let window_title = most_common_window_title(&group.readings);

            SegmentWithReadings {
                segment: Segment {
                    id: Uuid::new_v4().to_string(),
                    session_id: group.readings[0].session_id.clone(),
                    start_time: group.start_time,
                    end_time: group.end_time,
                    duration_secs,
                    bundle_id: group.bundle_id.clone(),
                    app_name: Some(group.app_name.clone()),
                    window_title,
                    confidence: 0.0, // Will be computed later
                    duration_score: None,
                    stability_score: None,
                    visual_clarity_score: None,
                    ocr_quality_score: None,
                    reading_count: group.reading_count() as i64,
                    unique_phash_count: None, // Will be computed later
                    segment_summary: None,
                    icon_data_url: None, // Populated later by database query
                    icon_color: None, // Populated later by database query
                },
                readings: group.readings.clone(),
            }
        })
        .collect()
}

/// Find the most common window title in a slice of readings.
fn most_common_window_title(readings: &[ContextReading]) -> Option<String> {
    use std::collections::HashMap;

    if readings.is_empty() {
        return None;
    }

    let mut title_counts: HashMap<&str, usize> = HashMap::new();
    for reading in readings {
        let title = reading.window_metadata.title.as_str();
        *title_counts.entry(title).or_insert(0) += 1;
    }

    title_counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(title, _)| title.to_string())
}
