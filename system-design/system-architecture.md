# LeFocus System Architecture (Backend P0 + Phase 2 Timer)

## Purpose

- Concise map of backend systems (Rust/Tauri + Swift dylib) for fast onboarding and LLM context.
- Frontend timer UI and state management included (Phase 2 complete).

## High-level

```
React UI (Timer + Session Management)
        | Tauri IPC
        v
Rust Core (Tauri)
  • Timer Controller (session lifecycle, crash recovery)
  • Database (SQLite actor thread, WAL mode)
  • Commands (timer/audio/tests)
  • FFI bridge
        | FFI (C ABI via C shim)
        v
Swift dylib (MacOSSensing)
  • ScreenCaptureKit (window capture)
  • Vision (OCR)
  • ImageIO (decode)
```

## Responsibilities

- Rust/Tauri
  - Timer state machine with monotonic time tracking (drift-free elapsed calculation).
  - Database actor thread: single-writer semantics, WAL mode, PRAGMA-based migrations.
  - Session persistence with crash recovery (marks incomplete sessions as Interrupted on startup).
  - Tauri commands + event emission (timer-state-changed, timer-heartbeat, session-completed).
  - FFI bridge for Swift plugin; audio engine; (future) sensing/segmentation.
- Swift dylib
  - Resolve frontmost window; capture per-window PNG; run OCR; enforce concurrency; manage buffers.
- Build/Bundle
  - `build.rs` compiles Swift, sets rpaths, copies dylib to `resources/`; Tauri bundles it.

## Startup & App State

- Entry point: `src-tauri/src/main.rs` calls `lefocus_lib::run()`.
- `src-tauri/src/lib.rs` builds the Tauri app and initializes shared state inside `AppState`.
- Database path: app data dir joined with `lefocus.sqlite3`.
- Crash recovery: on startup, queries for any session with `status = 'Running'` and marks it as `Interrupted`.

Key wiring (simplified):

```
run() builds Tauri -> setup():
  - resolve app_data_dir
  - db_path = app_data_dir/lefocus.sqlite3
  - Database::new(db_path)  // spawns DB thread, runs migrations
  - Crash recovery: db.get_incomplete_session() -> mark_session_interrupted()
  - timer_controller = TimerController::new(app_handle, db)
  - app.manage(AppState { audio, _db, timer })
  - register command handlers
```

## Data & Flow (test commands)

1. get window -> `macos_sensing_get_active_window_metadata()` -> returns window id/bundle/title/bounds.
2. capture screenshot -> `macos_sensing_capture_screenshot(id)` -> PNG bytes.
3. run ocr -> `macos_sensing_run_ocr(png)` -> { text, confidence, wordCount }.

## Concurrency

- Swift
  - `stateQueue` serializes `windowCache`, `lastCacheUpdate`, `lastActiveWindowId`.
  - Capture serialized via `captureSemaphore`.
  - OCR serialized via `ocrQueue`; request reused; ImageIO decode (no AppKit on background threads).
  - FFI uses `Task.detached` + semaphores (5s timeout) to avoid deadlock.
- Rust
  - Tauri commands are async; timer controller uses `tokio::sync::Mutex` for state (non-blocking).
  - Timer ticker task: `tokio::time::interval(1s)` checks remaining time, auto-transitions to Stopped at 0.
  - Database access runs on dedicated actor thread (single writer) via `std::sync::mpsc`; async callers use `tokio::sync::oneshot` for replies.
  - Heartbeat: ticker emits `timer-heartbeat` event every 10s (1s in debug mode), spawns background task to update DB progress.

## Timer Subsystem (Phase 2 - FULLY IMPLEMENTED)

### State Machine

- `TimerStatus`: `Idle | Running | Stopped`.
  - `Idle`: No active session.
  - `Running`: Timer ticking down, session persisted.
  - `Stopped`: Timer reached 0, awaiting user finalization (user must click "End").
