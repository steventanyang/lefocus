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

1. Accurate time tracking (start, stop, cancel)
2. Session persistence in SQLite
3. Crash-resilient state management
4. Clean React UI with real-time updates

### 1.2 Success Criteria

| Criterion               | Target                                  |
| ----------------------- | --------------------------------------- |
| Timer accuracy          | ±500ms over 25 min session              |
| State sync latency      | UI updates within 100ms of state change |
| Database initialization | < 50ms on app startup                   |
| Session record creation | < 10ms to insert                        |
| UI responsiveness       | 60fps timer display (16ms frame budget) |
| Code separation         | Audio/test UIs moved to separate files  |

### 1.3 What's In Scope

- ✅ Timer controller with start/cancel/end
- ✅ SQLite database with migrations
- ✅ Session CRUD operations
- ✅ Timer UI with preset durations
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
            │ invoke: start_timer, end_timer, cancel_timer, etc.
            │ listen: timer-state-changed, timer-heartbeat
┌───────────▼─────────────────────────────────────────────┐
│                  Tauri Rust Core                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         TimerController (AppState)               │   │
│  │  - state: Arc<tokio::sync::Mutex<TimerState>>    │   │
│  │  - ticker_handle: Option<JoinHandle>             │   │
│  │  - db: Arc<Database>                             │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │          Database Module (SQLite)                │   │
│  │  - sessions table                                │   │
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

**Timer Reaches Zero:**

```
Ticker task detects remaining_ms ≤ 0
  ↓
TimerController auto-transitions to Stopped state
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
  - Calculates final active_ms
  - Emits session-completed event (for Phase 5)
```

**Cancelling Early:**

```
User clicks "Cancel"
  ↓
React calls invoke("cancel_timer")
  ↓
TimerController::cancel_timer()
  - Syncs active time
  - Stops ticker task
  - Marks session as Cancelled in DB
  - Emits timer-state-changed event (status=Idle)
```

### 2.3 Crash Handling

**Scenario:** User force-quits app mid-session

**On Restart:**

- Database may contain a session with `status=Running`
- App startup detects any incomplete session and marks it as Interrupted
  ```rust
  if let Some(incomplete) = db.get_incomplete_session().await? {
      let now = Utc::now();
      db.mark_as_interrupted(incomplete.id, now).await?;
      log::warn!("Cleaned up interrupted session {}", incomplete.id);
  }
  ```

**Mark as Interrupted SQL:**

```sql
UPDATE sessions
SET status = 'Interrupted', stopped_at = ?1, updated_at = ?2
WHERE id = ?3;
```

**Heartbeat Persistence (prevents data loss):**

- Ticker task updates DB every 10-15s with latest `active_ms` and `updated_at`
- On crash, DB has snapshot from last heartbeat (≤15s stale)
- **Phase 2 behavior:** Mark as "Interrupted" and keep last snapshot
- **P1 behavior:** Offer soft resume with recovered state

---

## 3. Timer State Machine

### 3.1 States

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TimerStatus {
    Idle,        // No active session
    Running,     // Timer ticking down
    Stopped,     // Timer reached 0, awaiting finalization
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub status: TimerStatus,
    pub session_id: Option<String>,  // UUID as string
    pub target_ms: u64,              // Planned duration (e.g., 1500000 = 25min)
    pub active_ms: u64,              // Completed running time

    // Wall-clock timestamp for persistence
    pub started_at: Option<DateTime<Utc>>,

    // Monotonic time tracking (not serialized, runtime-only)
    #[serde(skip)]
    pub active_ms_baseline: u64,     // active_ms value when current run started
    #[serde(skip)]
    pub running_anchor: Option<Instant>,  // When current running period started
}
```

### 3.2 State Transitions

```
         start_timer
    ┌──────────────────────┐
    │                      ▼
  ┌──────┐            ┌─────────┐
  │ Idle │            │ Running │
  └──────┘            └────┬────┘
                           │
                           │ (Timer reaches 0)
                           ▼
                       ┌─────────┐
                       │ Stopped │
                       └─────────┘

    (User clicks "End")
         Stopped ──────────► Idle
            (finalizes session)

    (User clicks "Cancel")
         Running ──────────► Idle
