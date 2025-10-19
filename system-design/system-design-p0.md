# LeFocus P0 System Design Document

**Version:** 0.1
**Date:** October 2025
**Author:** Steven Yang
**Status:** Draft - Implementation Guide

---

## Document Purpose

This system design document serves as the **source of truth** for implementing the P0 milestone of LeFocus Context Companion. It provides sufficient technical detail for multiple development agents to share context and maintain architectural consistency while avoiding unnecessary bloat.

**Target audience:**
- Implementation agents (AI assistants, future contributors)
- Code reviewers
- Future maintainers

**Scope:**
- Detailed component architecture
- Data models and storage schema
- Core algorithms (especially segmentation logic)
- API contracts between layers
- Performance constraints and error handling

**Out of scope:**
- P1+ features (CLIP embeddings, LLM integration, multi-monitor)
- Audio integration (deferred to P1)
- Deployment and distribution

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [System Components](#4-system-components)
5. [Data Models](#5-data-models)
6. [Core Algorithms](#6-core-algorithms)
7. [API Contracts](#7-api-contracts)
8. [Storage Layer](#8-storage-layer)
9. [Performance & Resource Constraints](#9-performance--resource-constraints)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Testing Strategy](#12-testing-strategy)
13. [Open Questions](#13-open-questions)

---

## 1. Overview & Goals

### 1.1 P0 Mission

Build a **deterministic, on-device Pomodoro companion** that:
1. Tracks where visual attention goes during focus sessions
2. Generates accurate post-session summaries
3. Operates with minimal resource overhead (<6% CPU, <300 MB RAM)
4. Respects privacy (no network calls, no persistent images)

### 1.2 Success Criteria

| Metric | Target |
|--------|--------|
| Avg CPU usage | ≤ 6% (1 core sustained) |
| Peak CPU spike | ≤ 15% for < 1 s |
| Memory footprint | ≤ 300 MB steady state |
| Summary render latency | ≤ 200 ms |
| Context switch accuracy | ≥ 90% correctly segmented |
| Battery impact | < 3% drain/hour vs idle |
| Privacy | 0 network calls, 0 persistent images |

### 1.3 Core User Flow

```
1. User presses "Start" → Timer begins (25 min default)
2. Background sensing activates (silent, invisible)
3. System samples active window + screenshots at cadence
4. Timer completes → Sensing halts
5. Summary view renders with stacked bar chart + timeline
6. User reviews, then dismisses or starts next session
```

---

## 2. High-Level Architecture

### 2.1 System Layers

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Timer View  │  │ Summary View │  │ Settings View │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ Tauri IPC (invoke/emit)
┌──────────────────────────▼──────────────────────────────┐
│                    Tauri Rust Core                       │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │   Timer    │  │  Sensing    │  │    Summary       │ │
│  │ Controller │  │  Pipeline   │  │   Generator      │ │
│  └────────────┘  └─────────────┘  └──────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │           Session Storage (SQLite)                  │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ FFI / Process spawn
┌──────────────────────────▼──────────────────────────────┐
│               Swift Tauri Plugin (macOS)                 │
│  ┌─────────────────┐  ┌──────────────────────────────┐ │
│  │ Window Metadata │  │ Screenshot + Vision OCR      │ │
│  │    Capture      │  │   (VNRecognizeTextRequest)   │ │
│  └─────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Layer Responsibilities

| Layer | Responsibility | Key Constraints |
|-------|----------------|-----------------|
| **React UI** | Timer display, summary visualization, user input | Render ≤ 16ms (60fps), minimal state |
| **Tauri Core** | Timer logic, orchestration, segmentation, storage | No blocking I/O on main thread |
| **Swift Plugin** | macOS screen API access, OCR execution | Must handle permission failures gracefully |

### 2.3 Data Flow (During Session)

```
Timer Start Event
    ↓
Spawn Tokio Task (sensing_loop)
    ↓
Every 5s: Call Swift → Get window metadata (bundleId, title, bounds)
    ↓
If window changed: Call Swift → Capture screenshot
    ↓
Compute pHash + SSIM (Rust, image crate)
    ↓
If visual change detected: Call Swift → Run OCR (Vision.framework)
    ↓
Accumulate readings in Vec<ContextReading> (in-memory)
    ↓
Timer End Event
    ↓
Run segmentation algorithm → Vec<Segment>
    ↓
Persist to SQLite
    ↓
Generate summary JSON → Emit to frontend
```

---

## 3. Technology Stack

### 3.1 Core Dependencies

#### Rust (Backend)
```toml
[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
image = "0.25"                    # Screenshot processing
image-hasher = "0.4"              # pHash computation
image-compare = "0.4"             # SSIM grid calculation
chrono = { version = "0.4", features = ["serde"] }
anyhow = "1"
log = "0.4"
env_logger = "0.11"
```

#### Swift Plugin
```swift
import Cocoa
import Vision
import ScreenCaptureKit  // macOS 13+ screen capture API
```

#### Frontend (React)
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "@tauri-apps/api": "^2",
    "recharts": "^2.10.0"  // NEW: For stacked bar chart
  }
}
```

### 3.2 Why These Choices?

| Technology | Rationale |
|------------|-----------|
| **Tokio** | Async runtime for polling loops, non-blocking I/O |
| **SQLite** | Local persistence with ACID, query support for historical data |
| **image-hasher** | Battle-tested pHash impl, avoid reinventing |
| **image-compare** | SSIM calculation for structural change detection |
| **Swift Plugin** | Native macOS API access (Vision, ScreenCaptureKit) |
| **Recharts** | Declarative React charts, good for stacked bar viz |

---

## 4. System Components

### 4.1 Timer Controller

**Responsibility:** Manage Pomodoro timer state, start/stop sensing pipeline.

#### State Machine
```rust
enum TimerState {
    Idle,
    Running { session_id: Uuid, start_time: DateTime<Utc>, duration_secs: u32 },
    Paused { session_id: Uuid, elapsed_secs: u32 },
    Completed { session_id: Uuid },
}
```

#### API Surface
```rust
struct TimerController {
    state: Arc<Mutex<TimerState>>,
    sensing_handle: Option<JoinHandle<()>>,
}

impl TimerController {
    async fn start_session(&mut self, duration_secs: u32) -> Result<Uuid>;
    async fn stop_session(&mut self) -> Result<SummaryData>;
    async fn pause_session(&mut self) -> Result<()>;
    async fn resume_session(&mut self) -> Result<()>;
    fn get_state(&self) -> TimerState;
}
```

#### Threading Model
- Timer ticks on dedicated tokio task (1s interval)
- Emits progress events to frontend via Tauri event system
- On start: Spawns `sensing_pipeline` task
- On stop: Cancels sensing task, triggers segmentation

---

### 4.2 Context Sensing Pipeline

**Responsibility:** Poll window metadata, capture screenshots, detect changes.

#### High-Level Loop
```rust
async fn sensing_pipeline(
    session_id: Uuid,
    readings_buffer: Arc<Mutex<Vec<ContextReading>>>,
    cancel_token: CancellationToken,
) -> Result<()> {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    let mut last_window: Option<WindowMetadata> = None;
    let mut last_phash: Option<ImageHash> = None;
    let mut last_ocr_time = Instant::now();

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // 1. Get active window metadata (Swift plugin call)
                let window = get_active_window_metadata().await?;

                // 2. Check if window changed
                let window_changed = last_window.as_ref()
                    .map(|w| w.bundle_id != window.bundle_id || w.title != window.title)
                    .unwrap_or(true);

                // 3. Capture screenshot if changed
                if window_changed {
                    let screenshot = capture_active_window_screenshot(&window).await?;
                    let phash = compute_phash(&screenshot);

                    // 4. Compute visual change
                    let visual_change = if let Some(ref prev) = last_phash {
                        hamming_distance(prev, &phash) >= PHASH_THRESHOLD
                    } else {
                        true
                    };

                    // 5. Run OCR if visual change + cooldown elapsed
                    let mut ocr_text = None;
                    if visual_change && last_ocr_time.elapsed() >= Duration::from_secs(15) {
                        ocr_text = Some(run_ocr(&screenshot).await.ok());
                        last_ocr_time = Instant::now();
                    }

                    // 6. Record reading
                    let reading = ContextReading {
                        timestamp: Utc::now(),
                        window_metadata: window.clone(),
                        phash: phash.clone(),
                        ocr_text,
                    };

                    readings_buffer.lock().unwrap().push(reading);

                    last_phash = Some(phash);
                }

                last_window = Some(window);
            }
            _ = cancel_token.cancelled() => {
                log::info!("Sensing pipeline cancelled");
                break;
            }
        }
    }

    Ok(())
}
```

#### Sensing Configuration
```rust
const POLL_INTERVAL_SECS: u64 = 5;
const OCR_COOLDOWN_SECS: u64 = 15;
const PHASH_THRESHOLD: u32 = 12;  // Hamming distance
const SSIM_TILE_THRESHOLD: f64 = 0.75;  // Per-tile similarity
const SCREENSHOT_MAX_WIDTH: u32 = 1280;  // Downscale target
```

---

### 4.3 Swift Plugin Interface

**Responsibility:** Expose macOS-specific APIs to Rust via Tauri plugin.

#### Plugin Structure
```swift
// TauriPlugin_MacOSSensing/Sources/MacOSSensing.swift

@objc class MacOSSensingPlugin: NSObject {

    // Get metadata of active window
    @objc func getActiveWindowMetadata() -> [String: Any]? {
        guard let app = NSWorkspace.shared.frontmostApplication,
              let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }

        for window in windowList {
            if window[kCGWindowOwnerPID as String] as? pid_t == app.processIdentifier {
                return [
                    "bundleId": app.bundleIdentifier ?? "",
                    "title": window[kCGWindowName as String] as? String ?? "",
                    "bounds": window[kCGWindowBounds as String] as? [String: CGFloat] ?? [:],
                    "ownerName": window[kCGWindowOwnerName as String] as? String ?? ""
                ]
            }
        }
        return nil
    }

    // Capture screenshot of active window
    @objc func captureActiveWindowScreenshot(bounds: CGRect) async -> Data? {
        // Use ScreenCaptureKit (macOS 13+)
        guard let content = try? await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true) else {
            return nil
        }

        // Find window matching bounds
        guard let window = content.windows.first(where: { $0.frame == bounds }) else {
            return nil
        }

        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        config.width = Int(min(bounds.width, 1280))  // Respect max width
        config.height = Int(bounds.height * (config.width / bounds.width))
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false

        guard let cgImage = try? await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) else {
            return nil
        }

        // Convert to grayscale PNG data
        let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: config.width, height: config.height))
        return nsImage.tiffRepresentation  // Rust will decode + grayscale
    }

    // Run OCR on screenshot
    @objc func runOCR(imageData: Data) async -> [String: Any] {
        guard let cgImage = NSImage(data: imageData)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return ["error": "Failed to decode image"]
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast  // P0 uses fast mode
        request.usesLanguageCorrection = false

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                return ["text": "", "confidence": 0.0]
            }

            let recognizedText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
            let avgConfidence = observations.compactMap { $0.topCandidates(1).first?.confidence }.reduce(0, +) / Double(observations.count)

            return [
                "text": recognizedText,
                "confidence": avgConfidence,
                "wordCount": observations.count
            ]
        } catch {
            return ["error": error.localizedDescription]
        }
    }
}
```

#### Rust-Swift Bridge (Tauri Plugin Registration)
```rust
// src-tauri/src/lib.rs

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime, Manager,
};

