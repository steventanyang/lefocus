# Phase 4: Segmentation

**Status:** Not Started
**Dependencies:** Phase 3 (Sensing Pipeline)

## Overview

Phase 4 implements the **segmentation algorithm** that transforms raw `context_readings` into meaningful **segments** - continuous time intervals representing what you actually focused on during a session.

**Key Concepts:**

- **Segment**: A continuous period focused on one thing (e.g., "VS Code for 15 minutes")
- **Segment Types**:
  - **Stable** - Focused on one app for sustained period
  - **Transitioning** - Rapid switching, short duration (<3 min)
  - **Distracted** - Rapid switching, longer duration (≥3 min)
- **Interruptions**: Brief switches within a stable segment (e.g., checking Slack for 3s)
- **Confidence Score**: 0.0-1.0 rating based on duration, stability, visual clarity, OCR quality

**Design Principles:**

- **Deterministic:** Same readings always produce same segments
- **Fast:** Runs in <100ms for typical 25-min session (~300 readings)
- **Tunable:** All thresholds exposed as constants for easy adjustment
- **On-demand:** Computed when session ends (not live during session)

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TimerController                          │
│  (from Phase 2)                                                 │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ When end_session() called
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Segmentation Pipeline                        │
│                                                                 │
│  1. Load readings:  get_context_readings_for_session()         │
│  2. Segment:        segment_session(readings) -> Vec<Segment>  │
│  3. Persist:        insert_segments(segments)                  │
└─────────────────────────────────────────────────────────────────┘
             │
             │ Calls
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Segmentation Algorithm                       │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐          │
│  │  1. Preprocess readings (group by bundle_id)    │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  2. Detect transitions (3+ switches in 60s)     │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  3. Create initial segments (stable/transition) │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  4. Sandwich merge (A→B→A where B ≤12s)         │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  5. Classify transitions (by duration </>3min)  │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  6. Score confidence (4-factor weighted)        │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│              Vec<Segment>                                       │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
  segmentation/
    mod.rs              - Public API: segment_session()
    algorithm.rs        - Core state machine and segmentation logic
    merge.rs            - Sandwich merge, interruption detection
    scoring.rs          - Confidence scoring (4-factor)
    config.rs           - Tunable constants/thresholds

  db/
    models/
      segment.rs        - Segment, Interruption structs
    repositories/
      segments.rs       - CRUD operations for segments
    schemas/
      schema_v5.sql     - segments + interruptions tables
```

---

## Database Schema

### Migration: schema_v5.sql

```sql
-- Segments table
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,

    -- Time bounds
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    duration_secs INTEGER NOT NULL,

    -- Primary identity
    bundle_id TEXT NOT NULL,
    app_name TEXT,
    window_title TEXT,  -- Most common window title in this segment

    -- Segment classification
    segment_type TEXT NOT NULL,  -- 'stable', 'transitioning', 'distracted'

    -- Confidence scoring (0.0 to 1.0)
    confidence REAL NOT NULL,
    duration_score REAL,
    stability_score REAL,
    visual_clarity_score REAL,
    ocr_quality_score REAL,

    -- Stats
    reading_count INTEGER NOT NULL,
    unique_phash_count INTEGER,

    -- Future P1: LLM-generated summary
    segment_summary TEXT,

    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_session ON segments(session_id, start_time);
CREATE INDEX idx_segments_type ON segments(segment_type);

-- Interruptions table (brief switches within stable segments)
CREATE TABLE interruptions (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,

    bundle_id TEXT NOT NULL,
    app_name TEXT,

    timestamp TIMESTAMP NOT NULL,
    duration_secs INTEGER NOT NULL,

    FOREIGN KEY (segment_id) REFERENCES segments(id) ON DELETE CASCADE
);

CREATE INDEX idx_interruptions_segment ON interruptions(segment_id, timestamp);
```

---

## Segmentation Algorithm

### Tunable Constants (config.rs)

```rust
pub struct SegmentationConfig {
    // Minimum segment duration (ignore shorter segments unless at timer boundary)
    pub min_segment_duration_secs: u64,  // Default: 30

    // Sandwich merge: A→B→A where B is this short gets merged
    pub sandwich_max_duration_secs: u64,  // Default: 12

    // Transition detection window
    pub transition_window_secs: u64,      // Default: 60
    pub transition_switch_threshold: usize, // Default: 3 (3+ switches in 60s)

    // Classify transition vs distracted
    pub distracted_threshold_secs: u64,   // Default: 180 (3 minutes)