```

**Valid Transitions:**

- `Idle → Running`: `start_timer(duration_ms)`
- `Running → Stopped`: Auto-trigger when `remaining_ms ≤ 0`
- `Stopped → Idle`: `end_timer()` (user finalizes)
- `Running → Idle`: `cancel_timer()` (abort session, mark as Cancelled)

**Invalid Transitions:**

- `Idle → Stopped`: Timer must run first
- `Stopped → Running`: Requires explicit restart (start a new session)

### 3.3 Time Calculations

**Monotonic Time Anchoring (prevents drift):**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    // ... existing fields ...

    // active_ms stores completed running time; adds anchor for in-flight duration
    pub active_ms: u64,

    // Baseline when current running period started (not serialized)
    #[serde(skip)]
    pub active_ms_baseline: u64,

    // Monotonic anchor for current running period (not serialized)
    #[serde(skip)]
    pub running_anchor: Option<Instant>,  // When current running period started

    // DateTime for wall-clock timestamps (DB persistence)
    pub started_at: Option<DateTime<Utc>>,
}
```

**Remaining Time (displayed in UI):**

```rust
fn get_remaining_ms(state: &TimerState) -> i64 {
    match state.status {
        TimerStatus::Idle | TimerStatus::Stopped => 0,
        TimerStatus::Running => {
            // active_ms + current running period (from anchor)
            let elapsed_this_period = state.running_anchor
                .map(|anchor| anchor.elapsed().as_millis() as u64)
                .unwrap_or(0);

            let total_active = state.active_ms + elapsed_this_period;
            (state.target_ms as i64) - (total_active as i64)
        }
    }
}
```

**Active Time Management:**

```rust
// On start:
state.active_ms = 0;
state.active_ms_baseline = 0;
state.running_anchor = Some(Instant::now());

// On heartbeat/tick (update active_ms for DB persistence):
if let Some(anchor) = state.running_anchor {
    let elapsed = anchor.elapsed().as_millis() as u64;
    state.active_ms = state.active_ms_baseline + elapsed;
}

// On stop/cancel:
state.sync_active_from_anchor();
state.running_anchor = None;
state.active_ms_baseline = state.active_ms;
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
    pub active_ms: u64,        // Actual active time

    // Metadata
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Running,      // Currently active
    Completed,    // User clicked "End", normal completion
    Cancelled,    // User clicked "Cancel" mid-session
    Interrupted,  // App crashed/quit during session
}
```

### 4.2 SessionInfo (Rust - IPC Response Type)

**Purpose:** Lightweight response type for IPC (omits internal metadata like `created_at`, `updated_at`).

**Usage:** Returned by `end_timer()` command and used in frontend display.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub target_ms: u64,
    pub active_ms: u64,
}

// Convenient conversion from Session (strips created_at/updated_at)
impl From<Session> for SessionInfo {
    fn from(session: Session) -> Self {
        SessionInfo {
            id: session.id,
            started_at: session.started_at,
            stopped_at: session.stopped_at,
            status: session.status,
            target_ms: session.target_ms,
            active_ms: session.active_ms,
        }
    }
}
```

**Contract:** `SessionInfo` (Rust) serializes to match `SessionInfo` (TypeScript) exactly.

### 4.3 Frontend Types (TypeScript)

```typescript
// src/types/timer.ts

export type TimerStatus = "Idle" | "Running" | "Stopped";

export interface TimerState {
  status: TimerStatus;
  sessionId: string | null;
  targetMs: number;
  activeMs: number;
  startedAt: string | null; // ISO 8601
}

export interface SessionInfo {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: "Running" | "Completed" | "Cancelled" | "Interrupted";
  targetMs: number;
  activeMs: number;
}

// Preset durations (milliseconds)
export const TIMER_PRESETS = {
  short: 15 * 60 * 1000, // 15 min
  standard: 25 * 60 * 1000, // 25 min (classic Pomodoro)
  long: 45 * 60 * 1000, // 45 min
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
    status TEXT NOT NULL CHECK(status IN ('Running', 'Completed', 'Cancelled', 'Interrupted')),

    -- Time tracking
    target_ms INTEGER NOT NULL,
    active_ms INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL  -- Batch update every 10-15s (not on every tick)
);

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_started_at ON sessions(started_at DESC);

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

### 5.3 Database Access Pattern (Dedicated Thread)

**Critical:** Use a dedicated DB thread with message passing to avoid blocking the async runtime.

