# Phase 2: Timer + Database System Design

**Version:** 1.0
**Date:** October 2025
**Author:** Steven Yang
**Status:** Implementation Ready
**Phase:** 2 of 6 (P0)

---

## Document Purpose

This document provides detailed implementation specifications for **Phase 2** of LeFocus P0: building a Pomodoro timer with session persistence. This phase establishes the foundation for session tracking without context sensing (which comes in Phase 3).

**Dependencies:**
- Phase 1 (Swift Plugin) ✅ Complete

**Enables:**
- Phase 3 (Sensing Pipeline)
- Phase 4 (Segmentation)
- Phase 5 (Summary Visualization)

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Architecture](#2-architecture)
3. [Timer State Machine](#3-timer-state-machine)
4. [Data Models](#4-data-models)
5. [Database Schema](#5-database-schema)
6. [Tauri Commands & Events](#6-tauri-commands--events)
7. [Frontend Components](#7-frontend-components)
8. [Implementation Guide](#8-implementation-guide)
9. [Testing & Acceptance Criteria](#9-testing--acceptance-criteria)

---

## 1. Overview & Goals

### 1.1 Phase 2 Mission

Build a **production-quality Pomodoro timer** with:
1. Accurate time tracking (start, pause, resume, stop)
2. Session persistence in SQLite
3. Pause duration tracking (for future summary insights)
4. Crash-resilient state management
5. Clean React UI with real-time updates

### 1.2 Success Criteria

| Criterion | Target |
|-----------|--------|
| Timer accuracy | ±500ms over 25 min session |
| State sync latency | UI updates within 100ms of state change |
| Database initialization | < 50ms on app startup |
| Session record creation | < 10ms to insert |
| UI responsiveness | 60fps timer display (16ms frame budget) |
| Code separation | Audio/test UIs moved to separate files |

### 1.3 What's In Scope

- ✅ Timer controller with pause/resume
- ✅ SQLite database with migrations
- ✅ Session CRUD operations
- ✅ Timer UI with preset durations
- ✅ Pause tracking (duration accumulator)
- ✅ State synchronization (Rust ↔ React)

### 1.4 What's Out of Scope (Deferred to Later Phases)

- ❌ Context sensing (Phase 3)
- ❌ Window metadata collection (Phase 3)
- ❌ Summary generation (Phase 5)
- ❌ Soft resume after crash (P1)
- ❌ Settings persistence (P1)
- ❌ Progress bar UI (P0 Phase 6 polish)

---

## 2. Architecture

### 2.1 System Layers

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                         │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  TimerView.tsx │  │ AudioView.tsx│  │ TestView.tsx│ │
│  │   (NEW P2)     │  │  (archived)  │  │ (archived)  │ │
│  └────────┬───────┘  └──────────────┘  └─────────────┘ │
│           │ useTimer hook (local 250ms interval)        │
│           │ + listens to Tauri events                   │
└───────────┼─────────────────────────────────────────────┘
            │ Tauri IPC
            │ invoke: start_timer, pause_timer, etc.
            │ listen: timer-state-changed, timer-heartbeat
┌───────────▼─────────────────────────────────────────────┐
│                  Tauri Rust Core                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         TimerController (AppState)               │   │
│  │  - state: Arc<Mutex<TimerState>>                 │   │
│  │  - ticker_handle: Option<JoinHandle>             │   │
│  │  - db: Arc<Database>                             │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │          Database Module (SQLite)                │   │
│  │  - sessions table                                │   │
│  │  - pauses table                                  │   │
│  │  - migrations (PRAGMA user_version)              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 State Flow

**Starting a Timer:**
```
User clicks "Start 25min"
  ↓
React calls invoke("start_timer", { duration_ms: 1500000 })
  ↓
TimerController::start_timer()
  - Creates Session record in DB (status=Running)
  - Spawns tokio ticker task (1s interval)
  - Updates state to Running
  - Emits timer-state-changed event
  ↓
React receives event → updates UI
  - Starts local 250ms animation interval
  - Displays MM:SS countdown
```

**Pausing:**
```
User clicks "Pause"
  ↓
React calls invoke("pause_timer")
  ↓
TimerController::pause_timer()
  - Calculates elapsed active time
  - Creates Pause record in DB (pause_started_at)
  - Updates state to Paused
  - Stops ticker task
  - Emits timer-state-changed event
  ↓
React receives event → stops animation, shows "Paused"
```

**Resuming:**
```
User clicks "Resume"
  ↓
React calls invoke("resume_timer")
  ↓
TimerController::resume_timer()
  - Updates last Pause record (pause_ended_at, duration_ms)
  - Updates state to Running
  - Restarts ticker task
  - Emits timer-state-changed event
  ↓
React receives event → resumes animation
```

**Timer Reaches Zero:**
```
Ticker task detects remaining_ms ≤ 0
  ↓
TimerController auto-transitions to Stopped state
  - Does NOT finalize session in DB yet
  - Emits timer-state-changed (status=Stopped)
  ↓
React shows "Session Complete! Click End to finish"
  - User can review time, decide to continue/end
  ↓
User clicks "End"
  ↓
React calls invoke("end_timer")
  ↓
TimerController::end_timer()
  - Updates session status to Completed
  - Sets stopped_at timestamp
  - Calculates final active_ms, paused_ms
  - Emits session-completed event (for Phase 5)
```

### 2.3 Crash Handling

**Scenario:** User force-quits app mid-session

**On Restart:**
- Database has session with `status=Running` or `status=Paused`
- App startup detects incomplete session:
  ```rust
  if let Some(incomplete) = db.get_incomplete_sessions()? {
      db.mark_as_interrupted(incomplete.id)?;
      log::warn!("Marked session {} as interrupted", incomplete.id);
  }
  ```
- **Phase 2 behavior:** Mark as "Interrupted", do nothing else
- **P1 behavior:** Offer soft resume ("Continue previous session?")

---

## 3. Timer State Machine

### 3.1 States

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TimerStatus {
    Idle,        // No active session
    Running,     // Timer ticking down
    Paused,      // Timer paused (user action)
    Stopped,     // Timer reached 0, awaiting finalization
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub status: TimerStatus,
    pub session_id: Option<String>,  // UUID as string
    pub target_ms: u64,              // Planned duration (e.g., 1500000 = 25min)
    pub active_ms: u64,              // Time actively running (excludes pauses)
    pub paused_ms: u64,              // Total time paused
    pub started_at: Option<DateTime<Utc>>,
    pub last_pause_started_at: Option<DateTime<Utc>>,
    pub last_tick_at: Option<DateTime<Utc>>,  // For accurate resume
}
```

### 3.2 State Transitions

```
         start_timer
    ┌──────────────────────┐
    │                      ▼
  ┌──────┐            ┌─────────┐
  │ Idle │            │ Running │◄───┐
  └──────┘            └────┬────┘    │
                           │         │ resume_timer
                           │ pause   │
                           ▼         │
                      ┌─────────┐    │
                      │ Paused  │────┘
                      └─────────┘

    (Timer reaches 0)
         Running ──────────► Stopped

    (User clicks "End")
         Stopped ──────────► Idle
            (finalizes session)
```

**Valid Transitions:**
- `Idle → Running`: `start_timer(duration_ms)`
- `Running → Paused`: `pause_timer()`
- `Paused → Running`: `resume_timer()`
- `Running → Stopped`: Auto-trigger when `remaining_ms ≤ 0`
- `Stopped → Idle`: `end_timer()` (user finalizes)
- `Running → Idle`: `cancel_timer()` (abort session, mark as Cancelled)
- `Paused → Idle`: `cancel_timer()`

**Invalid Transitions:**
- `Idle → Paused`: No session to pause
- `Stopped → Paused`: Cannot pause completed timer

### 3.3 Time Calculations

**Remaining Time (displayed in UI):**
```rust
fn get_remaining_ms(state: &TimerState) -> i64 {
    match state.status {
        TimerStatus::Idle => 0,
        TimerStatus::Paused => {
            (state.target_ms as i64) - (state.active_ms as i64)
        }
        TimerStatus::Running => {
            let elapsed_since_last_tick = state.last_tick_at
                .map(|t| Utc::now().signed_duration_since(t).num_milliseconds())
                .unwrap_or(0);

            (state.target_ms as i64) - (state.active_ms as i64) - elapsed_since_last_tick
        }
        TimerStatus::Stopped => 0,
    }
}
```

**Active Time (excludes pauses):**
```rust
// Updated on every tick (Running state)
state.active_ms += 1000;  // 1 second per tick

// On pause:
// - Stop incrementing active_ms
// - Start incrementing paused_ms when resumed

// On resume:
let pause_duration = Utc::now()
    .signed_duration_since(state.last_pause_started_at.unwrap())
    .num_milliseconds() as u64;
state.paused_ms += pause_duration;
```

---

## 4. Data Models

### 4.1 Session (Rust)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,  // UUID v4
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,

    // Time tracking
    pub target_ms: u64,        // Planned duration
    pub active_ms: u64,        // Actual active time (excludes pauses)
    pub paused_ms: u64,        // Total paused duration

    // Metadata
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Running,      // Currently active
    Paused,       // Currently paused
    Completed,    // User clicked "End", normal completion
    Cancelled,    // User clicked "Cancel" mid-session
    Interrupted,  // App crashed/quit during session
}
```

### 4.2 Pause Record (Rust)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pause {
    pub id: String,  // UUID v4
    pub session_id: String,
    pub pause_started_at: DateTime<Utc>,
    pub pause_ended_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,  // Calculated on resume
}
```

### 4.3 Frontend Types (TypeScript)

```typescript
// src/types/timer.ts

export type TimerStatus = 'Idle' | 'Running' | 'Paused' | 'Stopped';

export interface TimerState {
  status: TimerStatus;
  sessionId: string | null;
  targetMs: number;
  activeMs: number;
  pausedMs: number;
  startedAt: string | null;  // ISO 8601
  lastPauseStartedAt: string | null;
  lastTickAt: string | null;
}

export interface SessionInfo {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: 'Running' | 'Paused' | 'Completed' | 'Cancelled' | 'Interrupted';
  targetMs: number;
  activeMs: number;
  pausedMs: number;
}

// Preset durations (milliseconds)
export const TIMER_PRESETS = {
  short: 15 * 60 * 1000,   // 15 min
  standard: 25 * 60 * 1000, // 25 min (classic Pomodoro)
  long: 45 * 60 * 1000,    // 45 min
} as const;
```

---

## 5. Database Schema

### 5.1 Tables

```sql
-- sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,  -- ISO 8601 UTC
    stopped_at TEXT,           -- NULL if not stopped yet
    status TEXT NOT NULL CHECK(status IN ('Running', 'Paused', 'Completed', 'Cancelled', 'Interrupted')),

    -- Time tracking
    target_ms INTEGER NOT NULL,
    active_ms INTEGER NOT NULL DEFAULT 0,
    paused_ms INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL  -- Batch update every 10-15s (not on every tick)
);

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);

-- pauses table (many-to-one with sessions)
CREATE TABLE pauses (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    pause_started_at TEXT NOT NULL,
    pause_ended_at TEXT,
    duration_ms INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_pauses_session ON pauses(session_id);
```

### 5.2 Schema Migrations

**Migration System:**
- Use SQLite `PRAGMA user_version` to track schema version
- Increment on each migration
- Run migrations sequentially on startup

```rust
// src-tauri/src/db/migrations.rs

const CURRENT_SCHEMA_VERSION: i32 = 1;

pub fn run_migrations(conn: &Connection) -> Result<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < CURRENT_SCHEMA_VERSION {
        log::info!("Running migrations from v{} to v{}", version, CURRENT_SCHEMA_VERSION);

        for migration_version in (version + 1)..=CURRENT_SCHEMA_VERSION {
            apply_migration(conn, migration_version)?;
        }

        conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
        log::info!("Migrations complete");
    }

    Ok(())
}

fn apply_migration(conn: &Connection, version: i32) -> Result<()> {
    match version {
        1 => {
            // Initial schema
            conn.execute_batch(include_str!("schema_v1.sql"))?;
            Ok(())
        }
        _ => Err(anyhow::anyhow!("Unknown migration version: {}", version)),
    }
}
```

### 5.3 Dummy Data for Phase 2 Testing

Since Phase 3 will add context readings, we'll insert placeholder data to test the schema:

```rust
// Only for testing - remove in Phase 3
#[cfg(debug_assertions)]
pub fn insert_dummy_reading(db: &Database, session_id: &str) -> Result<()> {
    db.conn.lock().unwrap().execute(
        "INSERT INTO context_readings (session_id, timestamp, bundle_id, window_title, owner_name, bounds_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            session_id,
            Utc::now().to_rfc3339(),
            "com.placeholder.app",
            "Placeholder Window",
            "Placeholder",
            r#"{"x":0,"y":0,"width":800,"height":600}"#,
        ],
    )?;
    Ok(())
}
```

---

## 6. Tauri Commands & Events

### 6.1 Commands (React → Rust)

```rust
// src-tauri/src/timer/commands.rs

#[tauri::command]
pub async fn start_timer(
    state: State<'_, AppState>,
    target_ms: u64,
) -> Result<TimerState, String> {
    state.timer_controller.start_timer(target_ms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_timer(
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    state.timer_controller.pause_timer()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_timer(
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    state.timer_controller.resume_timer()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn end_timer(
    state: State<'_, AppState>,
) -> Result<SessionInfo, String> {
    state.timer_controller.end_timer()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_timer(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.timer_controller.cancel_timer()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_timer_state(
    state: State<'_, AppState>,
) -> Result<TimerState, String> {
    Ok(state.timer_controller.get_state())
}
```

### 6.2 Events (Rust → React)

**Event Types:**

```typescript
// State transition events (emitted on every state change)
interface TimerStateChangedEvent {
  state: TimerState;
  remainingMs: number;  // Calculated server-side
}

// Periodic heartbeat (every 5-10s while Running)
interface TimerHeartbeatEvent {
  activeMs: number;
  pausedMs: number;
  remainingMs: number;
}

// Session finalized (for Phase 5 summary trigger)
interface SessionCompletedEvent {
  sessionId: string;
  session: SessionInfo;
}
```

**Emission Strategy:**

```rust
// On state transitions (start, pause, resume, stop, cancel)
app.emit_all("timer-state-changed", TimerStateChangedEvent {
    state: current_state.clone(),
    remaining_ms: get_remaining_ms(&current_state),
})?;

// Heartbeat (every 10s during Running state)
// Sent from ticker task
app.emit_all("timer-heartbeat", TimerHeartbeatEvent {
    active_ms: state.active_ms,
    paused_ms: state.paused_ms,
    remaining_ms: get_remaining_ms(&state),
})?;
```

---

## 7. Frontend Components

### 7.1 File Structure

```
src/
├── App.tsx                     # Main app, routes to TimerView
├── components/
│   ├── TimerView.tsx           # NEW: Main timer UI (Phase 2)
│   ├── TimerDisplay.tsx        # NEW: MM:SS countdown display
│   ├── TimerControls.tsx       # NEW: Start/Pause/Resume/End buttons
│   ├── DurationPicker.tsx      # NEW: Preset duration selector
│   └── archived/               # OLD: Phase 1 components
│       ├── AudioView.tsx       # Keep for reference
│       └── TestView.tsx        # Keep for reference
└── types/
    └── timer.ts                # NEW: TypeScript interfaces
```

### 7.2 Requirements & Behavior

**TimerView Component:**
- Fetch initial timer state on mount via `get_timer_state` command
- Listen to `timer-state-changed` events and update React state
- Listen to `timer-heartbeat` events (every 10s) to resync display
- When status=Running: Run local 250ms interval to decrement `displayMs` smoothly
- Show `DurationPicker` only when status=Idle
- Show `TimerDisplay` always (displays MM:SS countdown)
- Show `TimerControls` always (buttons enabled/disabled based on status)
- Handle commands: `start_timer`, `pause_timer`, `resume_timer`, `end_timer`, `cancel_timer`

**TimerDisplay Component:**
- Format `remainingMs` as MM:SS (zero-padded)
- Show status indicator when Paused or Stopped
- Example: "⏸ Paused" or "✓ Complete!"

**DurationPicker Component:**
- Show three preset buttons: 15 min, 25 min, 45 min
- Highlight selected duration
- Call `onSelect` with milliseconds when clicked

**Key Implementation Notes:**
- Use `@tauri-apps/api/core` for `invoke()`
- Use `@tauri-apps/api/event` for `listen()`
- Clean up event listeners in useEffect return functions
- Local animation interval only runs when status=Running

---

## 8. Implementation Guide

### 8.1 Step-by-Step Checklist

#### Step 1: Database Setup
- [ ] Create `src-tauri/src/db/` module
- [ ] Write `schema_v1.sql` (sessions + pauses tables)
- [ ] Implement `Database` struct with rusqlite
- [ ] Implement migrations using `PRAGMA user_version`
- [ ] Add database initialization to app startup
- [ ] Test: Verify DB created in Tauri app data directory

#### Step 2: Data Models
- [ ] Create `src-tauri/src/models/session.rs`
- [ ] Create `src-tauri/src/models/pause.rs`
- [ ] Implement `Session`, `SessionStatus`, `Pause` structs
- [ ] Derive `Serialize`, `Deserialize` for Tauri IPC

#### Step 3: Timer State Machine
- [ ] Create `src-tauri/src/timer/mod.rs`
- [ ] Implement `TimerState` and `TimerStatus` enums
- [ ] Implement state transition logic
- [ ] Implement time calculation functions (`get_remaining_ms`, etc.)
- [ ] Unit tests for state transitions

#### Step 4: Timer Controller
- [ ] Create `src-tauri/src/timer/controller.rs`
- [ ] Implement `TimerController` struct with `Arc<Mutex<TimerState>>`
- [ ] Implement `start_timer()` method:
  - Create session in DB
  - Spawn ticker task (tokio::spawn with tokio::time::interval)
  - Store JoinHandle, cancel on any state transition
  - Emit state-changed event
- [ ] Implement `pause_timer()` method:
  - Create pause record
  - Cancel ticker task (abort JoinHandle)
  - Emit event
- [ ] Implement `resume_timer()` method:
  - Update pause record (end time + duration)
  - Restart ticker (new JoinHandle)
  - Emit event
- [ ] Implement `end_timer()` method:
  - Cancel ticker task
  - Update session status to Completed, set stopped_at
  - Emit session-completed event
- [ ] Implement `cancel_timer()` method (cancel ticker + mark Cancelled)
- [ ] Implement ticker task:
  - tokio::time::interval(1s) updates `active_ms` internally (Arc<Mutex>)
  - Check if `remaining_ms ≤ 0` → auto-transition to Stopped
  - Emit heartbeat every 10 ticks (10s)
  - Batch DB `updated_at` updates every 10-15s (not every tick)

#### Step 5: Tauri Commands
- [ ] Create `src-tauri/src/timer/commands.rs`
- [ ] Register all commands in `lib.rs`
- [ ] Test commands via Tauri DevTools console

#### Step 6: Frontend Types
- [ ] Create `src/types/timer.ts`
- [ ] Define TypeScript interfaces matching Rust types
- [ ] Define `TIMER_PRESETS` constant

#### Step 7: Frontend Components
- [ ] Archive old components to `src/components/archived/`
- [ ] Create `TimerDisplay.tsx` (MM:SS display)
- [ ] Create `DurationPicker.tsx` (preset buttons)
- [ ] Create `TimerControls.tsx` (Start/Pause/Resume/End buttons)
- [ ] Create `TimerView.tsx` (main component)
- [ ] Update `App.tsx` to render `TimerView`

#### Step 8: State Synchronization
- [ ] Implement event listeners in `TimerView`
- [ ] Implement 250ms animation interval
- [ ] Implement heartbeat sync
- [ ] Test: Verify UI updates within 100ms of state change

#### Step 9: Crash Handling
- [ ] Add startup check for incomplete sessions
- [ ] Mark interrupted sessions on app init
- [ ] Test: Force-quit during session, restart, verify status=Interrupted

#### Step 10: Manual Testing
- [ ] Start 15min timer, verify DB record created
- [ ] Pause after 30s, verify pause record created
- [ ] Resume, verify pause duration calculated
- [ ] Let timer complete, verify auto-stop
- [ ] Click "End", verify session finalized
- [ ] Test cancel mid-session
- [ ] Test crash recovery (force quit + restart)

---

## 9. Testing & Acceptance Criteria

### 9.1 Functional Tests (Manual)

**Debug Mode:** Set `LEFOCUS_DEBUG=1` env variable for faster testing:
- Timer durations: 10s instead of minutes
- Heartbeat interval: 1s instead of 10s

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| **Start timer** | Click "25 min" → "Start" | Session created in DB with status=Running, timer counts down |
| **Pause** | Start timer → wait 10s → click "Pause" | Status=Paused, pause record created, timer stops |
| **Resume** | Pause → wait 5s → click "Resume" | Pause duration = 5s, timer resumes from remaining time |
| **Multiple pauses** | Start → pause → resume → pause → resume | Multiple pause records, paused_ms accumulates correctly |
| **Auto-stop** | Start timer (debug: 10s) → wait | Timer auto-stops at 0, status=Stopped, UI shows "Complete!" |
| **End session** | Auto-stopped timer → click "End" | Session status=Completed, stopped_at set, UI returns to Idle |
| **Cancel** | Start timer → wait 10s → click "Cancel" | Session status=Cancelled, UI returns to Idle |
| **Crash recovery** | Start timer → force quit app → restart | Session marked as Interrupted on startup |

### 9.2 Acceptance Criteria

#### ✅ Database
- [ ] SQLite file created in Tauri app data directory
- [ ] Schema version = 1
- [ ] Sessions table has correct columns and indexes
- [ ] Pauses table has foreign key constraint

#### ✅ Timer Accuracy
- [ ] 25-minute timer completes within ±500ms of 1500 seconds
- [ ] Pause duration tracked accurately (±100ms)
- [ ] Active time excludes pause periods correctly

#### ✅ State Synchronization
- [ ] UI updates within 100ms of Rust state change
- [ ] Heartbeat event emitted every 10s (±1s)
- [ ] Local animation smooth at 60fps (no jank)

#### ✅ UI/UX
- [ ] Duration picker shows 15/25/45 min options
- [ ] Timer displays in MM:SS format
- [ ] Button states correct for each status (disabled when invalid)
- [ ] "Complete!" message shown when timer reaches 0

#### ✅ Code Quality
- [ ] Audio/test components moved to `archived/` folder
- [ ] No compiler warnings
- [ ] All Tauri commands registered and callable
- [ ] Database queries use parameterized statements (SQL injection safe)

---

## 10. Open Questions & Decisions

### 10.1 Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| Timer state location? | Rust (single source of truth) | Simpler sync, accurate server-side time |
| Pause/resume support? | Yes, track pause durations | Needed for summary insights |
| Database location? | Tauri app data directory | Standard path, user-accessible |
| Migrations now? | Yes, PRAGMA user_version | Future-proof, easy to extend |
| Session finalization? | User must click "End" | Allows user to review before finalizing |
| Crash handling? | Mark as Interrupted | Enables P1 soft resume feature |

### 10.2 Deferred to Phase 3+

- Soft resume after crash (P1)
- Settings persistence (timer sound, notifications) (P1)
- Progress bar/circle UI (Phase 6 polish)
- Historical session viewer (P1)

---

## 11. Dependencies

### 11.1 New Cargo Dependencies

```toml
[dependencies]
# Existing
tauri = { version = "2", features = ["macos-private-api"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
anyhow = "1"
log = "0.4"

# NEW for Phase 2
rusqlite = { version = "0.31", features = ["bundled"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

### 11.2 Frontend Dependencies

No new frontend dependencies needed (React + Tauri API already available).

---

## 12. File Checklist

**New Files to Create:**

```
src-tauri/src/
├── db/
│   ├── mod.rs              # Database struct, connection management
│   ├── migrations.rs       # Migration runner
│   └── schema_v1.sql       # Initial schema
├── models/
│   ├── session.rs          # Session, SessionStatus
│   └── pause.rs            # Pause
├── timer/
│   ├── mod.rs              # Re-exports
│   ├── state.rs            # TimerState, TimerStatus
│   ├── controller.rs       # TimerController
│   └── commands.rs         # Tauri commands

src/
├── components/
│   ├── TimerView.tsx       # Main timer component
│   ├── TimerDisplay.tsx    # MM:SS display
│   ├── TimerControls.tsx   # Buttons
│   ├── DurationPicker.tsx  # Preset selector
│   └── archived/
│       ├── AudioView.tsx   # Move from components/
│       └── TestView.tsx    # Move from components/
├── types/
│   └── timer.ts            # TypeScript types
```

---

## Appendix A: SQL Examples

**Create session:**
```sql
INSERT INTO sessions (id, started_at, status, target_ms, active_ms, paused_ms, created_at, updated_at)
VALUES ('uuid-here', '2025-10-22T10:00:00Z', 'Running', 1500000, 0, 0, '2025-10-22T10:00:00Z', '2025-10-22T10:00:00Z');
```

**Create pause:**
```sql
INSERT INTO pauses (id, session_id, pause_started_at)
VALUES ('uuid-here', 'session-uuid', '2025-10-22T10:05:00Z');
```

**Update pause on resume:**
```sql
UPDATE pauses
SET pause_ended_at = '2025-10-22T10:06:00Z', duration_ms = 60000
WHERE id = 'pause-uuid';
```

**Update session on end:**
```sql
UPDATE sessions
SET status = 'Completed', stopped_at = '2025-10-22T10:25:00Z', active_ms = 1440000, paused_ms = 60000, updated_at = '2025-10-22T10:25:00Z'
WHERE id = 'session-uuid';
```

**Find incomplete sessions on startup:**
```sql
SELECT * FROM sessions
WHERE status IN ('Running', 'Paused')
ORDER BY started_at DESC;
```

---

**End of Phase 2 System Design**

**Total sections:** 12
**Estimated implementation time:** 1-2 weeks
**Ready for implementation:** ✅