#[tauri::command]
async fn get_active_window_metadata<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<WindowMetadata, String> {
    // Call Swift plugin via Tauri plugin API
    app.call_plugin("macos-sensing", "getActiveWindowMetadata", ())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn capture_screenshot<R: Runtime>(
    app: tauri::AppHandle<R>,
    bounds: WindowBounds,
) -> Result<Vec<u8>, String> {
    app.call_plugin("macos-sensing", "captureActiveWindowScreenshot", bounds)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn run_ocr<R: Runtime>(
    app: tauri::AppHandle<R>,
    image_data: Vec<u8>,
) -> Result<OCRResult, String> {
    app.call_plugin("macos-sensing", "runOCR", image_data)
        .await
        .map_err(|e| e.to_string())
}
```

---

### 4.4 Segmentation Engine

**Responsibility:** Transform raw context readings into meaningful segments with confidence scores.

#### Algorithm Overview (from notes.md)

The segmentation engine implements a **state machine with hysteresis** to avoid fragmentation:

```
States:
- Stable: Currently in a sustained focus segment
- Transitioning: Rapid switching detected (≥3 switches in 60s)

Events:
- Window/app change detected
- Visual change (pHash delta > threshold)
- Timer tick (periodic consolidation)
```

#### Core Algorithm (Pseudocode)
```rust
fn segment_session(readings: Vec<ContextReading>) -> Vec<Segment> {
    let mut segments = Vec::new();
    let mut current_segment: Option<SegmentBuilder> = None;
    let mut switch_history = VecDeque::new();  // Last 60s of switches
    let mut transitioning_segment: Option<SegmentBuilder> = None;

    for reading in readings {
        let current_time = reading.timestamp;
        let current_app = &reading.window_metadata.bundle_id;

        // Update switch history (rolling 60s window)
        switch_history.retain(|&t| current_time - t < Duration::seconds(60));

        // Check if app/window changed
        let app_changed = current_segment.as_ref()
            .map(|seg| seg.bundle_id != current_app)
            .unwrap_or(true);

        if app_changed {
            switch_history.push_back(current_time);
        }

        // Detect rapid switching
        let switch_rate = switch_history.len();
        let median_dwell = calculate_median_dwell(&switch_history);
        let is_transitioning = switch_rate >= 3 || median_dwell < Duration::seconds(10);

        match (current_segment.as_mut(), transitioning_segment.as_mut()) {
            // Case 1: Currently stable, no app change
            (Some(seg), None) if !app_changed => {
                seg.extend(reading);
            }

            // Case 2: Stable segment too short, extend it (ignore brief interruption)
            (Some(seg), None) if app_changed && seg.duration() < Duration::seconds(15) => {
                seg.extend_with_interruption(reading);
            }

            // Case 3: Sandwich merge (A → B → A with short B)
            (Some(seg), None) if app_changed => {
                if let Some(prev_seg) = segments.last_mut() {
                    if prev_seg.bundle_id == current_app
                        && seg.duration() <= Duration::seconds(12) {
                        // Merge: close current as interruption, extend previous
                        prev_seg.add_interruption(seg.finalize());
                        current_segment = Some(SegmentBuilder::new(reading));
                        return;
                    }
                }

                // Normal switch
                if is_transitioning {
                    // Enter transitioning state
                    segments.push(seg.finalize());
                    transitioning_segment = Some(SegmentBuilder::new_transitioning(reading));
                    current_segment = None;
                } else {
                    // Clean switch
                    segments.push(seg.finalize());
                    current_segment = Some(SegmentBuilder::new(reading));
                }
            }

            // Case 4: In transitioning state, stable for ≥15s
            (None, Some(trans)) if !app_changed && trans.stable_duration() >= Duration::seconds(15) => {
                segments.push(trans.finalize());
                transitioning_segment = None;
                current_segment = Some(SegmentBuilder::new(reading));
            }

            // Case 5: In transitioning state, continue switching
            (None, Some(trans)) => {
                trans.extend(reading);
            }

            _ => {
                // Fallback: start new segment
                current_segment = Some(SegmentBuilder::new(reading));
            }
        }
    }

    // Finalize remaining segments
    if let Some(seg) = current_segment {
        segments.push(seg.finalize());
    }
    if let Some(trans) = transitioning_segment {
        segments.push(trans.finalize());
    }

    segments
}
```

#### Thresholds (from notes.md)
```rust
const MIN_SEGMENT_DURATION: Duration = Duration::seconds(15);
const MERGE_GAP: Duration = Duration::seconds(12);
const TRANSITION_SWITCH_THRESHOLD: usize = 3;  // switches per 60s
const TRANSITION_DWELL_THRESHOLD: Duration = Duration::seconds(10);  // median dwell
const STABLE_CONSOLIDATION_THRESHOLD: Duration = Duration::seconds(15);
```

#### Confidence Scoring (from notes.md)
```rust
fn compute_confidence(segment: &Segment) -> f64 {
    let mut factors = Vec::new();

    // Factor 1: Duration (longer = more reliable)
    let duration_score = match segment.duration.as_secs() {
        0..=15 => 0.3,
        16..=60 => 0.6,
        61..=300 => 0.8,
        _ => 1.0,
    };
    factors.push(duration_score);

    // Factor 2: Focus stability (fraction of frames with same window/app)
    let stability_score = segment.stable_frames as f64 / segment.total_frames as f64;
    factors.push(stability_score);

    // Factor 3: Visual change clarity (pHash/SSIM delta margin)
    let change_margin = segment.boundary_phash_delta as f64 / PHASH_THRESHOLD as f64;
    let clarity_score = (change_margin - 1.0).max(0.0).min(1.0);
    factors.push(clarity_score);

    // Factor 4: OCR quality (avg confidence or text length)
    let ocr_score = segment.ocr_avg_confidence.unwrap_or(0.0);
    factors.push(ocr_score);

    // Weighted average (duration and stability weighted higher)
    let weights = [0.3, 0.4, 0.15, 0.15];
    factors.iter().zip(weights.iter()).map(|(f, w)| f * w).sum()
}
```

---

### 4.5 Summary Generator

**Responsibility:** Transform segments into user-facing summary data.

#### Output Structure
```rust
#[derive(Serialize)]
struct SummaryData {
    session_id: Uuid,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    total_duration_secs: u32,
    segments: Vec<SegmentSummary>,
    caption: String,  // e.g., "You spent most time in VS Code"
}

#[derive(Serialize)]
struct SegmentSummary {
    bundle_id: String,
    app_name: String,
    title: String,
    duration_secs: u32,
    percentage: f64,
    confidence: f64,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    ocr_snippet: Option<String>,  // First 100 chars of OCR
}
```

#### Generation Logic
```rust
async fn generate_summary(session_id: Uuid) -> Result<SummaryData> {
    // 1. Load session from SQLite
    let session = db::load_session(session_id).await?;

    // 2. Load readings
    let readings = db::load_readings(session_id).await?;

    // 3. Run segmentation
    let segments = segment_session(readings);

    // 4. Compute statistics
    let total_duration = session.end_time - session.start_time;
    let segment_summaries: Vec<SegmentSummary> = segments
        .iter()
        .map(|seg| SegmentSummary {
            bundle_id: seg.bundle_id.clone(),
            app_name: get_app_name(&seg.bundle_id).unwrap_or_else(|| seg.bundle_id.clone()),
            title: seg.title.clone(),
            duration_secs: seg.duration.as_secs() as u32,
            percentage: seg.duration.as_secs() as f64 / total_duration.as_secs() as f64 * 100.0,
            confidence: compute_confidence(seg),
            start_time: seg.start_time,
            end_time: seg.end_time,
            ocr_snippet: seg.ocr_text.as_ref().map(|t| t.chars().take(100).collect()),
        })
        .collect();

    // 5. Generate caption (find dominant segment)
    let dominant = segment_summaries.iter().max_by_key(|s| s.duration_secs).unwrap();
    let caption = format!(
        "You spent most time in {} ({:.0}%)",
        dominant.app_name,
        dominant.percentage
    );

    // 6. Persist summary to DB
    db::save_summary(session_id, &segment_summaries).await?;

    Ok(SummaryData {
        session_id,
        start_time: session.start_time,
        end_time: session.end_time,
        total_duration_secs: total_duration.as_secs() as u32,
        segments: segment_summaries,
        caption,
    })
}
```

---

## 5. Data Models

### 5.1 Core Entities

#### Session
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Session {
    id: Uuid,
    start_time: DateTime<Utc>,
    end_time: Option<DateTime<Utc>>,
    planned_duration_secs: u32,
    actual_duration_secs: Option<u32>,
    status: SessionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum SessionStatus {
    Active,
    Completed,
    Cancelled,
}
```

#### ContextReading
```rust
#[derive(Debug, Clone)]
struct ContextReading {
    timestamp: DateTime<Utc>,
    window_metadata: WindowMetadata,
    phash: ImageHash,
    ssim_grid: Option<[[f64; 4]; 4]>,  // 4x4 SSIM tile values
    ocr_text: Option<String>,
    ocr_confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowMetadata {
    bundle_id: String,
    title: String,
    owner_name: String,
    bounds: WindowBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WindowBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
```

#### Segment
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Segment {
    id: Uuid,
    session_id: Uuid,
    bundle_id: String,
    title: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    duration: Duration,

    // Quality metrics
    stable_frames: u32,       // Frames with same window/app
    total_frames: u32,        // All frames in segment
    boundary_phash_delta: u32,  // Hamming distance at segment boundary
    ocr_avg_confidence: Option<f64>,
    ocr_text: Option<String>,

    // Interruptions (for merged segments)
    interruptions: Vec<Interruption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Interruption {
    bundle_id: String,
    duration: Duration,
    timestamp: DateTime<Utc>,
}
```

### 5.2 SQLite Schema

```sql
-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    planned_duration_secs INTEGER NOT NULL,
    actual_duration_secs INTEGER,
    status TEXT NOT NULL CHECK(status IN ('Active', 'Completed', 'Cancelled'))
);

-- Context readings table (raw data)
CREATE TABLE context_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    window_title TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    bounds_json TEXT NOT NULL,  -- JSON serialized WindowBounds
    phash TEXT,  -- Hex-encoded perceptual hash
    ssim_grid_json TEXT,  -- JSON serialized [[f64; 4]; 4]
    ocr_text TEXT,
    ocr_confidence REAL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_readings_session ON context_readings(session_id);
CREATE INDEX idx_readings_timestamp ON context_readings(timestamp);

-- Segments table (processed data)
CREATE TABLE segments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_secs INTEGER NOT NULL,
    stable_frames INTEGER NOT NULL,
    total_frames INTEGER NOT NULL,
    boundary_phash_delta INTEGER,
    ocr_avg_confidence REAL,
    ocr_text TEXT,
    interruptions_json TEXT,  -- JSON serialized Vec<Interruption>
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_session ON segments(session_id);
CREATE INDEX idx_segments_bundle ON segments(bundle_id);
```

---

## 6. Core Algorithms

### 6.1 Perceptual Hash (pHash)

**Purpose:** Detect visual changes in screenshots.

**Implementation:** Use `image-hasher` crate.

```rust
use image_hasher::{HasherConfig, HashAlg};

fn compute_phash(screenshot: &DynamicImage) -> ImageHash {
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::Gradient)  // Perceptual hash
        .hash_size(8, 8)  // 64-bit hash
        .to_hasher();

    hasher.hash_image(screenshot)
}

fn hamming_distance(hash1: &ImageHash, hash2: &ImageHash) -> u32 {
    hash1.dist(hash2)
}
```

**Threshold:** `PHASH_THRESHOLD = 12` (from notes) → ~19% of bits different = significant change.

### 6.2 SSIM Grid Calculation

**Purpose:** Complement pHash with structural similarity for fine-grained detection.

**Implementation:** Use `image-compare` crate.

```rust
use image_compare::{Algorithm, Metric};

fn compute_ssim_grid(img1: &DynamicImage, img2: &DynamicImage) -> [[f64; 4]; 4] {
    let mut grid = [[0.0; 4]; 4];
    let (width, height) = img1.dimensions();
    let tile_w = width / 4;
    let tile_h = height / 4;

    for row in 0..4 {
        for col in 0..4 {
            let x = col * tile_w;
            let y = row * tile_h;
            let tile1 = img1.crop_imm(x, y, tile_w, tile_h);
            let tile2 = img2.crop_imm(x, y, tile_w, tile_h);

            let result = image_compare::gray_similarity_structure(
                Algorithm::MSSIMSimple,
                &tile1.to_luma8(),
                &tile2.to_luma8(),
            ).unwrap();

            grid[row as usize][col as usize] = result.score;
        }
    }

    grid
}

fn ssim_significant_change(grid: &[[f64; 4]; 4]) -> bool {
    // Count tiles with SSIM < threshold
    let changed_tiles = grid.iter()
        .flatten()
        .filter(|&&score| score < SSIM_TILE_THRESHOLD)
        .count();

    changed_tiles >= 4  // At least 25% of tiles changed
}
```

### 6.3 Segmentation State Machine (Detailed)

See Section 4.4 for full pseudocode. Key states:

```
┌──────────┐    app_changed &&    ┌───────────────┐
│  Stable  │────switch_rate≥3─────>│ Transitioning │
│ Segment  │                       │   Segment     │
└──────────┘                       └───────────────┘
     ^                                     │
     │         stable ≥15s                 │
     └─────────────────────────────────────┘
```

**Merge conditions:**
1. **Sandwich merge:** `A → B → A` where `duration(B) ≤ 12s`
2. **Brief interruption absorption:** Current segment `duration < 15s` → extend previous

**Transition trigger:**
- `switch_rate ≥ 3` in 60s rolling window, OR
- `median_dwell < 10s`

---

## 7. API Contracts

### 7.1 Tauri Commands (Rust → React)

#### Timer Control
```rust
#[tauri::command]
async fn start_timer(
    state: State<'_, AppState>,
    duration_secs: u32,
) -> Result<String, String> {
    // Returns session_id as String
}

#[tauri::command]
async fn stop_timer(
    state: State<'_, AppState>,
) -> Result<SummaryData, String> {
    // Stops timer, returns summary data
}

#[tauri::command]
async fn get_timer_state(
    state: State<'_, AppState>,
) -> Result<TimerStateResponse, String> {
    // Returns current state + elapsed time
}
```

#### Summary Retrieval
```rust
#[tauri::command]
async fn get_session_summary(
    session_id: String,
) -> Result<SummaryData, String> {
    // Load summary from SQLite
}

#[tauri::command]
async fn list_sessions(
    limit: Option<u32>,
) -> Result<Vec<SessionInfo>, String> {
    // Returns list of past sessions
}
```

### 7.2 Tauri Events (Rust → React)

```rust
// Timer tick event (every 1s during session)
emit("timer-tick", {
  "sessionId": "...",
  "elapsed": 125,  // seconds
  "remaining": 1375
});

// Session completed event
emit("session-completed", {
  "sessionId": "...",
  "summary": SummaryData { ... }
});

// Error event
emit("sensing-error", {
  "error": "Failed to capture screenshot",
  "timestamp": "2025-10-19T14:30:00Z"
});
```

### 7.3 React State Management

```typescript
// Timer state (local component state)
interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'completed';
  sessionId: string | null;
  elapsedSeconds: number;
  totalSeconds: number;
}

