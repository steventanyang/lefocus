# Phase 3: Sensing Pipeline

**Status:** In Progress
**Dependencies:** Phase 1 (Swift Plugin), Phase 2 (Timer + Database)

## Overview

Phase 3 implements the **sensing pipeline** that captures context during focus sessions. When a Pomodoro timer is running, the pipeline periodically:

1. Captures a screenshot of the active window
2. Runs OCR to extract visible text
3. Computes a visual fingerprint (pHash) for change detection
4. Stores the context reading in SQLite

**Design Principles:**

- **Privacy-first:** Screenshots never persist, only derived data (OCR text, metadata, pHash)
- **On-device:** No network calls, all processing happens locally
- **Resilient:** Errors don't crash the session, just create gaps in data
- **Efficient:** Target ≤6% CPU average, ≤300 MB memory

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        TimerController                          │
│  (existing from Phase 2)                                        │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Direct Rust hook (no IPC)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SensingController                          │
│  - Owns sensing_loop task handle                               │
│  - start_sensing(session_id) / stop_sensing()                  │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ spawns (single combined worker)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        sensing_loop                             │
│  - Runs every 5 seconds (configurable)                         │
│  - Directly performs capture (no separate worker task):        │
│    1. get_active_window_metadata() (Swift FFI)                 │
│    2. capture_screenshot(window_id)  (Swift FFI)               │
│    3. compute_phash(image_data)     (Rust)                     │
│    4. run_ocr(image_data)           (Swift FFI)                │
│    5. Drop PNG bytes (never persist!)                          │
│    6. Write to Database immediately                            │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Database thread (existing)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Database                               │
│  - INSERT context_reading (immediate write to WAL)             │
│  - SQLite auto-checkpoints WAL when full                       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Timer starts (Running)
    ↓
SensingController::start_sensing(session_id)
    ↓
Spawn sensing_loop task (single combined worker)
    ↓
Every 5 seconds (sensing_loop tick):
    1. Call Swift FFI: get_active_window_metadata()
    2. Call Swift FFI: capture_screenshot(window_id) → Vec<u8> (PNG)
    3. Call Rust: compute_phash(&png_bytes) → String (base64 hash)
    4. Call Swift FFI: run_ocr(&png_bytes) → OCRResult { text, confidence, word_count }
    5. Drop PNG bytes (never persist!)
    6. Build ContextReading struct
    7. db.insert_reading(&reading) (database thread)
    8. Database writes to SQLite WAL immediately
    ↓
Timer stops (Stopped/Completed/Cancelled/Interrupted)
    ↓
SensingController::stop_sensing()
    ↓