    // Confidence scoring weights
    pub weight_duration: f64,             // Default: 0.30
    pub weight_stability: f64,            // Default: 0.40
    pub weight_visual: f64,               // Default: 0.15
    pub weight_ocr: f64,                  // Default: 0.15
}

impl Default for SegmentationConfig {
    fn default() -> Self {
        Self {
            min_segment_duration_secs: 30,
            sandwich_max_duration_secs: 12,
            transition_window_secs: 60,
            transition_switch_threshold: 3,
            distracted_threshold_secs: 180,
            weight_duration: 0.30,
            weight_stability: 0.40,
            weight_visual: 0.15,
            weight_ocr: 0.15,
        }
    }
}
```

### Algorithm Steps

#### Step 1: Preprocess Readings

```rust
// Group consecutive readings by bundle_id
struct ReadingGroup {
    bundle_id: String,
    app_name: String,
    readings: Vec<ContextReading>,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
}

fn group_readings(readings: Vec<ContextReading>) -> Vec<ReadingGroup> {
    // Combine consecutive readings with same bundle_id
}
```

#### Step 2: Detect Transitions

```rust
// Mark groups as "transitioning" if:
// - 3+ app switches within 60 seconds
// OR
// - Median dwell time < 10 seconds

fn detect_transitions(groups: &mut [ReadingGroup], config: &SegmentationConfig) {
    for window in groups.windows(config.transition_window_secs) {
        let switch_count = count_unique_bundles(window);
        if switch_count >= config.transition_switch_threshold {
            mark_as_transitioning(window);
        }
    }
}
```

#### Step 3: Create Initial Segments

```rust
// Convert ReadingGroups to Segments
// - Consecutive transitioning groups → single segment
// - Stable groups → individual segments

fn create_initial_segments(groups: Vec<ReadingGroup>) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut transition_accumulator = Vec::new();

    for group in groups {
        if group.is_transitioning {
            transition_accumulator.push(group);
        } else {
            // Flush accumulated transitions
            if !transition_accumulator.is_empty() {
                segments.push(merge_transition_groups(transition_accumulator));
                transition_accumulator.clear();
            }
            // Add stable segment
            segments.push(Segment::from_group(group, SegmentType::Stable));
        }
    }

    segments
}
```

#### Step 4: Sandwich Merge

```rust
// Pattern: A → B → A (where B duration ≤ 12s)
// Result: Single A segment with B as interruption

fn sandwich_merge(segments: Vec<Segment>, config: &SegmentationConfig) -> Vec<Segment> {
    let mut result = Vec::new();
    let mut i = 0;

    while i < segments.len() {
        if i + 2 < segments.len() {
            let (a, b, c) = (&segments[i], &segments[i+1], &segments[i+2]);

            // Check sandwich pattern
            if a.bundle_id == c.bundle_id
               && b.segment_type == SegmentType::Stable
               && b.duration_secs <= config.sandwich_max_duration_secs {

                // Merge: extend A to C's end, add B as interruption
                let mut merged = a.clone();
                merged.end_time = c.end_time;
                merged.duration_secs = (c.end_time - a.start_time).num_seconds();
                merged.add_interruption(Interruption::from_segment(b));

                result.push(merged);
                i += 3;
                continue;
            }
        }

        result.push(segments[i].clone());
        i += 1;
    }

    result
}
```

#### Step 5: Classify Transition vs Distracted

```rust
// Transition segments >= 3 minutes become "Distracted"

fn classify_segments(segments: &mut [Segment], config: &SegmentationConfig) {
    for segment in segments {
        if segment.segment_type == SegmentType::Transitioning
           && segment.duration_secs >= config.distracted_threshold_secs {
            segment.segment_type = SegmentType::Distracted;
        }
    }
}
```

#### Step 6: Confidence Scoring

```rust
// 4-factor weighted average

fn compute_confidence(segment: &Segment, config: &SegmentationConfig) -> f64 {
    let duration_score = score_duration(segment.duration_secs);
    let stability_score = score_stability(segment);
    let visual_score = score_visual_clarity(segment);
    let ocr_score = score_ocr_quality(segment);

    config.weight_duration * duration_score
        + config.weight_stability * stability_score
        + config.weight_visual * visual_score
        + config.weight_ocr * ocr_score
}

fn score_duration(duration_secs: u64) -> f64 {
    // Sigmoid: 30s=0.3, 60s=0.5, 120s=0.7, 300s=0.9
    1.0 / (1.0 + (-0.02 * (duration_secs as f64 - 120.0)).exp())
}