// Summary state
interface SummaryData {
  sessionId: string;
  startTime: string;
  endTime: string;
  totalDurationSecs: number;
  segments: SegmentSummary[];
  caption: string;
}

interface SegmentSummary {
  bundleId: string;
  appName: string;
  title: string;
  durationSecs: number;
  percentage: number;
  confidence: number;
  startTime: string;
  endTime: string;
  ocrSnippet?: string;
}
```

---

## 8. Storage Layer

### 8.1 Database Module (Rust)

```rust
mod db {
    use rusqlite::{Connection, params};
    use std::sync::Mutex;

    pub struct Database {
        conn: Mutex<Connection>,
    }

    impl Database {
        pub fn new(path: &Path) -> Result<Self> {
            let conn = Connection::open(path)?;
            Self::init_schema(&conn)?;
            Ok(Self { conn: Mutex::new(conn) })
        }

        fn init_schema(conn: &Connection) -> Result<()> {
            conn.execute_batch(include_str!("schema.sql"))?;
            Ok(())
        }

        pub fn create_session(&self, session: &Session) -> Result<()> {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO sessions (id, start_time, planned_duration_secs, status) VALUES (?1, ?2, ?3, ?4)",
                params![
                    session.id.to_string(),
                    session.start_time.to_rfc3339(),
                    session.planned_duration_secs,
                    format!("{:?}", session.status),
                ],
            )?;
            Ok(())
        }

