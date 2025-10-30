use crate::db::models::{Interruption, Segment, SegmentType};
use crate::segmentation::config::SegmentationConfig;
use uuid::Uuid;

/// Result of sandwich merge: segments and interruptions created during merge.
pub struct SandwichMergeResult {
    pub segments: Vec<Segment>,
    pub interruptions: Vec<Interruption>,
}

/// Detect A→B→A pattern where B duration ≤ threshold and merge into A with B as interruption.
/// Handles recursive merges for multiple brief interruptions.
pub fn sandwich_merge(
    mut segments: Vec<Segment>,
    config: &SegmentationConfig,
) -> SandwichMergeResult {
    let mut all_interruptions = Vec::new();

    // Keep merging until no more merges are possible
    loop {
        let mut merged = false;
        let mut result = Vec::new();
        let mut i = 0;

        while i < segments.len() {
            // Check for sandwich pattern: A → B → A where B ≤ threshold
            if i + 2 < segments.len() {
                let a = &segments[i];
                let b = &segments[i + 1];
                let c = &segments[i + 2];

                // Check if A and C have same bundle_id, and B is short enough
                if a.bundle_id == c.bundle_id
                    && b.segment_type == SegmentType::Stable
                    && b.duration_secs <= config.sandwich_max_duration_secs as i64
                {
                    // Merge: extend A to C's end, add B as interruption
                    let mut merged_segment = a.clone();
                    merged_segment.end_time = c.end_time;
                    merged_segment.duration_secs =
                        (c.end_time - a.start_time).num_seconds();
                    // Update reading_count to sum readings from both A and C segments
                    merged_segment.reading_count = a.reading_count + c.reading_count;

                    // Create interruption from B
                    let interruption = Interruption {
                        id: Uuid::new_v4().to_string(),
                        segment_id: merged_segment.id.clone(),
                        bundle_id: b.bundle_id.clone(),
                        app_name: b.app_name.clone(),
                        timestamp: b.start_time,
                        duration_secs: b.duration_secs,
                    };

                    all_interruptions.push(interruption);
                    result.push(merged_segment);
                    i += 3;
                    merged = true;
                    continue;
                }
            }

            result.push(segments[i].clone());
            i += 1;
        }

        segments = result;

        if !merged {
            break;
        }
    }

    SandwichMergeResult {
        segments,
        interruptions: all_interruptions,
    }
}