fn score_stability(segment: &Segment) -> f64 {
    // % of readings with same bundle_id (already 1.0 for stable segments)
    // For transitioning/distracted, measure dominant app percentage
    segment.reading_count as f64 / segment.total_readings as f64
}

fn score_visual_clarity(segment: &Segment) -> f64 {
    // If unique_phash_count is high, content changed a lot (unstable)
    // If unique_phash_count is low, content stable
    let change_ratio = segment.unique_phash_count as f64 / segment.reading_count as f64;
    1.0 - change_ratio.min(1.0)
}

fn score_ocr_quality(segment: &Segment) -> f64 {
    // Average OCR confidence from readings
    segment.avg_ocr_confidence.unwrap_or(0.5)
}
```

---

## Edge Cases & Handling

### Case 1: Very Short Session (<30s)
**Behavior:** Create single segment regardless of min_segment_duration

```rust
if session_duration < config.min_segment_duration_secs {
    return vec![Segment::from_entire_session(readings)];
}
```

### Case 2: No App Switches (Entire Session One App)
**Behavior:** Single stable segment with high confidence

```rust
if all_same_bundle_id(&readings) {
    return vec![Segment {
        segment_type: SegmentType::Stable,
        confidence: 0.95,
        // ...
    }];
}
```

### Case 3: Rapid Switching Entire Session
**Behavior:** Single "Distracted" segment (≥3 min duration)

```rust
if is_all_transitioning(&segments) {
    let total_duration = session_end - session_start;
    let segment_type = if total_duration >= config.distracted_threshold_secs {
        SegmentType::Distracted
    } else {
        SegmentType::Transitioning
    };
    // Merge all into one segment
}
```

### Case 4: Segment at Timer Boundary
**Behavior:** Accept segment even if <min_segment_duration

```rust
// If segment ends at session end, keep it
if segment.end_time == session_end_time {
    keep_segment = true;
}
```

### Case 5: Multiple Brief Interruptions
**Pattern:** VS Code (15s) → Slack (5s) → VS Code (10s) → Chrome (3s) → VS Code (20s)
**Behavior:** Merge all into one stable VS Code segment with 2 interruptions

```rust
// Recursive sandwich merge handles this
```

### Case 6: Missing/Failed Readings
**Behavior:** Treat gaps as segment boundaries (don't interpolate)

```rust
if time_gap > 2 * CAPTURE_INTERVAL_SECS {
    end_current_segment();
    start_new_segment();
}
```

---

## Integration Points

### 1. Timer End Hook (timer/controller.rs)

```rust
pub async fn end_session(&mut self) -> Result<()> {
    let session_id = self.current_session_id()?;
    let end_time = Utc::now();

    // 1. Stop sensing
    self.sensing.stop_sensing().await?;

    // 2. Mark session complete
    self.db.complete_session(&session_id, end_time).await?;

    // 3. Run segmentation
    info!("Running segmentation for session {}", session_id);
    let readings = self.db.get_context_readings_for_session(&session_id).await?;

    let config = SegmentationConfig::default();
    let segments = segmentation::segment_session(readings, &config)?;

    self.db.insert_segments(&session_id, &segments).await?;
    info!("Created {} segments", segments.len());

    // 4. Play sound, notify UI, etc.
    self.audio.play(AudioClip::TimerComplete);
    self.emit_timer_state();

    Ok(())
}
```

### 2. Manual Regeneration (for interrupted sessions)

```rust
#[tauri::command]
pub async fn regenerate_segments(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<Vec<Segment>, String> {
    let db = &state.db;

    // Delete existing segments
    db.delete_segments_for_session(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    // Re-run segmentation
    let readings = db.get_context_readings_for_session(&session_id)
        .await
        .map_err(|e| e.to_string())?;

    let config = SegmentationConfig::default();
    let segments = segmentation::segment_session(readings, &config)
        .map_err(|e| e.to_string())?;

    db.insert_segments(&session_id, &segments)
        .await
        .map_err(|e| e.to_string())?;

    Ok(segments)
}
```

---

## UI Components

### 1. Timeline Block (SessionSummaryTimeline.tsx)

```tsx
interface TimelineProps {
  segments: Segment[];
  sessionDuration: number;
}

function SessionSummaryTimeline({ segments, sessionDuration }: TimelineProps) {
  return (
    <div className="timeline">
      {segments.map(segment => (
        <TimelineBlock
          key={segment.id}
          segment={segment}
          color={getSegmentColor(segment)}
          width={`${(segment.duration_secs / sessionDuration) * 100}%`}
          onClick={() => showSegmentDetails(segment)}
        />
      ))}
      <TimeAxis duration={sessionDuration} />
    </div>
  );
}

function getSegmentColor(segment: Segment): string {
  // Use app icon dominant color (Phase 5)
  // For now, deterministic hash of bundle_id
  if (segment.segment_type === 'transitioning') {
    return '#FFA500'; // Orange, striped pattern
  }
  if (segment.segment_type === 'distracted') {
    return '#FF6B6B'; // Red, diagonal stripes
  }

  // Stable: hash bundle_id to color
  return bundleIdToColor(segment.bundle_id);
}
```

### 2. Segment Details Modal

```tsx
function SegmentDetailsModal({ segment }: { segment: Segment }) {
  if (segment.segment_type === 'stable') {
    return (
      <div>
        <h3>{segment.app_name}</h3>
        <p>Duration: {formatDuration(segment.duration_secs)}</p>
        <p>Confidence: {(segment.confidence * 100).toFixed(0)}%</p>

        {segment.interruptions.length > 0 && (
          <div className="interruptions">
            <h4>Interruptions:</h4>
            {segment.interruptions.map(int => (
              <div key={int.id}>
                {int.app_name} - {int.duration_secs}s at {formatTime(int.timestamp)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else {
    // Transitioning/Distracted: show app breakdown
    return (
      <div>
        <h3>{segment.segment_type === 'transitioning' ? 'Transitioning' : 'Distracted'}</h3>
        <p>Duration: {formatDuration(segment.duration_secs)}</p>

        <h4>App Breakdown:</h4>
        {getAppBreakdown(segment).map(app => (
          <div key={app.bundle_id}>
            {app.app_name}: {app.duration_secs}s ({app.percentage}%)
          </div>
        ))}
      </div>
    );
  }
}
```

### 3. Horizontal Bar Chart (AppTimeBreakdown.tsx)

```tsx
interface BarChartProps {
  segments: Segment[];
}

function AppTimeBreakdown({ segments }: BarChartProps) {
  const appStats = aggregateAppStats(segments);
  const totalTime = segments.reduce((sum, s) => sum + s.duration_secs, 0);

  return (
    <div className="bar-chart">
      {appStats.map(app => (
        <div key={app.bundle_id} className="bar-row">
          <div className="app-label">{app.app_name}</div>
          <div className="bar-container">
            <div
              className="bar-fill"
              style={{
                width: `${(app.total_time / totalTime) * 100}%`,
                backgroundColor: getSegmentColor(app.bundle_id)
              }}
            />
          </div>
          <div className="percentage">
            {((app.total_time / totalTime) * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function aggregateAppStats(segments: Segment[]): AppStat[] {
  const stats = new Map<string, AppStat>();

  for (const segment of segments) {
    if (segment.segment_type === 'stable') {
      // Count full segment time
      const stat = stats.get(segment.bundle_id) ?? {
        bundle_id: segment.bundle_id,
        app_name: segment.app_name,
        total_time: 0
      };
      stat.total_time += segment.duration_secs;
      stats.set(segment.bundle_id, stat);
    } else {
      // For transitioning/distracted, show as single "Transitioning"/"Distracted" entry
      const key = segment.segment_type;
      const stat = stats.get(key) ?? {
        bundle_id: key,
        app_name: segment.segment_type === 'transitioning' ? 'Transitioning' : 'Distracted',
        total_time: 0
      };
      stat.total_time += segment.duration_secs;
      stats.set(key, stat);
    }
  }

  return Array.from(stats.values()).sort((a, b) => b.total_time - a.total_time);
}
```

---

## Testing Strategy

### Unit Tests (segmentation/algorithm_test.rs)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_single_app_no_switches() {
        let readings = create_test_readings("com.microsoft.VSCode", 300); // 25 min
        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].segment_type, SegmentType::Stable);
        assert!(segments[0].confidence > 0.9);
    }

    #[test]
    fn test_sandwich_merge() {
        let mut readings = Vec::new();
        readings.extend(create_test_readings("com.microsoft.VSCode", 3)); // 15s
        readings.extend(create_test_readings("com.slack.Slack", 1));       // 5s
        readings.extend(create_test_readings("com.microsoft.VSCode", 4)); // 20s

        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].bundle_id, "com.microsoft.VSCode");
        assert_eq!(segments[0].interruptions.len(), 1);
        assert_eq!(segments[0].interruptions[0].bundle_id, "com.slack.Slack");
    }

    #[test]
    fn test_transition_detection() {
        let mut readings = Vec::new();
        readings.extend(create_test_readings("com.google.Chrome", 2));  // 10s
        readings.extend(create_test_readings("com.slack.Slack", 1));     // 5s
        readings.extend(create_test_readings("com.apple.Safari", 2));    // 10s
        readings.extend(create_test_readings("com.microsoft.VSCode", 5)); // 25s

        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].segment_type, SegmentType::Transitioning);
        assert_eq!(segments[1].segment_type, SegmentType::Stable);
        assert_eq!(segments[1].bundle_id, "com.microsoft.VSCode");
    }

    #[test]
    fn test_distracted_classification() {
        // Rapid switching for 5 minutes
        let mut readings = Vec::new();
        for _ in 0..60 {
            readings.extend(create_test_readings("com.google.Chrome", 1));
            readings.extend(create_test_readings("com.slack.Slack", 1));
        }

        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].segment_type, SegmentType::Distracted);
    }
}
```

---

## Performance Requirements

### Benchmarks

| Session Length | Readings | Segments | Time Budget |
|---------------|----------|----------|-------------|
| 5 minutes     | ~60      | 1-3      | <10ms       |
| 25 minutes    | ~300     | 3-8      | <50ms       |
| 50 minutes    | ~600     | 5-15     | <100ms      |

**Target:** O(n) complexity where n = reading count

---

## Acceptance Criteria

Phase 4 is complete when:

- [ ] `segments` and `interruptions` tables exist in schema_v5
- [ ] `segment_session()` function implemented with all steps
- [ ] Sandwich merge logic working correctly
- [ ] Transition/Distracted classification working
- [ ] Confidence scoring implemented (4-factor)
- [ ] Segmentation runs automatically on session end
- [ ] Manual `regenerate_segments` command available for interrupted sessions
- [ ] UI displays timeline with colored segment blocks
- [ ] UI displays horizontal bar chart with app time breakdown
- [ ] Clicking segment shows details modal with interruptions/breakdown
- [ ] All tunable constants exposed in `SegmentationConfig`
- [ ] Unit tests pass for all edge cases
- [ ] Segmentation completes in <100ms for 25-min session

---

## Future Enhancements (Phase 5+)

- **Live segmentation:** Update segments in real-time during session
- **App icon colors:** Extract dominant color from app icons for timeline
- **LLM summaries:** Generate `segment_summary` field using local LLM
- **Segment editing:** Manual merge/split segments in UI
- **Export:** Export segments as JSON/CSV
- **Analytics:** Weekly/monthly aggregate stats across all sessions

---

## Migration Guide

### From Phase 3 to Phase 4

1. **Run schema migration:**
   ```sql
   -- db/schemas/schema_v5.sql
   -- Creates segments and interruptions tables
   ```

2. **Update db/mod.rs:**
   ```rust
   const CURRENT_SCHEMA_VERSION: i64 = 5;
   ```

3. **Add segmentation module:**
   ```bash
   mkdir -p src/segmentation
   touch src/segmentation/{mod.rs,algorithm.rs,merge.rs,scoring.rs,config.rs}
   ```

4. **Update timer/controller.rs:**
   Add segmentation call in `end_session()`

5. **Create UI components:**
   ```bash
   mkdir -p src/components/session-summary
   touch src/components/session-summary/{Timeline.tsx,BarChart.tsx,SegmentDetails.tsx}
   ```

---

## Appendix: Color Assignment Strategy

### Deterministic Bundle ID → Color

```rust
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

fn bundle_id_to_color(bundle_id: &str) -> String {
    let mut hasher = DefaultHasher::new();
    bundle_id.hash(&mut hasher);
    let hash = hasher.finish();

    // Generate HSL color with fixed saturation/lightness
    let hue = (hash % 360) as f64;
    format!("hsl({}, 70%, 60%)", hue)
}
```

### Future: Icon-based Colors (Phase 5)

Extract dominant color from app icon using macOS APIs:
```swift
func getDominantColor(bundleId: String) -> NSColor? {
    guard let app = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId),
          let icon = NSWorkspace.shared.icon(forFile: app.path) else {
        return nil
    }

    // Extract dominant color from icon bitmap
    return extractDominantColor(from: icon)
}
```