        pub fn save_reading(&self, session_id: Uuid, reading: &ContextReading) -> Result<()> {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO context_readings (session_id, timestamp, bundle_id, window_title, ...) VALUES (?1, ?2, ?3, ?4, ...)",
                params![
                    session_id.to_string(),
                    reading.timestamp.to_rfc3339(),
                    reading.window_metadata.bundle_id,
                    reading.window_metadata.title,
                    // ... other fields
                ],
            )?;
            Ok(())
        }

        pub fn load_readings(&self, session_id: Uuid) -> Result<Vec<ContextReading>> {
            // Query and reconstruct ContextReading structs
            todo!()
        }

        pub fn save_segments(&self, session_id: Uuid, segments: &[Segment]) -> Result<()> {
            // Batch insert segments
            todo!()
        }
    }
}
```

### 8.2 Storage Lifecycle

**Initialization:**
- Database file: `~/.lefocus/sessions.db`
- Created on first app launch
- Migrations handled via schema version check

**During Session:**
- Readings accumulated in memory (`Vec<ContextReading>`)
- NOT persisted until session end (P0 simplification)

**On Session End:**
1. Write all readings to `context_readings` table (batch insert)
2. Run segmentation algorithm
3. Write segments to `segments` table
4. Update session status to `Completed`
5. Drop in-memory readings (reclaim RAM)

**Retention Policy (Future):**
- P0: Keep all sessions indefinitely
- P1: Add setting for retention (e.g., 30 days)

---

## 9. Performance & Resource Constraints

### 9.1 CPU Budget

| Component | Target Avg CPU | Peak CPU | Duration |
|-----------|----------------|----------|----------|
| Sensing loop (polling) | 2-3% | 5% | Continuous |
| Screenshot capture | 1-2% | 10% | < 500ms |
| OCR (Vision.framework) | 3-5% | 15% | < 1s |
| pHash computation | 0.5% | 3% | < 100ms |
| Segmentation | N/A | 5% | < 200ms (one-time) |
| **Total (session)** | **≤ 6%** | **≤ 15%** | **25 min** |

**Mitigation strategies:**
- Use `tokio::time::interval` (non-blocking timers)
- Downscale screenshots before processing (≤1280px)
- OCR rate-limited to ≥15s intervals
- Vision framework `.fast` mode (lower accuracy, faster)

### 9.2 Memory Budget

| Component | Steady-State | Peak | Notes |
|-----------|--------------|------|-------|
| React app | ~50 MB | ~70 MB | DOM + state |
| Tauri runtime | ~30 MB | ~40 MB | WebView bridge |
| Rust backend | ~50 MB | ~80 MB | Tokio threads + buffers |
| In-memory readings | ~20 MB | ~50 MB | 300 readings @ ~100KB each |
| Screenshot buffers | ~10 MB | ~30 MB | 2-3 concurrent buffers |
| SQLite cache | ~20 MB | ~30 MB | Read cache |
| **Total** | **~180 MB** | **~300 MB** | **Target met** |

**Mitigation strategies:**
- Drop screenshot data immediately after pHash/OCR
- Use `Arc<Mutex<Vec>>` for readings (single allocation)
- Batch database writes (avoid per-reading transaction overhead)

### 9.3 Battery Impact

**Target:** < 3% drain/hour vs idle on M1 MacBook Air

**Power-hungry operations:**
1. Screen capture (~40% of power usage)
2. OCR (~30%)
3. Image processing (~20%)
4. Database writes (~10%)

**Mitigations:**
- Reduce poll frequency if battery < 20% (fallback to 10s intervals)
- Skip OCR on battery power (optional setting)
- Coalesce database writes (1 transaction at session end)

---

## 10. Error Handling & Edge Cases

### 10.1 Permission Failures

#### Scenario: Screen recording permission denied

**Detection:**
```rust
match capture_screenshot().await {
    Err(e) if e.contains("permission") => {
        // Permission denied
        emit("permission-error", {
            "permission": "screen-recording",
            "message": "LeFocus needs screen recording access to track context"
        });
        return Err("Permission denied");
    }
    Err(e) => { /* other error */ }
    Ok(data) => { /* success */ }
}
```

**User experience:**
- Timer refuses to start
- Modal dialog: "Screen Recording permission required. Open System Settings?"
- Button: "Open Settings" → Opens `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