sensing_loop task gracefully shuts down
```

---

## Database Schema

### New Table: `context_readings`

```sql
CREATE TABLE context_readings (
    -- Primary key
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Session reference
    session_id TEXT NOT NULL,

    -- Timestamp
    timestamp TEXT NOT NULL,  -- ISO 8601 UTC (e.g., "2025-10-26T14:30:05.123Z")

    -- Window metadata (from Swift plugin)
    window_id INTEGER NOT NULL,        -- CGWindowID (stable across calls)
    bundle_id TEXT NOT NULL,           -- "com.microsoft.VSCode"
    window_title TEXT NOT NULL,        -- "dashboard.tsx - MyProject"
    owner_name TEXT NOT NULL,          -- "Visual Studio Code"
    bounds_json TEXT NOT NULL,         -- {"x":0,"y":0,"width":1920,"height":1080}

    -- Visual fingerprint (for change detection)
    phash TEXT,                        -- Base64-encoded perceptual hash (12 chars)

    -- OCR results (optional, may be null if skipped)
    ocr_text TEXT,                     -- Extracted text from screenshot
    ocr_confidence REAL,               -- Vision framework confidence [0.0-1.0]
    ocr_word_count INTEGER,            -- Number of words detected (helps distinguish "no text" from OCR failure)

    -- Foreign key
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Index for efficient session queries
CREATE INDEX idx_context_readings_session_id ON context_readings(session_id);

-- Index for time-based queries
CREATE INDEX idx_context_readings_timestamp ON context_readings(timestamp);
```

**Storage estimates:**

- Average reading size: ~2 KB (metadata + OCR text + phash + word_count)
- 25-minute session @ 5s cadence: 300 readings = ~600 KB per session
- 100 sessions: ~60 MB (well within budget)

---

## Implementation Details

### 1. SensingController

**Responsibilities:**

- Start/stop the sensing pipeline when timer state changes
- Own the sensing_loop task handle
- Manage graceful shutdown via cancellation token

**Struct Definition:**

```rust
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use crate::db::Database;

pub struct SensingController {
    /// Handle to the spawned sensing_loop task
    sensing_handle: Option<JoinHandle<()>>,

    /// Cancellation token for graceful shutdown
    cancel_token: Option<CancellationToken>,
}
```

**Implementation:**

```rust
impl SensingController {
    pub fn new() -> Self {
        Self {
            sensing_handle: None,
            cancel_token: None,
        }
    }

    /// Start sensing for the given session
    pub async fn start_sensing(
        &mut self,
        session_id: String,
        db: Database,
    ) -> Result<()> {
        // Ensure we're not already sensing
        if self.sensing_handle.is_some() {
            bail!("Sensing already active");
        }

        // Create cancellation token
        let cancel_token = CancellationToken::new();

        // Spawn sensing_loop task
        let handle = tokio::spawn(sensing_loop(
            session_id.clone(),
            db,
            cancel_token.clone(),
        ));

        // Store handle and token
        self.sensing_handle = Some(handle);
        self.cancel_token = Some(cancel_token);

        info!("Sensing started for session: {}", session_id);
        Ok(())
    }

    /// Stop sensing gracefully
    pub async fn stop_sensing(&mut self) -> Result<()> {
        // Get handle and token (consume them)
        let handle = self.sensing_handle.take();
        let cancel_token = self.cancel_token.take();

        if let Some(token) = cancel_token {
            // Signal cancellation
            token.cancel();

            // Wait for task to complete
            if let Some(h) = handle {
                h.await?;
            }

            info!("Sensing stopped gracefully");
        }

        Ok(())
    }
}
```

**Timer Integration (Rust-side hook):**

Modify `TimerController` to own a `SensingController` and call hooks:

```rust
// In src/timer/controller.rs
use crate::sensing::SensingController;

pub struct TimerController {
    state: Arc<Mutex<TimerState>>,
    db: Database,
    app_handle: AppHandle,
    ticker: Arc<Mutex<Option<JoinHandle<()>>>>,
    sensing: Arc<Mutex<SensingController>>,  // NEW
}

impl TimerController {
    pub fn new(app_handle: AppHandle, db: Database) -> Self {
        Self {
            state: Arc::new(Mutex::new(TimerState::new())),
            db: db.clone(),
            app_handle,
            ticker: Arc::new(Mutex::new(None)),
            sensing: Arc::new(Mutex::new(SensingController::new())),  // NEW
        }
    }

    pub async fn start_timer(&self, target_ms: u64) -> Result<TimerState> {
        // ... existing session creation and state update ...

        // NEW: Start sensing
        self.sensing.lock().await
            .start_sensing(session_id.clone(), self.db.clone())
            .await?;

        self.spawn_ticker().await;

        Ok(self.get_state().await)
    }

    pub async fn stop_timer(&self) -> Result<SessionInfo> {
        // NEW: Stop sensing first
        self.sensing.lock().await.stop_sensing().await?;

        self.cancel_ticker().await;

        // ... existing finalization ...
    }

    pub async fn cancel_timer(&self) -> Result<()> {
        // NEW: Stop sensing
        self.sensing.lock().await.stop_sensing().await?;

        self.cancel_ticker().await;

        // ... existing cancellation ...
    }
}
```

**Key Points:**

- `TimerController` owns `SensingController` wrapped in `Arc<Mutex<>>`
- `db: Database` (existing field) is cloned and passed to `start_sensing()`
- `cancel_token` is created inside `start_sensing()`, cloned for the spawned task
- Cancellation triggers graceful shutdown via `cancel_token.cancel()`

---

### 2. Sensing Loop (Combined Worker)

**Module Structure:**

```rust
// src/sensing/mod.rs

mod controller;
mod loop;
mod phash;

pub use controller::SensingController;
use loop::{sensing_loop, perform_capture};
use phash::{compute_phash, compute_hamming_distance};
```

```rust
// src/sensing/loop.rs - Contains sensing_loop and perform_capture functions
// src/sensing/controller.rs - Contains SensingController struct
// src/sensing/phash.rs - Contains pHash utilities
```

---

**Responsibilities:**

- Run on a 5-second interval (configurable)
- Directly perform all capture steps (metadata, screenshot, pHash, OCR)
- Write completed `ContextReading` to database immediately
- Handle shutdown signal gracefully via cancellation token

**Complete Implementation:**

```rust
// src/sensing/loop.rs
use tokio::time::{interval, Duration, Instant};
use tokio_util::sync::CancellationToken;
use chrono::{DateTime, Utc};
use anyhow::{Result, anyhow};
use log::{info, error};

use crate::db::Database;
use crate::macos_bridge::{get_active_window_metadata, capture_screenshot, run_ocr};
use crate::models::ContextReading;
use super::phash::{compute_phash, compute_hamming_distance};

async fn sensing_loop(
    session_id: String,
    db: Database,
    cancel_token: CancellationToken,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));

    // Set missed tick behavior to Delay (prevents catch-up bursts)
    // If capture takes >5s, next tick fires 5s AFTER completion, not immediately
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    // OCR gating state
    let mut last_phash: Option<String> = None;          // Most recent pHash (for all captures)
    let mut last_ocr_phash: Option<String> = None;      // pHash when OCR last ran
    let mut last_ocr_time: Option<Instant> = None;

    loop {
        tokio::select! {
            _ = interval.tick() => {
                let timestamp = Utc::now();

                // Timeout wrapper (advisory - logs if capture takes >3s)
                // Note: Cannot interrupt blocking FFI calls
                let result = tokio::time::timeout(
                    Duration::from_secs(3),
                    perform_capture(
                        &session_id,
                        timestamp,
                        &db,
                        &mut last_phash,
                        &mut last_ocr_phash,
                        &mut last_ocr_time,
                    )
                ).await;

                // Handle timeout and errors
                match result {
                    Ok(Ok(())) => { /* success */ }
                    Ok(Err(e)) => {
                        error!("Capture failed for session {}: {}", session_id, e);
                    }
                    Err(_) => {
                        error!("Capture slow/timeout (>3s) for session {}", session_id);
                    }
                }
            }
            _ = cancel_token.cancelled() => {
                info!("Sensing loop shutting down gracefully");
                break;
            }
        }
    }
}