```rust
// Database actor pattern
pub struct Database {
    tx: mpsc::Sender<DbCommand>,
}

enum DbCommand {
    CreateSession { session: Session, respond_to: oneshot::Sender<Result<()>> },
    UpdateSession { id: String, active_ms: u64, respond_to: oneshot::Sender<Result<()>> },
    FinalizeSession { id: String, status: SessionStatus, stopped_at: DateTime<Utc>, respond_to: oneshot::Sender<Result<()>> },
    MarkAsInterrupted { session_id: String, stopped_at: DateTime<Utc>, respond_to: oneshot::Sender<Result<()>> },
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        let (tx, mut rx) = mpsc::channel::<DbCommand>(100);

        // Spawn dedicated DB thread
        std::thread::spawn(move || {
            let conn = Connection::open(path).unwrap();
            // Run migrations...

            while let Some(cmd) = rx.blocking_recv() {
                match cmd {
                    DbCommand::CreateSession { session, respond_to } => {
                        let result = conn.execute("INSERT INTO sessions ...", params![...]);
                        let _ = respond_to.send(result.map(|_| ()));
                    }
                    // ... handle other commands
                }
            }
        });

        Ok(Self { tx })
    }

    pub async fn create_session(&self, session: Session) -> Result<()> {
        let (tx, rx) = oneshot::channel();
        self.tx.send(DbCommand::CreateSession { session, respond_to: tx }).await?;
        rx.await?
    }
}
```

### 5.4 Notes for Phase 3 Preparation

**Context readings table:** Will be added in Phase 3 schema migration. Phase 2 only creates the `sessions` table.

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
  remainingMs: number; // Calculated server-side
}