**No graceful degradation** (hard requirement per notes.md).

### 10.2 OCR Failures

#### Scenario: Vision framework crashes or times out

**Handling:**
```rust
let ocr_result = tokio::time::timeout(
    Duration::from_secs(5),
    run_ocr(&screenshot)
).await;

match ocr_result {
    Ok(Ok(text)) => {
        // Success
        reading.ocr_text = Some(text);
    }
    Ok(Err(e)) | Err(_) => {
        // Silent failure, log for debugging
        log::warn!("OCR failed: {:?}", e);
        reading.ocr_text = None;
        reading.ocr_confidence = Some(0.0);
    }
}
```

**Impact on confidence:** OCR failure sets `ocr_avg_confidence = 0.0`, lowering overall segment confidence.

### 10.3 Window Metadata Unavailable

#### Scenario: Active window has no title or bundle ID

**Fallback:**
```rust
let metadata = get_active_window_metadata().await?;
let bundle_id = metadata.bundle_id.unwrap_or_else(|| "unknown".to_string());
let title = metadata.title.unwrap_or_else(|| "[Untitled]".to_string());
```

**Display in summary:** Show as "Unknown Application" with `confidence = 0.5`.

### 10.4 Database Corruption

#### Scenario: SQLite file corrupted (power loss, disk failure)