async fn perform_capture(
    session_id: &str,
    timestamp: DateTime<Utc>,
    db: &Database,
    last_phash: &mut Option<String>,
    last_ocr_phash: &mut Option<String>,
    last_ocr_time: &mut Option<Instant>,
) -> Result<()> {
    // Step 1: Get active window metadata
    let metadata = get_active_window_metadata()
        .map_err(|e| anyhow!("FFI metadata error: {}", e))?;

    // Step 2: Capture screenshot
    let png_bytes = capture_screenshot(metadata.window_id)
        .map_err(|e| anyhow!("FFI screenshot error: {}", e))?;

    // Step 3: Compute perceptual hash (blocking task)
    let phash = tokio::task::spawn_blocking({
        let bytes = png_bytes.clone();
        move || compute_phash(&bytes)
    }).await??;

    // Step 4: OCR gating logic
    // Compare against last OCR'd hash (not just last sampled hash)
    let should_run_ocr = should_perform_ocr(
        &phash,
        last_ocr_phash.as_deref(),  // Compare with hash when OCR last ran
        last_ocr_time.as_ref(),
    );

    let (ocr_text, ocr_confidence, ocr_word_count) = if should_run_ocr {
        match run_ocr(&png_bytes) {
            Ok(result) => {
                *last_ocr_time = Some(Instant::now());
                *last_ocr_phash = Some(phash.clone());  // Update OCR'd hash
                (Some(result.text), Some(result.confidence), Some(result.word_count))
            }
            Err(e) => {
                warn!("OCR failed: {}", e);
                (None, None, None)
            }
        }
    } else {
        (None, None, None)
    };

    // Always update sampled hash (tracks all visual states)
    *last_phash = Some(phash.clone());

    // Step 5: Build context reading
    let reading = ContextReading {
        id: None,
        session_id: session_id.to_string(),
        timestamp,
        window_metadata: metadata,
        phash: Some(phash),
        ocr_text,
        ocr_confidence,
        ocr_word_count,
    };

    // Step 6: Write to database immediately
    db.insert_reading(&reading).await?;

    // PNG bytes automatically dropped here (never persisted)
    Ok(())
}