- `TimerState`: Core state struct with monotonic time tracking.
  - `target_ms`: Planned duration (e.g., 25 min = 1,500,000 ms).
  - `active_ms`: Completed running time (synced from anchor on each tick/heartbeat).
  - `active_ms_baseline`: Baseline value when current running period started.
  - `running_anchor: Option<Instant>`: Monotonic anchor for drift-free elapsed calculation.
  - `started_at: Option<DateTime<Utc>>`: Wall-clock timestamp for persistence.

### Controller Implementation

- `TimerController` owns:
  - `state: Arc<Mutex<TimerState>>` (tokio::sync::Mutex for async access).
  - `db: Database` (actor thread handle).
  - `app_handle: AppHandle` (for event emission).
  - `ticker: Arc<Mutex<Option<JoinHandle<()>>>>` (ticker task handle).
  - `tick_interval: Duration` (1s).
  - `heartbeat_every_ticks: u32` (10 in production, 1 in debug mode).

### Commands

- `start_timer(target_ms: u64) -> Result<TimerState>`:
  - Creates session in DB with `status = Running`.
  - Spawns ticker task.
  - Emits `timer-state-changed` event.
- `end_timer() -> Result<SessionInfo>`:
  - Marks session as `Completed`, sets `stopped_at`.
  - Cancels ticker task.
  - Emits `session-completed` event.
- `cancel_timer() -> Result<()>`:
  - Marks session as `Cancelled`.
  - Cancels ticker task.
  - Resets state to `Idle`.
- `get_timer_state() -> Result<TimerSnapshot>`:
  - Returns current state + remaining_ms (synced from anchor).

### Ticker Task

- Spawned by `start_timer()`, runs `tokio::time::interval(1s)` loop.
- On each tick:
  - Syncs `active_ms` from monotonic anchor (prevents drift).
  - Calculates `remaining_ms = target_ms - active_ms`.
  - If `remaining_ms <= 0`: auto-transitions to `Stopped`, updates DB, breaks loop.
  - Every N ticks (10 in prod, 1 in debug): emits `timer-heartbeat`, updates DB progress in background task.
- Cancellable via `JoinHandle::abort()` on stop/cancel.

### Crash Recovery

- On app startup: `db.get_incomplete_session()` queries for `status = 'Running'`.
- If found: `db.mark_session_interrupted(id, now)` sets status to `Interrupted`, logs warning.
- Heartbeat updates ensure last snapshot (within 10-15s) is preserved in DB.
- Future P1: offer soft resume with recovered state.

## Database (SQLite + actor model)

- Dedicated thread: started by `Database::new()`. Opens SQLite, enables WAL and foreign keys, runs migrations, processes commands.
- API: call `Database::execute(|conn| { ... })` to run closure-based operations on the DB thread, returning results via oneshot.
- Benefits: isolates blocking I/O, guarantees single-writer semantics, centralizes migration/startup.
- Tables:
  - `sessions`: id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at.
  - `test_table`: (v3 migration artifact, not used in P0).

## Migrations

- Versioned with `PRAGMA user_version` and `CURRENT_SCHEMA_VERSION = 3` in Rust.
- On startup: if DB version < current, run sequential migrations inside one transaction, bump `user_version`, commit.
- Schema history:
  - v1: Initial schema (sessions + pauses tables).
  - v2: Removed pause support (dropped pauses table, removed Paused status).
  - v3: Added test_table for validation (unused in production).

## FFI Surface (C ABI via shim)

- Functions
  - `macos_sensing_get_active_window_metadata() -> *mut WindowMetadataFFI`
  - `macos_sensing_capture_screenshot(u32, *mut size_t) -> *mut u8`
  - `macos_sensing_run_ocr(*const u8, size_t) -> *mut OCRResultFFI`
  - Free: `macos_sensing_free_window_metadata`, `macos_sensing_free_screenshot_buffer`, `macos_sensing_free_ocr_result`
- Structs (C)
  - `WindowMetadataFFI { u32 windowId; char* bundleIdPtr; char* titlePtr; char* ownerNamePtr; f64 boundsX/Y/Width/Height; }`
  - `OCRResultFFI { char* textPtr; double confidence; uint64_t wordCount; }`
