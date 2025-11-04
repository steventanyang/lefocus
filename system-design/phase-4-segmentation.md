# Phase 4: Segmentation

**Status:** Implemented (Simplified)
**Dependencies:** Phase 3 (Sensing Pipeline)

## Overview

Phase 4 implements the **segmentation algorithm** that transforms raw `context_readings` into meaningful **segments** - continuous time intervals representing what you actually focused on during a session.

**Key Concepts:**

- **Segment**: A continuous period focused on one thing (e.g., "VS Code for 15 minutes")
- **Interruptions**: Brief switches within a segment (e.g., checking Slack for 3s) - merged via sandwich pattern
- **Confidence Score**: 0.0-1.0 rating based on duration, stability, visual clarity, OCR quality
  - High (≥0.7): Focused work
  - Medium (0.4-0.7): Mixed activity
  - Low (<0.4): Unclear/fragmented

**Design Principles:**

- **Deterministic:** Same readings always produce same segments
- **Fast:** Runs in <100ms for typical 25-min session (~300 readings)
- **Simple:** No artificial segment type categories - confidence score indicates quality
- **On-demand:** Computed when session ends and awaited before the UI receives completion (summary must have data immediately)

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
│  │  1. Group readings by bundle_id                 │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  2. Create segments from groups                 │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  3. Sandwich merge (A→B→A where B ≤12s)         │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│  ┌──────────────────────────────────────────────────┐          │
│  │  4. Score confidence (4-factor weighted)        │          │
│  └──────────────┬───────────────────────────────────┘          │
│                 ▼                                               │
│              Vec<Segment>                                       │
└─────────────────────────────────────────────────────────────────┘
```

The three pipeline steps run synchronously inside `TimerController::end_timer`; completion waits for segments + interruptions to persist so the React summary view can render immediately after the end button returns.

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
      segment.rs        - Segment, Interruption structs (no SegmentType)
    repositories/
      segments.rs       - CRUD operations for segments
    schemas/
      schema_v6.sql     - segments + interruptions tables (removed segment_type)
```

---

## Database Schema

### Migration: schema_v6.sql

```sql
-- Segments table (simplified - no segment_type)
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,

    -- Time bounds
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_secs INTEGER NOT NULL,

    -- Primary identity
    bundle_id TEXT NOT NULL,
    app_name TEXT,
    window_title TEXT,

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

-- Interruptions table (brief switches within any segment)
CREATE TABLE interruptions (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,

    bundle_id TEXT NOT NULL,
    app_name TEXT,

    timestamp TEXT NOT NULL,
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

    // Sandwich merge: A→B→A where B is this short gets merged as interruption
    pub sandwich_max_duration_secs: u64,  // Default: 12

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
            weight_duration: 0.30,
            weight_stability: 0.40,
            weight_visual: 0.15,
            weight_ocr: 0.15,
        }
    }
}
```

### Algorithm Steps

#### Step 1: Group Readings

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

#### Step 2: Create Initial Segments

```rust
// Convert ReadingGroups to Segments (1:1 mapping)
fn create_initial_segments(groups: Vec<ReadingGroup>) -> Vec<Segment> {
    groups.into_iter().map(|group| {
        Segment {
            bundle_id: group.bundle_id,
            app_name: group.app_name,
            start_time: group.start_time,
            end_time: group.end_time,
            readings: group.readings,
            // ...
        }
    }).collect()
}
```

#### Step 3: Sandwich Merge

```rust
// Pattern: A → B → A (where B duration ≤ 12s)
// Result: Single A segment with B as interruption

fn sandwich_merge(segments: Vec<Segment>, config: &SegmentationConfig) -> Vec<Segment> {
    // Recursively merge A→B→A patterns
    // No segment type checks - works on all segments

    while i < segments.len() {
        if i + 2 < segments.len() {
            let (a, b, c) = (&segments[i], &segments[i+1], &segments[i+2]);

            if a.bundle_id == c.bundle_id
               && b.duration_secs <= config.sandwich_max_duration_secs {
                // Merge: extend A to C's end, add B as interruption
                merged.add_interruption(Interruption::from_segment(b));
                i += 3;
                continue;
            }
        }
        i += 1;
    }
}
```

#### Step 4: Confidence Scoring