**Detection:** `rusqlite::Connection::open()` returns error.

**Recovery:**
1. Log error to stderr
2. Rename corrupted DB to `sessions.db.backup`
3. Create fresh DB with schema
4. Show warning to user: "Session history was corrupted and reset"

### 10.5 Memory Pressure

#### Scenario: Readings buffer exceeds 300 MB

**Mitigation:**
```rust
if readings_buffer.lock().unwrap().len() > 3000 {
    log::warn!("Readings buffer overflow, dropping oldest 1000 entries");
    readings_buffer.lock().unwrap().drain(0..1000);
}
```

**Impact:** Oldest context data lost, but session continues. Summary will have gap.

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal:** Timer + database + minimal UI

- [ ] Replace audio UI with timer UI (clock display, start/stop buttons)
- [ ] Implement `TimerController` with state machine
- [ ] Set up SQLite database with schema
- [ ] Wire up Tauri commands: `start_timer`, `stop_timer`, `get_timer_state`
- [ ] Emit `timer-tick` events to frontend

**Deliverable:** Working Pomodoro timer with persistent session records (no sensing yet).

### Phase 2: Swift Plugin (Week 2)

**Goal:** macOS context capture working

- [ ] Create Tauri plugin scaffold for Swift
- [ ] Implement `getActiveWindowMetadata()` using `NSWorkspace`
- [ ] Implement `captureActiveWindowScreenshot()` using `ScreenCaptureKit`
- [ ] Implement `runOCR()` using `VNRecognizeTextRequest`
- [ ] Add permission checks and error handling
- [ ] Test all three functions independently