- Rust mirrors
  - `usize` for `size_t`, `u64` for `wordCount`.

## Build & Packaging

- Dev
  - `src-tauri/build.rs`: builds Swift package; sets rpaths for build dir & bundle; copies dylib to `src-tauri/resources/`.
- Bundle
  - `src-tauri/tauri.conf.json`: includes `resources/libMacOSSensing.dylib` so it ships in app.

## File structure (backend)

```
src-tauri/
  Cargo.toml                       # Dependencies: tauri, tokio, rusqlite, uuid, chrono, etc.
  Cargo.lock
  build.rs                         # builds Swift, sets rpaths, copies dylib, runs tauri_build
  tauri.conf.json                  # bundles resources/libMacOSSensing.dylib
  resources/
    libMacOSSensing.dylib          # built artifact (not committed)
  src/
    main.rs                        # Tauri entry
    lib.rs                         # Tauri commands registration, AppState, crash recovery
    macos_bridge.rs                # Safe Rust FFI wrappers -> C shim
    db/
      mod.rs                       # Database actor thread, execute API, WAL, FKs
      migrations.rs                # Migration runner using PRAGMA user_version
      schema_v1.sql                # Initial schema (sessions + pauses)
      schema_v2.sql                # Remove pause support
      schema_v3.sql                # Add test_table
    models/
      mod.rs
      session.rs                   # Session, SessionInfo, SessionStatus
    timer/
      mod.rs                       # Re-exports
      state.rs                     # TimerState, TimerStatus (drift-free elapsed)
      controller.rs                # TimerController, ticker task, heartbeat
      commands.rs                  # Tauri commands (start/end/cancel/get_state)
    audio/
      mod.rs
      binaural.rs
      brown_noise.rs
      rain.rs
  plugins/macos-sensing/
    Package.swift                  # Swift package (.dynamic library)
    Sources/
      CMacOSSensing/
        include/MacOSSensingFFI.h  # C ABI header (exported)
        MacOSSensingFFI.c          # C shim bridging Swift @_cdecl hooks
      MacOSSensing/
        FFITypes.swift             # typealiases -> C structs
        FFIExports.swift           # @_cdecl hooks + semaphores/timeouts
        MacOSSensing.swift         # Window cache, capture, OCR

src/                               # React frontend
  App.tsx                          # Main app component
  components/
    TimerView.tsx                  # Main timer UI (renders display, controls, picker)
    TimerDisplay.tsx               # MM:SS countdown display
    TimerControls.tsx              # Start/End/Cancel buttons
    DurationPicker.tsx             # Preset duration selector (15/25/45 min)
  hooks/
    useTimer.ts                    # High-level timer hook (combines snapshot + smooth countdown + commands)
    useTimerSnapshot.ts            # Fetches initial state, listens to timer-state-changed + timer-heartbeat
    useSmoothCountdown.ts          # Local 250ms interpolation for smooth UI
  types/
    timer.ts                       # TypeScript interfaces (TimerState, TimerSnapshot, SessionInfo)

system-design/
  system-architecture.md           # this document
  system-design-p0.md              # Full P0 system design
  phase-1-swift-plugin.md          # Phase 1 design (completed)
  phase-2-timer-database.md        # Phase 2 design (completed)
  phase-3-sensing-pipeline.md      # Phase 3 design (next)
  p0prd.md
  p1-improvements.md
  notes.md
  lefocus.md
```

## Frontend (React + Tauri IPC)

### Components

- `TimerView`: Main timer component.
  - Combines `useTimer` hook (state + commands).
  - Renders `TimerDisplay`, `DurationPicker` (when idle), `TimerControls`.
  - Handles user actions (start/end/cancel).
- `TimerDisplay`: Formats `remainingMs` as MM:SS (zero-padded).
- `DurationPicker`: Shows three preset buttons (15/25/45 min), highlights selected.
- `TimerControls`: Renders Start/End/Cancel buttons, enables/disables based on status.

### Hooks