```rust
// 4-factor weighted average

fn compute_confidence(segment: &Segment, readings: &[ContextReading], config: &SegmentationConfig) -> f64 {
    let duration_score = score_duration(segment.duration_secs);
    let stability_score = score_stability(segment, readings);
    let visual_score = score_visual_clarity(segment);
    let ocr_score = score_ocr_quality(segment, readings);

    config.weight_duration * duration_score
        + config.weight_stability * stability_score
        + config.weight_visual * visual_score
        + config.weight_ocr * ocr_score
}

fn score_duration(duration_secs: i64) -> f64 {
    // Sigmoid: 30s≈0.3, 60s≈0.5, 120s≈0.7, 300s≈0.9
    1.0 / (1.0 + (-0.02 * (duration_secs as f64 - 120.0)).exp())
}

fn score_stability(segment: &Segment, readings: &[ContextReading]) -> f64 {
    // % of readings with same bundle_id as segment
    let same_bundle_count = readings.iter()
        .filter(|r| r.window_metadata.bundle_id == segment.bundle_id)
        .count();
    same_bundle_count as f64 / readings.len() as f64
}

fn score_visual_clarity(segment: &Segment) -> f64 {
    // Lower unique_phash_count = more stable visuals
    let change_ratio = segment.unique_phash_count as f64 / segment.reading_count as f64;
    1.0 - change_ratio.min(1.0)
}

fn score_ocr_quality(segment: &Segment, readings: &[ContextReading]) -> f64 {
    // Average OCR confidence from readings
    let avg = readings.iter()
        .filter_map(|r| r.ocr_confidence)
        .sum::<f64>() / readings.len() as f64;
    avg.max(0.5) // Default 0.5 if no OCR data
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

**Behavior:** Single segment with high confidence (0.95)

```rust
if all_same_bundle_id(&readings) {
    return vec![Segment {
        confidence: 0.95,
        // ...
    }];
}
```

### Case 3: Rapid Switching Entire Session

**Behavior:** Multiple short segments, low confidence scores indicate fragmented focus

```rust
// Natural result of algorithm - many short segments
// Confidence scores naturally low due to short duration
// No special case handling needed
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

