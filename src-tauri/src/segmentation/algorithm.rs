use anyhow::Result;
use chrono::{DateTime, Duration, Utc};

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
    pub is_transitioning: bool,
}

impl ReadingGroup {
    pub fn duration_secs(&self) -> i64 {
        (self.end_time - self.start_time).num_seconds()
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
    let mut groups = group_readings(readings);

    // Step 2: Detect transitions
    detect_transitions(&mut groups, config);

    // Step 3: Create initial segments (with readings tracked)
    let segments_with_readings = create_initial_segments_with_readings(groups);

    // Step 4: Extract segments for merge
    let segments: Vec<Segment> = segments_with_readings
        .iter()
        .map(|swr| swr.segment.clone())
        .collect();

    // Step 5: Sandwich merge
    let merge_result = sandwich_merge(segments, config);
    let mut final_segments = merge_result.segments;
    let interruptions = merge_result.interruptions;

    // Step 6: Rebuild readings mapping for merged segments
    // After merge, we need to map readings back to segments by time range
    let all_readings: Vec<ContextReading> = segments_with_readings
        .into_iter()
        .flat_map(|swr| swr.readings)
        .collect();

    // Step 7: Classify transitions >= 3min as Distracted
    classify_segments(&mut final_segments, config);

    // Step 8: Compute aggregates and scores for each segment
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
    use crate::db::models::{Segment, SegmentType};
    use crate::segmentation::scoring::compute_unique_phash_count;
    use uuid::Uuid;

    if readings.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let first = &readings[0];
    let last = readings.last().unwrap();
    let duration_secs = (last.timestamp - first.timestamp).num_seconds();
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
        segment_type: SegmentType::Stable,
        confidence: 0.95, // High confidence for single-app session
        duration_score: None,
        stability_score: None,
        visual_clarity_score: None,
        ocr_quality_score: None,
        reading_count: readings.len() as i64,
        unique_phash_count: Some(unique_phash_count),
        segment_summary: None,
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

/// Classify transitioning segments >= 3min as Distracted.
fn classify_segments(segments: &mut [crate::db::models::Segment], config: &SegmentationConfig) {
    use crate::db::models::SegmentType;

    for segment in segments {
        if segment.segment_type == SegmentType::Transitioning
            && segment.duration_secs >= config.distracted_threshold_secs as i64
        {
            segment.segment_type = SegmentType::Distracted;
        }
    }
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
                    is_transitioning: false,
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

/// Calculate median dwell time (time between app switches) in a window of groups.
fn calculate_median_dwell(groups: &[ReadingGroup]) -> Option<Duration> {
    if groups.len() < 2 {
        return None;
    }

    let mut dwell_times: Vec<i64> = Vec::new();
    for i in 1..groups.len() {
        let prev_end = groups[i - 1].end_time;
        let curr_start = groups[i].start_time;
        let dwell = (curr_start - prev_end).num_seconds();
        if dwell > 0 {
            dwell_times.push(dwell);
        }
    }

    if dwell_times.is_empty() {
        return None;
    }

    dwell_times.sort();
    let median_idx = dwell_times.len() / 2;
    let median_secs = dwell_times[median_idx];
    Some(Duration::seconds(median_secs))
}

/// Detect transitions by marking groups as transitioning if:
/// - 3+ app switches within 60 seconds, OR
/// - Median dwell time < 10 seconds
pub fn detect_transitions(groups: &mut [ReadingGroup], config: &SegmentationConfig) {
    if groups.len() < 2 {
        return;
    }

    let window_duration = Duration::seconds(config.transition_window_secs as i64);
    let min_dwell = Duration::seconds(10);

    // Use sliding window approach: for each group, look ahead at next groups within window
    for i in 0..groups.len() {
        let window_start = groups[i].start_time;
        let window_end = window_start + window_duration;

        // Collect groups within the window
        let window_groups: Vec<&ReadingGroup> = groups[i..]
            .iter()
            .take_while(|g| g.start_time <= window_end)
            .collect();

        if window_groups.len() < 2 {
            continue;
        }

        // Count actual switches (transitions between consecutive groups) in window
        // For A→B→A→B, we count 3 switches (A→B, B→A, A→B), not just unique bundle IDs
        let mut switch_count = 0;
        for k in 1..window_groups.len() {
            if window_groups[k - 1].bundle_id != window_groups[k].bundle_id {
                switch_count += 1;
            }
        }

        // Check if transitioning: 3+ switches OR median dwell < 10s
        let is_transitioning = if switch_count >= config.transition_switch_threshold {
            true
        } else if let Some(median_dwell) = calculate_median_dwell(
            &groups[i..i + window_groups.len().min(groups.len() - i)],
        ) {
            median_dwell < min_dwell
        } else {
            false
        };

        // Mark all groups in window as transitioning
        if is_transitioning {
            for group in groups[i..].iter_mut() {
                if group.start_time <= window_end {
                    group.is_transitioning = true;
                } else {
                    break;
                }
            }
        }
    }
}

/// Merge consecutive transitioning groups into a single segment.
fn merge_transition_groups(groups: Vec<ReadingGroup>) -> ReadingGroup {
    if groups.is_empty() {
        panic!("merge_transition_groups called with empty groups");
    }

    if groups.len() == 1 {
        return groups[0].clone();
    }

    let mut merged = groups[0].clone();
    for group in groups.iter().skip(1) {
        merged.readings.extend(group.readings.clone());
        merged.end_time = group.end_time;
    }

    merged
}

/// Convert ReadingGroups to Segments with readings tracked.
/// Consecutive transitioning groups are merged into single segments.
fn create_initial_segments_with_readings(
    groups: Vec<ReadingGroup>,
) -> Vec<SegmentWithReadings> {
    use crate::db::models::{Segment, SegmentType};
    use uuid::Uuid;

    if groups.is_empty() {
        return Vec::new();
    }

    let mut segments = Vec::new();
    let mut transition_accumulator = Vec::new();

    for group in groups {
        if group.is_transitioning {
            transition_accumulator.push(group);
        } else {
            // Flush accumulated transitions
            if !transition_accumulator.is_empty() {
                let accumulated = std::mem::take(&mut transition_accumulator);
                let merged = merge_transition_groups(accumulated);
                let duration_secs = merged.duration_secs();

                // For transitioning segments, use the most common bundle_id
                let bundle_id = merged.bundle_id.clone();
                let app_name = merged.app_name.clone();

                // Get most common window title
                let window_title = most_common_window_title(&merged.readings);

                segments.push(SegmentWithReadings {
                    segment: Segment {
                        id: Uuid::new_v4().to_string(),
                        session_id: merged.readings[0].session_id.clone(),
                        start_time: merged.start_time,
                        end_time: merged.end_time,
                        duration_secs,
                        bundle_id,
                        app_name: Some(app_name),
                        window_title,
                        segment_type: SegmentType::Transitioning,
                        confidence: 0.0, // Will be computed later
                        duration_score: None,
                        stability_score: None,
                        visual_clarity_score: None,
                        ocr_quality_score: None,
                        reading_count: merged.reading_count() as i64,
                        unique_phash_count: None, // Will be computed later
                        segment_summary: None,
                    },
                    readings: merged.readings.clone(),
                });
                // transition_accumulator is already cleared by replace above
            }

            // Add stable segment
            let duration_secs = group.duration_secs();
            let window_title = most_common_window_title(&group.readings);

            segments.push(SegmentWithReadings {
                segment: Segment {
                    id: Uuid::new_v4().to_string(),
                    session_id: group.readings[0].session_id.clone(),
                    start_time: group.start_time,
                    end_time: group.end_time,
                    duration_secs,
                    bundle_id: group.bundle_id.clone(),
                    app_name: Some(group.app_name.clone()),
                    window_title,
                    segment_type: SegmentType::Stable,
                    confidence: 0.0, // Will be computed later
                    duration_score: None,
                    stability_score: None,
                    visual_clarity_score: None,
                    ocr_quality_score: None,
                    reading_count: group.reading_count() as i64,
                    unique_phash_count: None, // Will be computed later
                    segment_summary: None,
                },
                readings: group.readings.clone(),
            });
        }
    }

    // Flush any remaining transitions
    if !transition_accumulator.is_empty() {
        let merged = merge_transition_groups(transition_accumulator);
        let duration_secs = merged.duration_secs();
        let bundle_id = merged.bundle_id.clone();
        let app_name = merged.app_name.clone();
        let window_title = most_common_window_title(&merged.readings);

        segments.push(SegmentWithReadings {
            segment: Segment {
                id: Uuid::new_v4().to_string(),
                session_id: merged.readings[0].session_id.clone(),
                start_time: merged.start_time,
                end_time: merged.end_time,
                duration_secs,
                bundle_id,
                app_name: Some(app_name),
                window_title,
                segment_type: SegmentType::Transitioning,
                confidence: 0.0,
                duration_score: None,
                stability_score: None,
                visual_clarity_score: None,
                ocr_quality_score: None,
                reading_count: merged.reading_count() as i64,
                unique_phash_count: None,
                segment_summary: None,
            },
            readings: merged.readings.clone(),
        });
    }

    segments
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