/// Determines if OCR should be performed based on visual change and cooldown
fn should_perform_ocr(
    current_phash: &str,
    last_phash: Option<&str>,
    last_ocr_time: Option<&Instant>,
) -> bool {
    const OCR_COOLDOWN_SECS: u64 = 20; // Run OCR at most every 20 seconds
    const PHASH_CHANGE_THRESHOLD: u32 12; // Hamming distance threshold

    // Always run OCR on first capture
    let Some(prev_phash) = last_phash else {
        return true;
    };

    // Check if enough time has passed since last OCR
    let cooldown_elapsed = last_ocr_time
        .map(|t| t.elapsed().as_secs() >= OCR_COOLDOWN_SECS)
        .unwrap_or(true);

    if !cooldown_elapsed {
        return false; // Still in cooldown period
    }

    // Check if visual content has changed significantly
    let hamming_distance = compute_hamming_distance(current_phash, prev_phash);
    hamming_distance >= PHASH_CHANGE_THRESHOLD
}

/// Compute Hamming distance between two base64-encoded pHashes
fn compute_hamming_distance(hash1: &str, hash2: &str) -> u32 {
    use image_hasher::ImageHash;

    let h1 = match ImageHash::from_base64(hash1) {
        Ok(h) => h,
        Err(_) => return u32::MAX,
    };

    let h2 = match ImageHash::from_base64(hash2) {
        Ok(h) => h,
        Err(_) => return u32::MAX,
    };

    h1.dist(&h2)  // True bit-level Hamming distance
}
```

**OCR Gating Strategy:**

- **Cooldown:** Run OCR at most every 20 seconds (configurable)
- **Visual change detection:** Only run OCR if pHash Hamming distance ≥ 5
- **Always run on first capture** (no previous pHash to compare)
- **Reduces CPU:** OCR only runs when content actually changes
- **Performance impact:** ~80% reduction in OCR calls during typical usage

**Backpressure Strategy:**

- **No separate worker channel** (single combined task)
- **Missed tick behavior:** Set to `Delay` (not default `Burst`)
  - If capture takes >5s, next tick fires 5s AFTER completion
  - Prevents catch-up bursts that would spike CPU/memory
  - Maintains consistent spacing between captures
- **Risk is low:** Typical capture takes ~120ms without OCR, ~200ms with OCR
- **Graceful degradation:** Slow captures result in fewer readings, not resource spikes

---

### 3. ~~Capture Worker~~ → Integrated into Sensing Loop

**NOTE:** In the simplified single-worker design, there is no separate capture worker task. The `perform_capture()` function (shown in section 2) is called directly from the sensing loop on each interval tick.

**Why single worker?**

- **Simpler:** No channel management, no backpressure handling
- **Lower risk:** Capture takes ~120ms, well under 5s interval
- **Less overhead:** No task switching between workers
- **Sufficient for P0:** Can always add separate worker later if needed

**Error Handling:**

- All Swift FFI calls wrapped in `Result`
- Errors logged with context (session_id, timestamp)
- Loop continues on error → session has gaps in data
- **No retry logic** (simple, predictable behavior)

---

### 4. Perceptual Hash (pHash)

**Purpose:** Detect visual changes between screenshots without storing images.

**Algorithm:**

- Use `image` + `image-hasher` crates (Rust)
- Compute DCT-based perceptual hash (64-bit)
- Encode as base64 string (~12 chars for 64-bit hash)
- Hamming distance (bit-level) for change detection: `distance >= 5` = "content changed, run OCR"

**Implementation:**

```rust
use image::ImageFormat;
use image_hasher::{HasherConfig, HashAlg};