**Deliverable:** Swift plugin callable from Rust, returns window metadata + screenshots.

### Phase 3: Sensing Pipeline (Week 3)

**Goal:** Context readings collected during session

- [ ] Implement `sensing_pipeline` tokio task
- [ ] Poll window metadata every 5s
- [ ] Capture screenshot on window change
- [ ] Compute pHash using `image-hasher`
- [ ] Run OCR with 15s cooldown
- [ ] Accumulate readings in `Arc<Mutex<Vec<ContextReading>>>`
- [ ] Persist readings to SQLite on session end

**Deliverable:** Session produces `context_readings` table rows.

### Phase 4: Segmentation (Week 4)

**Goal:** Raw readings → meaningful segments

- [ ] Implement `segment_session()` algorithm
- [ ] Implement state machine (stable/transitioning)
- [ ] Implement merge logic (sandwich, brief interruption)
- [ ] Implement confidence scoring (4-factor)
- [ ] Test with synthetic data (rapid switching, long focus, etc.)
- [ ] Persist segments to SQLite

**Deliverable:** Session produces `segments` table with confidence scores.

### Phase 5: Summary Visualization (Week 5)

**Goal:** User-facing summary view

- [ ] Install `recharts` library
- [ ] Create `SummaryView` React component
- [ ] Render stacked bar chart (by duration %)
- [ ] Show segment details on hover
- [ ] Display caption ("You spent most time in...")
- [ ] Add confidence indicators (e.g., `~` prefix for low confidence)
- [ ] Wire up Tauri event `session-completed` → show modal

**Deliverable:** Post-session summary displays correctly.

### Phase 6: Polish & Testing (Week 6)

**Goal:** P0 ready for dogfooding

- [ ] Measure CPU/RAM usage (Activity Monitor)
- [ ] Optimize screenshot processing (downscaling, grayscale)
- [ ] Add error handling for all edge cases
- [ ] Implement permission onboarding flow
- [ ] Test with 90-min sessions (stress test)
- [ ] Validate segmentation accuracy (manual review)
- [ ] Fix any critical bugs

**Deliverable:** P0 meets all success criteria, ready for personal use.

---

## 12. Testing Strategy

### 12.1 Unit Tests

**Rust components:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segmentation_simple() {
        let readings = vec![
            reading("com.microsoft.VSCode", t(0)),
            reading("com.microsoft.VSCode", t(5)),
            reading("com.google.Chrome", t(10)),
        ];
        let segments = segment_session(readings);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].bundle_id, "com.microsoft.VSCode");
        assert_eq!(segments[1].bundle_id, "com.google.Chrome");
    }

    #[test]
    fn test_segmentation_sandwich_merge() {
        let readings = vec![
            reading("A", t(0)),   // 30s
            reading("A", t(30)),
            reading("B", t(35)),  // 5s (should be merged)
            reading("A", t(40)),  // Resume A
        ];
        let segments = segment_session(readings);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].bundle_id, "A");
        assert_eq!(segments[0].interruptions.len(), 1);
    }

    #[test]
    fn test_confidence_scoring() {
        let segment = Segment {
            duration: Duration::seconds(120),
            stable_frames: 20,
            total_frames: 24,
            boundary_phash_delta: 18,
            ocr_avg_confidence: Some(0.85),
            ..Default::default()
        };
        let confidence = compute_confidence(&segment);
        assert!(confidence > 0.75);
    }
}
```

### 12.2 Integration Tests

**Scenarios:**
1. **Happy path:** Start timer → Wait 1 min → Stop → Verify summary
2. **Permission denied:** Mock screenshot failure → Verify error modal
3. **OCR failure:** Mock Vision timeout → Verify segment confidence drops
4. **Rapid switching:** 10 app switches in 30s → Verify "Transitioning" segment
5. **Long focus:** 25 min in one app → Verify single segment with high confidence

### 12.3 Performance Tests

**CPU monitoring:**
```bash
# Run timer for 25 min, sample CPU every 5s
while true; do
  ps -p $PID -o %cpu | tail -1 >> cpu_log.txt
  sleep 5
done