// Periodic heartbeat (every 5-10s while Running)
interface TimerHeartbeatEvent {
  activeMs: number;
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
// On state transitions (start, stop, cancel)
app.emit_all("timer-state-changed", TimerStateChangedEvent {
    state: current_state.clone(),
    remaining_ms: get_remaining_ms(&current_state),
})?;

// Heartbeat (every 10s during Running state)
// Sent from ticker task
app.emit_all("timer-heartbeat", TimerHeartbeatEvent {
    active_ms: state.active_ms,
    remaining_ms: get_remaining_ms(&state),
})?;
```

---

## 7. Frontend Components

### 7.1 File Structure

```
src/
├── App.tsx                     # Main app, routes between views
├── main.tsx                    # App entry, wraps with QueryProvider
├── providers/
│   └── QueryProvider.tsx       # TanStack Query setup
├── components/
│   ├── timer/                  # Timer UI components
│   │   ├── TimerView.tsx       # Main timer component
│   │   ├── TimerDisplay.tsx    # MM:SS countdown display
│   │   ├── TimerControls.tsx   # Start/End/Cancel buttons
│   │   └── DurationPicker.tsx  # Preset duration selector
│   ├── activities/             # Activities/history view
│   │   └── ActivitiesView.tsx  # Session list (Phase 5)
│   ├── session/                # Session results
│   │   ├── SessionResults.tsx  # Post-session summary (Phase 5)
│   │   └── SessionCard.tsx     # Session card in list (Phase 5)
│   ├── segments/               # Segment visualization (Phase 4+)
│   │   ├── SegmentStats.tsx    # Timeline & stats
│   │   ├── SegmentDetailsModal.tsx
│   │   └── SegmentTimeline.tsx
│   └── archived/               # Phase 1 test components
│       ├── AudioView.tsx
│       └── TestView.tsx
├── hooks/
│   ├── queries.ts              # TanStack Query hooks
│   ├── useTimer.ts             # Timer state (real-time, not cached)
│   ├── useTimerSnapshot.ts     # Timer event listener
│   └── useSmoothCountdown.ts   # Animation hook
├── types/
│   ├── timer.ts                # Timer/session TypeScript types
│   └── segment.ts              # Segment types (Phase 4)
└── constants/
    └── appColors.ts            # App color mapping (Phase 4)
```

### 7.2 Requirements & Behavior

**TimerView Component:**

- Uses `useTimer()` hook for real-time timer state (not cached - requires event listeners)
- Uses `useEndTimerMutation()` from TanStack Query for session completion (auto-invalidates sessions cache)
- Shows `DurationPicker` when status=Idle, `TimerDisplay` and `TimerControls` always
- Renders `SessionResults` on completion (fetches segments via TanStack Query)

**Data Fetching Strategy:**

- **Timer state:** Real-time via Tauri events (`useTimerSnapshot` + `useTimer`), not cached
- **Sessions list:** TanStack Query (`useSessionsList`) - cached 60s, auto-refetches on window focus
- **Segments:** TanStack Query (`useSegments`) - cached 30s, parallel fetching with deduplication
- **Mutations:** `useEndTimerMutation` auto-invalidates `['sessions']` query on success

**Key Implementation Notes:**

- TanStack Query handles caching, background refetching, request deduplication
- Timer mutations automatically invalidate relevant queries
- Path aliases (`@/`) used throughout for clean imports

---

## 8. Implementation Guide

### 8.1 Step-by-Step Checklist

#### Step 1: Database Setup

- [x] Create `src-tauri/src/db/` module structure
- [x] Write `schemas/schema_v1.sql` (sessions table)
- [x] Implement `Database` in `connections.rs` with dedicated thread:
  - Create `DbCommand` enum for all DB operations
  - Spawn `std::thread` with `Connection` and `mpsc::Receiver`
  - Public methods send commands via `mpsc::Sender` + await `oneshot` response
  - **Pattern:** Message passing to dedicated thread (no spawn_blocking needed)
- [x] Implement migrations using `PRAGMA user_version` (run on thread startup)
- [x] Add database initialization to app startup
- [x] Test: Verify DB created in Tauri app data directory

#### Step 2: Data Models

- [x] Create `src-tauri/src/db/models/session.rs`
- [x] Implement `Session` and `SessionStatus` structs
- [x] Derive `Serialize`, `Deserialize` for Tauri IPC

#### Step 3: Timer State Machine

- [x] Create `src-tauri/src/timer/mod.rs`
- [x] Implement `TimerState` and `TimerStatus` enums
  - Include `active_ms_baseline: u64` with `#[serde(skip)]`
  - Include `running_anchor: Option<Instant>` with `#[serde(skip)]`
- [x] Implement state transition logic
- [x] Implement time calculation functions:
  - `get_remaining_ms()` - adds `active_ms + anchor.elapsed()` (no double-counting)
  - On start: `active_ms = 0`, `baseline = 0`, `anchor = Some(now)`
  - On tick: `active_ms = baseline + anchor.elapsed()` (for DB write)
  - On stop/cancel: sync from anchor and drop it
- [x] Unit tests for state transitions

#### Step 4: Timer Controller

- [x] Create `src-tauri/src/timer/controller.rs`
- [x] Implement `TimerController` struct with `Arc<tokio::sync::Mutex<TimerState>>`
  - **Important:** Use `tokio::sync::Mutex`, NOT `std::sync::Mutex` (avoids blocking Tokio runtime)
- [x] Implement `start_timer()` method:
  - Create session in DB (await db.create_session() - sends to dedicated thread)
  - Spawn ticker task (tokio::spawn with tokio::time::interval)
  - Store JoinHandle, cancel on any state transition
  - Emit state-changed event
- [x] Implement `end_timer()` method:
  - Cancel ticker task
  - Update session status to Completed, set stopped_at (via DB thread)
  - Emit session-completed event
- [x] Implement `cancel_timer()` method (cancel ticker + mark Cancelled via DB thread)
- [x] Implement ticker task:
  - tokio::time::interval(1s) checks state via `Arc<tokio::sync::Mutex>`
  - On each tick: update `active_ms = baseline + anchor.elapsed()` (monotonic, drift-free)
  - Check if `get_remaining_ms() ≤ 0` → auto-transition to Stopped
  - Emit heartbeat every 10 ticks (10s)
  - Batch DB `updated_at` updates every 10-15s (sent to DB thread, non-blocking)

#### Step 5: Tauri Commands

- [x] Create `src-tauri/src/timer/commands.rs`
- [x] Register all commands in `lib.rs`
- [x] Test commands via Tauri DevTools console

#### Step 6: Frontend Types

- [x] Create `src/types/timer.ts`
- [x] Define TypeScript interfaces matching Rust types
- [x] Define `TIMER_PRESETS` constant

#### Step 7: Frontend Components

- [x] Archive old components to `src/components/archived/`
- [x] Create `TimerDisplay.tsx` (MM:SS display)
- [x] Create `DurationPicker.tsx` (preset buttons)
- [x] Create `TimerControls.tsx` (Start/Cancel/End buttons)
- [x] Create `TimerView.tsx` (main component)
- [x] Update `App.tsx` to render `TimerView`

#### Step 8: State Synchronization

- [x] Add `useTimerSnapshot` hook for initial fetch + state/heartbeat listeners
- [x] Add `useSmoothCountdown` hook (requestAnimationFrame interpolation)
- [x] Timer UI stays in sync without visible jumps (<100 ms drift)

#### Step 9: Crash Handling

- [x] Add `get_incomplete_session()` DB command (finds latest Running session)
- [x] Add `mark_as_interrupted(session_id, stopped_at)` DB command
- [x] Add startup check in `main.rs`:
  - Call `get_incomplete_session()`
  - If present, call `mark_as_interrupted()` with `stopped_at = now`
- [x] Test: Force-quit during Running, restart, verify status=Interrupted

#### Step 10: Manual Testing

- [x] Start 15min timer, verify DB record created
- [x] Let timer complete, verify auto-stop
- [x] Click "End", verify session finalized
- [x] Test cancel mid-session
- [x] Test crash recovery (force quit + restart)

---

## 9. Testing & Acceptance Criteria

### 9.1 Functional Tests (Manual)

**Debug Mode:** Set `LEFOCUS_DEBUG=1` env variable for faster testing:

- Timer durations: 10s instead of minutes
- Heartbeat interval: 1s instead of 10s

| Test Case          | Steps                                   | Expected Result                                                          |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------------ |
| **Start timer**    | Click "25 min" → "Start"                | Session created in DB with status=Running, timer counts down             |
| **Auto-stop**      | Start timer (debug: 10s) → wait         | Timer auto-stops at 0, status=Stopped, UI shows "Complete!"              |
| **End session**    | Auto-stopped timer → click "End"        | Session status=Completed, stopped_at set, UI returns to Idle             |
| **Cancel**         | Start timer → wait 10s → click "Cancel" | Session status=Cancelled, UI returns to Idle                             |
| **Crash recovery** | Start timer → force quit app → restart  | Session marked as Interrupted, `active_ms` from last heartbeat preserved |

### 9.2 Acceptance Criteria

#### ✅ Database

- [x] SQLite file created in Tauri app data directory
- [x] Schema version = 1
- [x] Sessions table has correct columns and indexes

#### ✅ Timer Accuracy

- [x] 25-minute timer completes within ±500ms of 1500 seconds
- [x] Active time persists correctly across heartbeats

#### ✅ State Synchronization

- [x] UI updates within 100ms of Rust state change
- [x] Heartbeat event emitted every 10s (±1s)
- [x] Local animation smooth at 60fps (no jank)

#### ✅ UI/UX

- [x] Duration picker shows 15/25/45 min options
- [x] Timer displays in MM:SS format
- [x] Button states correct for each status (disabled when invalid)
- [x] "Complete!" message shown when timer reaches 0

#### ✅ Code Quality

- [x] Audio/test components moved to `archived/` folder
- [x] No compiler warnings
- [x] All Tauri commands registered and callable
- [x] Database queries use parameterized statements (SQL injection safe)

---

## 10. Open Questions & Decisions

### 10.1 Resolved

| Question              | Decision                      | Rationale                                  |
| --------------------- | ----------------------------- | ------------------------------------------ |
| Timer state location? | Rust (single source of truth) | Simpler sync, accurate server-side time    |
| Pause/resume support? | No, defer to P1               | Simpler state machine, reduced maintenance |
| Database location?    | Tauri app data directory      | Standard path, user-accessible             |
| Migrations now?       | Yes, PRAGMA user_version      | Future-proof, easy to extend               |
| Session finalization? | User must click "End"         | Allows user to review before finalizing    |
| Crash handling?       | Mark as Interrupted           | Enables P1 soft resume feature             |

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
│   ├── mod.rs              # Public API + re-exports
│   ├── connections.rs      # Database struct, thread management
│   ├── migrations.rs       # Migration runner
│   ├── models/
│   │   └── session.rs      # Session, SessionStatus
│   ├── repositories/
│   │   └── sessions.rs     # Session CRUD operations
│   └── schemas/
│       └── schema_v1.sql   # Initial schema
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
INSERT INTO sessions (id, started_at, status, target_ms, active_ms, created_at, updated_at)
VALUES ('uuid-here', '2025-10-22T10:00:00Z', 'Running', 1500000, 0, '2025-10-22T10:00:00Z', '2025-10-22T10:00:00Z');
```

**Update session on end:**

```sql
UPDATE sessions
SET status = 'Completed', stopped_at = '2025-10-22T10:25:00Z', active_ms = 1500000, updated_at = '2025-10-22T10:25:00Z'
WHERE id = 'session-uuid';
```

**Find incomplete sessions on startup:**

```sql
SELECT * FROM sessions
WHERE status = 'Running'
ORDER BY started_at DESC;
```

---

**End of Phase 2 System Design**

**Total sections:** 12
**Estimated implementation time:** 1-2 weeks
**Ready for implementation:** ✅