**Note:** Manual regeneration was deprecated and removed to simplify UX. Segmentation now only runs automatically on session completion.

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
      {segments.map((segment) => (
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
  // Color based on confidence score
  if (segment.confidence >= 0.7) {
    return "#10B981"; // Green - focused
  } else if (segment.confidence >= 0.4) {
    return "#FBBF24"; // Yellow - mixed
  } else {
    return "#EF4444"; // Red - unclear
  }
}
```

### 2. Segment Details Modal

```tsx
function SegmentDetailsModal({ segment }: { segment: Segment }) {
  return (
    <div>
      <h3>{segment.app_name}</h3>
      <p>Duration: {formatDuration(segment.duration_secs)}</p>
      <p>Confidence: {(segment.confidence * 100).toFixed(0)}%</p>

      {/* Confidence breakdown */}
      <div className="confidence-scores">
        <div>Duration: {(segment.duration_score * 100).toFixed(0)}%</div>
        <div>Stability: {(segment.stability_score * 100).toFixed(0)}%</div>
        <div>Visual: {(segment.visual_clarity_score * 100).toFixed(0)}%</div>
        <div>OCR: {(segment.ocr_quality_score * 100).toFixed(0)}%</div>
      </div>

      {/* Show interruptions for any segment */}
      {segment.interruptions.length > 0 && (
        <div className="interruptions">
          <h4>Interruptions:</h4>
          {segment.interruptions.map((int) => (
            <div key={int.id}>
              {int.app_name} - {int.duration_secs}s at {formatTime(int.timestamp)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
      {appStats.map((app) => (
        <div key={app.bundle_id} className="bar-row">
          <div className="app-label">{app.app_name}</div>
          <div className="bar-container">
            <div
              className="bar-fill"
              style={{
                width: `${(app.total_time / totalTime) * 100}%`,
                backgroundColor: getSegmentColor(app.bundle_id),
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
    const stat = stats.get(segment.bundle_id) ?? {
      bundle_id: segment.bundle_id,
      app_name: segment.app_name,
      total_time: 0,
    };
    stat.total_time += segment.duration_secs;
    stats.set(segment.bundle_id, stat);
  }

  return Array.from(stats.values())
    .sort((a, b) => b.total_time - a.total_time)
    .slice(0, 5); // Top 5 apps
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
        assert_eq!(segments[0].bundle_id, "com.microsoft.VSCode");
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
    fn test_rapid_switching() {
        let mut readings = Vec::new();
        readings.extend(create_test_readings("com.google.Chrome", 2));  // 10s
        readings.extend(create_test_readings("com.slack.Slack", 1));     // 5s
        readings.extend(create_test_readings("com.apple.Safari", 2));    // 10s
        readings.extend(create_test_readings("com.microsoft.VSCode", 5)); // 25s

        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 4); // Four separate segments
        // First three segments have low confidence due to short duration
        assert!(segments[0].confidence < 0.5);
        assert!(segments[1].confidence < 0.5);
        assert!(segments[2].confidence < 0.5);
        // Last segment has higher confidence
        assert!(segments[3].confidence > 0.5);
    }

    #[test]
    fn test_confidence_scoring() {
        let mut readings = Vec::new();
        // Long stable session should have high confidence
        readings.extend(create_test_readings("com.microsoft.VSCode", 60)); // 5 min

        let segments = segment_session(readings, &SegmentationConfig::default()).unwrap();

        assert_eq!(segments.len(), 1);
        assert!(segments[0].confidence >= 0.7); // High confidence
    }
}
```

---

## Performance Requirements

### Benchmarks

| Session Length | Readings | Segments | Time Budget |
| -------------- | -------- | -------- | ----------- |
| 5 minutes      | ~60      | 1-3      | <10ms       |
| 25 minutes     | ~300     | 3-8      | <50ms       |
| 50 minutes     | ~600     | 5-15     | <100ms      |

**Target:** O(n) complexity where n = reading count

---

## Acceptance Criteria

Phase 4 is complete when:

- [x] `segments` and `interruptions` tables exist in schema_v6
- [x] `segment_session()` function implemented (simplified algorithm)
- [x] Sandwich merge logic working correctly
- [x] Confidence scoring implemented (4-factor)
- [x] Segmentation runs automatically on session end
- [x] UI displays timeline with confidence-based colored segment blocks
- [x] UI displays top apps breakdown (instead of segment types)
- [x] Clicking segment shows details modal with confidence breakdown and interruptions
- [x] All tunable constants exposed in `SegmentationConfig`
- [x] Segmentation completes in <100ms for 25-min session

**Simplifications Made:**
- Removed segment type classification (Stable/Transitioning/Distracted)
- Removed transition detection logic (~100 lines)
- Removed manual regenerate_segments command (UX simplification)
- Confidence score is now the primary quality indicator
- UI color-codes by confidence instead of segment type

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

### From v5 to v6 (Simplified Segmentation)

1. **Run schema migration:**

   ```sql
   -- db/schemas/schema_v6.sql
   -- Removes segment_type column from segments table
   ```

2. **Update db/migrations.rs:**

   ```rust
   const CURRENT_SCHEMA_VERSION: i32 = 6;
   ```

3. **Database changes:**
   - Removed `segment_type` column
   - Removed `idx_segments_type` index
   - All segments now treated uniformly

4. **Code changes:**
   - Removed `SegmentType` enum from models
   - Removed transition detection from algorithm
   - Removed classification step
   - Simplified merge logic (no type checks)

5. **Frontend changes:**
   - Timeline colors now based on confidence score
   - Stats show top apps instead of segment types
   - Removed segment type display from UI

---

## Appendix: Confidence-Based Color Scheme

### Timeline Colors

Segments are colored based on confidence score to visually indicate quality:

```typescript
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "#10B981"; // Green - Focused
  if (confidence >= 0.4) return "#FBBF24"; // Yellow - Mixed
  return "#EF4444"; // Red - Unclear
}
```

**Color Meanings:**
- **Green (≥70%)**: High confidence - focused, sustained work
- **Yellow (40-70%)**: Medium confidence - mixed activity
- **Red (<40%)**: Low confidence - fragmented, unclear

This provides immediate visual feedback about session quality without needing to understand artificial segment type categories.