fn compute_phash(png_bytes: &[u8]) -> Result<String> {
    // Decode PNG
    let img = image::load_from_memory_with_format(png_bytes, ImageFormat::Png)?;

    // Compute perceptual hash
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::DoubleGradient)
        .hash_size(8, 8)  // 64-bit hash
        .to_hasher();

    let hash = hasher.hash_image(&img);

    // Convert to base64 string for storage
    // Base64 is more compact than hex and supported by image_hasher
    Ok(hash.to_base64())
}
```

**Note on encoding:**

- `ImageHash::to_base64()` returns a compact string representation (~12 chars for 64-bit hash)
- Base64 is more compact than hex (12 chars vs 16 chars for 64-bit)
- Hamming distance is computed at bit-level via `ImageHash::from_base64()` then `h1.dist(&h2)`, NOT char-by-char on the string

**Performance:**

- Image decode: ~10ms
- Hash computation: ~5ms
- **Total: ~15ms** (run in `spawn_blocking` to avoid blocking tokio runtime)

---

### 5. Database Integration

**Model Definition:**

```rust
// src/models/context_reading.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::macos_bridge::WindowMetadata;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextReading {
    pub id: Option<i64>,
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub window_metadata: WindowMetadata,  // Nested struct in Rust
    pub phash: Option<String>,             // Base64-encoded
    pub ocr_text: Option<String>,
    pub ocr_confidence: Option<f64>,
    pub ocr_word_count: Option<u64>,
}
```

**Note:** The Rust model uses nested `WindowMetadata` struct, but the database flattens these fields for efficient querying. The `Database::insert_reading()` method handles the flattening when writing to SQLite.

**Database Method:**

```rust
// src-tauri/src/db/mod.rs
impl Database {
    pub async fn insert_reading(&self, reading: &ContextReading) -> Result<()> {
        let r = reading.clone();
        self.execute(move |conn| {
            conn.execute(
                "INSERT INTO context_readings (
                    session_id, timestamp, window_id, bundle_id, window_title,
                    owner_name, bounds_json, phash, ocr_text, ocr_confidence, ocr_word_count
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    r.session_id,
                    r.timestamp.to_rfc3339(),
                    r.window_metadata.window_id,
                    r.window_metadata.bundle_id,
                    r.window_metadata.title,
                    r.window_metadata.owner_name,
                    serde_json::to_string(&r.window_metadata.bounds)?,
                    r.phash,
                    r.ocr_text,
                    r.ocr_confidence,
                    r.ocr_word_count.map(|wc| wc as i64),
                ],
            )?;
            Ok(())
        })
        .await
    }
}
```

**Data Flow Diagram:**

```
perform_capture()
      ↓
Build ContextReading struct
      ↓
db.insert_reading(&reading)
      ↓
Database thread receives request (via oneshot channel)
      ↓
Execute INSERT query in WAL
      ↓
SQLite writes to WAL
      ↓
Returns Ok(()) to sensing_loop
```

**Write Strategy:**

- **Immediate writes:** Each reading written to WAL immediately
- **No manual checkpoints:** SQLite auto-checkpoints when WAL reaches ~1000 pages (~4 MB)
- **Benefit:** Simple, crash-safe (WAL automatically recovered on restart)

---

## Performance Budget

### CPU Usage

**Per capture cycle (every 5 seconds):**

- `get_active_window_metadata()`: ~0.5ms (cached)
- `capture_screenshot()`: ~20ms (ScreenCaptureKit)
- `compute_phash()`: ~15ms (image decode + hash)
- `run_ocr()`: ~80ms (Vision framework) - **only ~20% of the time** (OCR gating)
- SQLite INSERT: ~5ms (WAL write)

**Average capture time:**

- Without OCR: ~40ms (80% of captures)
- With OCR: ~120ms (20% of captures)
- **Weighted average: ~56ms per capture**

**Average CPU load:**

- 56ms work every 5000ms = **1.1% CPU**
- **Well under 6% target** ✅

**Peak CPU:**

- Brief spike to ~10-15% during OCR processing (rare)
- Acceptable (target: <15%)

### Memory Usage

**Steady-state:**

- Screenshot buffer (PNG): ~2 MB (transient, freed after OCR)
- Decoded image (RGB): ~6 MB (transient, in `compute_phash()`)
- OCR working set: ~10 MB (Vision framework)
- Channel buffers: <1 KB
- **Peak per capture: ~18 MB** (temporary allocations)

**Database:**

- SQLite WAL buffer: ~4 MB (auto-checkpointed)
- Page cache: ~10 MB (SQLite default)

**Total estimated usage: ~50 MB** (well under 300 MB target) ✅

---

## Configuration

**Tunable parameters** (future: expose via settings UI):

```rust
pub struct SensingConfig {
    /// Capture interval in seconds (default: 5)
    pub capture_interval_secs: u64,