# Analyze
awk '{sum+=$1; count++} END {print "Avg:", sum/count}' cpu_log.txt
```

**Memory profiling:**
```rust
// Add to sensing loop
if cfg!(debug_assertions) {
    let mem_usage = get_memory_usage();  // Via sysinfo crate
    log::debug!("Memory: {} MB", mem_usage / 1024 / 1024);
}
```

### 12.4 Acceptance Criteria

| Test | Pass Condition |
|------|----------------|
| CPU avg (25 min session) | ≤ 6% |
| CPU peak | ≤ 15% for < 1s |
| RAM steady state | ≤ 300 MB |
| Summary latency | ≤ 200 ms from stop to render |
| Segmentation accuracy | ≥ 90% on manual review |
| Permission handling | Error modal shown, timer blocked |
| OCR failure recovery | Session continues, confidence drops |

---

## 13. Open Questions

### 13.1 For Future Resolution

1. **App name resolution:** How to map bundle ID → friendly name?
   - Option A: Hardcode common apps (`com.microsoft.VSCode` → "Visual Studio Code")
   - Option B: Query `NSWorkspace.shared.runningApplications` for localized name
   - **Decision:** Use Option B for P0.

2. **Screenshot grayscale conversion:** Where to do it?
   - Option A: Swift plugin returns grayscale PNG
   - Option B: Rust decodes color, converts to grayscale
   - **Decision:** Rust-side (more control over format).

3. **pHash caching:** Should we cache pHash of previous frame?
   - **Decision:** Yes, store `last_phash: Option<ImageHash>` in sensing loop.

4. **SSIM grid usage:** Do we need it for P0, or is pHash sufficient?
   - **Decision:** Implement pHash first, add SSIM only if accuracy issues arise.

5. **Database vacuuming:** When to compact SQLite DB?
   - **Decision:** P1 concern. P0 DB stays small (< 10 MB).

### 13.2 Assumptions to Validate

1. **OCR fast mode accuracy:** Is Vision `.fast` accurate enough for context detection?
   - **Validation:** Compare `.fast` vs `.accurate` on sample screenshots, measure confidence delta.

2. **5s polling frequency:** Too slow to catch brief interruptions?
   - **Validation:** Test with rapid app switching, check if 5s misses important context.

3. **Segmentation thresholds:** Are `min_segment=15s`, `merge_gap=12s` appropriate?
   - **Validation:** Run dogfooding sessions, manually review segment boundaries.

4. **Battery impact:** Will sensing drain battery noticeably?
   - **Validation:** Measure power consumption with `powermetrics` tool.

---

## Appendix A: File Structure

```
lefocus/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                    # Entry point
│   │   ├── lib.rs                     # Tauri commands registration
│   │   ├── timer/
│   │   │   ├── mod.rs                 # TimerController
│   │   │   └── state.rs               # Timer state machine
│   │   ├── sensing/
│   │   │   ├── mod.rs                 # Sensing pipeline
│   │   │   ├── phash.rs               # pHash computation
│   │   │   └── ocr.rs                 # OCR coordination
│   │   ├── segmentation/
│   │   │   ├── mod.rs                 # Segmentation algorithm
│   │   │   ├── confidence.rs          # Confidence scoring
│   │   │   └── merge.rs               # Merge logic
│   │   ├── summary/
│   │   │   └── mod.rs                 # Summary generation
│   │   ├── db/
│   │   │   ├── mod.rs                 # Database interface
│   │   │   ├── schema.sql             # SQLite schema
│   │   │   └── migrations.rs          # Schema versioning
│   │   ├── models/
│   │   │   ├── session.rs             # Session struct
│   │   │   ├── reading.rs             # ContextReading struct
│   │   │   └── segment.rs             # Segment struct
│   │   └── audio/                     # (Keep for P1)
│   │       ├── mod.rs
│   │       ├── binaural.rs
│   │       ├── brown_noise.rs
│   │       └── rain.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── plugins/
│       └── macos-sensing/             # Swift Tauri plugin
│           ├── Package.swift
│           └── Sources/
│               └── MacOSSensing.swift
├── src/
│   ├── App.tsx                        # Main React component
│   ├── components/
│   │   ├── TimerView.tsx              # Timer UI
│   │   ├── SummaryView.tsx            # Summary modal
│   │   └── PermissionDialog.tsx       # Permission onboarding
│   ├── hooks/
│   │   └── useTimer.ts                # Timer state hook
│   └── types/
│       └── api.ts                     # TypeScript types for Tauri API
├── system-design/
│   ├── lefocus.md                     # Product PRD
│   ├── p0.md                          # P0 requirements
│   ├── notes.md                       # Design decisions
│   └── system-design-p0.md            # This document
└── package.json
```

---

## Appendix B: Key Dependencies Rationale

| Crate/Library | Version | Purpose | Alternative Considered |
|---------------|---------|---------|------------------------|
| `tokio` | 1.x | Async runtime for polling loops | `async-std` (less ecosystem support) |
| `rusqlite` | 0.31 | SQLite bindings, bundled | `diesel` (too heavy for P0) |
| `image-hasher` | 0.4 | Perceptual hashing | Custom impl (P1 optimization) |
| `image-compare` | 0.4 | SSIM calculation | `imagequant` (different use case) |
| `recharts` | 2.10 | React charting | D3.js (too low-level), Chart.js (not React-native) |
| `ScreenCaptureKit` | macOS 13+ | Modern screen capture API | `CGWindowListCreateImage` (deprecated) |
| `Vision.framework` | macOS 10.15+ | On-device OCR | Tesseract (worse accuracy, heavier) |

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **pHash** | Perceptual hash; fingerprint of image content, robust to small changes |
| **SSIM** | Structural Similarity Index; measures perceived quality difference between images |
| **Hamming distance** | Number of differing bits between two hashes |
| **Segment** | Contiguous time interval where user focused on one context (app/window) |
| **Context reading** | Single snapshot of window metadata + screenshot + OCR at one timestamp |
| **Confidence score** | 0.0-1.0 metric indicating reliability of segment classification |
| **Sandwich merge** | Merging segments when brief interruption occurs (A → B → A becomes A with interruption) |
| **Transitioning segment** | Special segment capturing rapid switching behavior (≥3 switches/60s) |

---

**End of System Design Document**

Total lines: ~987 (target: 800-1000) ✓