- `useTimer`:
  - Combines `useTimerSnapshot` + `useSmoothCountdown`.
  - Provides command wrappers: `startTimer(ms)`, `endTimer()`, `cancelTimer()`.
  - Returns: `{ timerState, error, startTimer, endTimer, cancelTimer }`.
- `useTimerSnapshot`:
  - Fetches initial state via `invoke("get_timer_state")`.
  - Listens to `timer-state-changed` and `timer-heartbeat` events.
  - Applies snapshots with equality check to avoid unnecessary re-renders.
- `useSmoothCountdown`:
  - Runs local interpolation (requestAnimationFrame) when status = Running.
  - Decrements `displayMs` smoothly between server heartbeats.
  - Syncs with server snapshot on each heartbeat (prevents drift accumulation).

### Events (Rust -> React)

- `timer-state-changed`: Emitted on every state transition (start/stop/cancel).
  - Payload: `{ state: TimerState, remaining_ms: i64 }`.
- `timer-heartbeat`: Emitted every 10s (1s in debug) while Running.
  - Payload: `{ state: TimerState, active_ms: u64, remaining_ms: i64 }`.
- `session-completed`: Emitted after `end_timer()` finalizes session.
  - Payload: `{ session_id: String, session: SessionInfo }`.

## Tauri commands (current)

### Timer Commands (Phase 2)

- `get_timer_state() -> TimerSnapshot`
- `start_timer(target_ms: u64) -> TimerState`
- `end_timer() -> SessionInfo`
- `cancel_timer() -> ()`

### Test Commands (Phase 1)

- `test_get_window() -> WindowMetadata`
- `test_capture_screenshot(window_id: u32) -> String`
- `test_run_ocr(image_path: String) -> OCRResult`

### Legacy Audio Commands

- `start_audio(sound_type, left_freq, right_freq)`
- `stop_audio()`
- `toggle_pause()`
- `set_volume(volume)`

## Known decisions

- macOS min: Swift package set to 14 (can lower to 13 if needed).
- No persistent raw images; OCR and hashing consume in-memory PNGs.
- FFI calls have 5s timeout; Rust bails on null/empty results.
- Timer ticker: 1s interval (non-blocking), emits heartbeat every 10s (1s in debug mode).
- Debug mode: `LEFOCUS_DEBUG=1` env variable enables faster testing (1s heartbeat, shorter durations).
- Monotonic time tracking: `running_anchor` (Instant) prevents drift; `active_ms` synced on each tick/heartbeat.
- Crash recovery: marks incomplete sessions as `Interrupted` on startup; preserves last heartbeat snapshot.
- No pause/resume support in Phase 2 (removed from schema v2).

## Implementation Status

### Phase 1 (Swift Plugin): COMPLETE
- Swift dylib with FFI bridge.
- Window metadata, screenshot capture, OCR working.
- Test commands verified.

### Phase 2 (Timer + Database): COMPLETE
- Timer state machine with monotonic time tracking.
- Database actor thread with WAL mode and migrations (v1/v2/v3).
- Session persistence with crash recovery.
- Tauri commands + events (start/end/cancel/get_state).
- Frontend timer UI with hooks (useTimer, useTimerSnapshot, useSmoothCountdown).
- All acceptance criteria met (see phase-2-timer-database.md).

### Phase 3 (Sensing Pipeline): PLANNED
- Bounded channels for event/reading/OCR flow.
- Multi-task worker architecture (sensing_loop, screenshot_worker, ocr_worker).
- Window metadata polling (5s interval), heartbeat emission (15s).
- pHash-based visual change detection.
- Backpressure handling (drop heartbeats under load).

## Next wiring

- Phase 3: Sensing pipeline (polling, screenshot, OCR) with worker architecture.
- Phase 4: Segmentation algorithm (state machine with hysteresis, sandwich merge, confidence scoring).
- Phase 5: Summary generation + visualization (Recharts stacked bar, session-completed modal).
- Phase 6: Polish (CPU/memory optimization, permission onboarding, stress testing).

---

**Last updated:** October 26, 2025 (Phase 2 complete)
**Schema version:** 3
**Implementation phase:** 2 of 6 (P0)