    /// OCR cooldown in seconds (default: 20)
    pub ocr_cooldown_secs: u64,

    /// pHash change threshold for OCR trigger (default: 5)
    pub phash_change_threshold: u32,

    /// Enable perceptual hashing (default: true)
    pub enable_phash: bool,

    /// Enable OCR (default: true)
    pub enable_ocr: bool,
}
```

**Defaults:**

- Capture every **5 seconds** (300 readings per 25min session)
- OCR cooldown: **20 seconds** (run OCR ~60 times per 25min session)
- pHash change threshold: **5** (Hamming distance)
- pHash + OCR both enabled

---

## Error Handling

### Error Categories

1. **Swift FFI Errors**

   - Screenshot permission denied
   - Window no longer exists
   - OCR framework unavailable
   - **Action:** Log error, continue with gaps

2. **Database Errors**

   - Disk full
   - WAL corruption (rare)
   - **Action:** Log error, continue (reading lost)

3. **Timeout Errors**
   - Capture takes >3 seconds
   - **Action:** Log warning, continue to next reading

### Known Limitations

**FFI Hang Risk:**

- Timeout wrapper cannot interrupt blocking FFI calls
- If Swift plugin hangs indefinitely (rare <0.01%), sensing loop will block
- `stop_sensing()` will hang waiting for frozen loop
- **Impact:** Session completes with no context data
- **Mitigation:** Swift plugin tested and stable (Phase 1), macOS APIs rarely hang
- **P1 Fix:** Add Swift-side timeouts using async cancellation

### Logging Strategy

```rust
error!("Capture failed for session {}: {}", session_id, err);
warn!("Capture slow/timeout (>3s) for session {}", session_id);
info!("Sensing started for session {}", session_id);
```

---

## Testing Strategy

### Unit Tests

1. **SensingController**

   - ✅ `start_sensing()` spawns tasks correctly
   - ✅ `stop_sensing()` gracefully shuts down
   - ✅ Can restart sensing for new session

2. **Perceptual Hash**

   - ✅ Same image → same hash
   - ✅ Similar images → low Hamming distance (<10)
   - ✅ Different images → high Hamming distance (>20)

3. **Database Schema**
   - ✅ Foreign key constraint enforced (cascade delete)
   - ✅ Indexes created correctly

### Integration Tests

1. **End-to-End Pipeline**

   - Mock Swift FFI (return dummy metadata/screenshot/OCR)
   - Start sensing, wait 15 seconds
   - Verify 3 readings inserted into database
   - Stop sensing, verify graceful shutdown

2. **Slow Capture Handling**

   - Mock slow OCR (200ms delay)
   - Capture interval: 5s
   - Verify intervals naturally delayed (no frames dropped)
   - **Note:** In single-worker design, slow captures just delay next tick

3. **Error Recovery**
   - Mock FFI error (screenshot fails)
   - Verify sensing loop logs error, continues processing
   - Verify session has gaps (missing readings)

### Manual Testing

1. **Happy Path**

   - Start 25min session
   - Switch between apps (VS Code, Chrome, Terminal)
   - Stop session
   - Query database: `SELECT COUNT(*) FROM context_readings WHERE session_id = ?`
   - Expected: ~300 readings

2. **Performance Monitoring**

   - Use Activity Monitor during session
   - Verify CPU <6% average
   - Verify memory <300 MB

3. **Privacy Audit**
   - Run session with sensitive content visible
   - Check filesystem: no PNG files persisted
   - Check database: only OCR text + metadata stored

---

## Migration Path

### Database Migration

Add migration script to `src/database/migrations.rs`:

```rust
pub fn migrate_v2_to_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE context_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            window_id INTEGER NOT NULL,
            bundle_id TEXT NOT NULL,
            window_title TEXT NOT NULL,
            owner_name TEXT NOT NULL,
            bounds_json TEXT NOT NULL,
            phash TEXT,
            ocr_text TEXT,
            ocr_confidence REAL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_context_readings_session_id ON context_readings(session_id);
        CREATE INDEX idx_context_readings_timestamp ON context_readings(timestamp);"
    )?;
    Ok(())
}
```

**Run migration on app startup** (before creating sessions).

---

## Future Enhancements

### Phase 3.5: Segmentation Algorithm (out of scope for P0)

**Goal:** Group similar readings into "context segments" (e.g., "15 minutes in VS Code editing Timer.tsx")

**Approach:**

- Compare consecutive readings using pHash Hamming distance
- If distance < 10 → same segment
- If distance ≥ 10 → new segment
- Store segments in separate table

**Deferred to Phase 4** (summary generation).

### Robustness Improvements

1. **Adaptive cadence:** Slow down interval if consistently dropping frames
2. **Retry logic:** Exponential backoff for transient FFI errors
3. **Telemetry:** Expose capture success rate to UI

---

## Success Criteria

Phase 3 is complete when:

- ✅ Sensing pipeline starts/stops automatically with timer
- ✅ Context readings stored in database with all required fields
- ✅ No screenshots persisted to disk (privacy audit passes)
- ✅ CPU usage <6% average during 25min session
- ✅ Memory usage <300 MB
- ✅ Errors logged gracefully (no crashes)
- ✅ Unit + integration tests pass
- ✅ Manual testing: 300 readings captured in 25min session

---

## Implementation Checklist

### Code Changes

- [ ] Create `src/sensing/mod.rs` module structure
- [ ] Create `src/sensing/controller.rs` - Implement `SensingController` struct
- [ ] Create `src/sensing/loop.rs` - Implement `sensing_loop` and `perform_capture()`
- [ ] Create `src/sensing/phash.rs` - Implement `compute_phash()` and `compute_hamming_distance()`
- [ ] Create `src/models/context_reading.rs` - Define `ContextReading` struct
- [ ] Add `insert_reading()` method to `Database`
- [ ] Add database migration for `context_readings` table
- [ ] Integrate sensing hooks into `TimerController` (add field + call hooks)

### Dependencies

- [ ] Add `image = "0.25"` to Cargo.toml
- [ ] Add `image-hasher = "2.0"` to Cargo.toml
- [ ] Add `tokio-util = { version = "0.7", features = ["sync"] }` to Cargo.toml

### Testing

- [ ] Unit tests for SensingController (start/stop with CancellationToken)
- [ ] Unit tests for pHash computation (base64 encoding)
- [ ] Unit tests for OCR gating logic (cooldown + Hamming distance)
- [ ] Unit tests for Hamming distance calculation
- [ ] Integration test: mock FFI, verify readings inserted
- [ ] Integration test: verify OCR gating (skipped when no visual change)
- [ ] Integration test: slow capture handling (delayed intervals)
- [ ] Integration test: error recovery
- [ ] Manual test: run 25min session, verify 300 readings
- [ ] Manual test: verify OCR only runs ~60 times (not 300 times)

### Documentation

- [ ] Update README with Phase 3 status
- [ ] Add privacy section explaining no screenshot persistence
- [ ] Document database schema in `docs/database.md`

---

## References

- **Phase 1:** [Swift Plugin](phase-1-swift-plugin.md)
- **Phase 2:** [Timer + Database](phase-2-timer-database.md)
- **P0 Design:** [System Design P0](system-design-p0.md)
- **Clarifications:** [P3 Clarifications](p3_clarifications.md)
