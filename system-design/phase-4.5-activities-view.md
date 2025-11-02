# Phase 4.5: Activities View System Design

**Version:** 1.0
**Date:** November 2025
**Author:** Steven Yang
**Status:** Implementation Ready
**Phase:** 4.5 of 6 (P0)

---

## Document Purpose

This document provides detailed implementation specifications for **Phase 4.5** of LeFocus P0: building an Activities view that displays past sessions as browsable cards with timelines, durations, top apps, and status indicators.

**Dependencies:**

- Phase 1 (Swift Plugin) ✅ Complete
- Phase 2 (Timer + Database) ✅ Complete
- Phase 3 (Sensing Pipeline) ✅ Complete
- Phase 4 (Segmentation) ✅ Complete

**Enables:**

- User review of historical focus sessions
- Quick access to past session summaries
- Foundation for future analytics features (P1+)

---

## Table of Contents

1. [Overview & Goals](#1-overview--goals)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [Database Queries](#4-database-queries)
5. [API Contracts](#5-api-contracts)
6. [UI Components](#6-ui-components)
7. [Navigation Flow](#7-navigation-flow)
8. [Implementation Guide](#8-implementation-guide)
9. [Testing & Acceptance Criteria](#9-testing--acceptance-criteria)

---

## 1. Overview & Goals

### 1.1 Phase 4.5 Mission

Build an **Activities history view** that allows users to:

1. Browse past completed and interrupted sessions
2. See session timelines at a glance
3. View top 3 apps per session
4. Click to expand full session details
5. Understand session status (Completed/Interrupted)

### 1.2 Success Criteria

| Criterion                 | Target                                    |
| ------------------------- | ----------------------------------------- |
| Query performance         | < 50ms to fetch all sessions + top apps   |
| Card rendering            | < 100ms to render 20 session cards        |
| Modal open latency        | < 200ms to open expanded view             |
| Empty state handling      | Graceful message when no sessions exist   |
| Status tag clarity        | Clear visual distinction between statuses |

### 1.3 What's In Scope

- ✅ Session list query (completed + interrupted)
- ✅ Top 3 apps aggregation per session
- ✅ SessionCard component with mini timeline
- ✅ ActivitiesView with modal expansion
- ✅ Navigation between Timer and Activities views
- ✅ Status tags (Completed/Interrupted)

### 1.4 What's Out of Scope (Deferred to P1)

- ❌ Pagination (load all for now)
- ❌ Filtering by date range
- ❌ Search functionality
- ❌ Session deletion
- ❌ Export/share sessions
- ❌ Analytics aggregations

---

## 2. Architecture

### 2.1 System Layers

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                         │
│  ┌────────────────┐         ┌──────────────────────┐    │
│  │  TimerView.tsx │◄───────►│ ActivitiesView.tsx   │    │
│  │  (main view)   │ navigate│ (NEW - session list) │    │
│  └────────────────┘         └──────────┬───────────┘    │
│                                        │                 │
│                             ┌──────────▼───────────┐    │
│                             │ SessionCard.tsx      │    │
│                             │ (NEW - card display) │    │
│                             └──────────────────────┘    │
│                                                          │
│  Hook: useSessionsList (NEW)                            │
│        ↓ invoke("list_sessions")                        │
└────────┼────────────────────────────────────────────────┘
         │ Tauri IPC
┌────────▼────────────────────────────────────────────────┐
│                  Tauri Rust Core                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ timer/commands.rs                                 │  │
│  │   - list_sessions() → Vec<SessionSummary> (NEW)  │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │ db/models/session.rs                              │  │
│  │   - SessionSummary struct (NEW)                   │  │
│  │   - TopApp struct (NEW)                           │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │ db/repositories/                                  │  │
│  │   - sessions.rs: list_sessions() (NEW)           │  │
│  │   - segments.rs: get_top_apps_for_session() (NEW)│  │
│  └───────────────────────────────────────────────────┘  │
│                      │                                   │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │ SQLite Database                                   │  │
│  │   - sessions table                                │  │
│  │   - segments table                                │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

**List Sessions:**

```
User clicks "Activities" button
    ↓
ActivitiesView mounts
    ↓
useSessionsList() hook executes
    ↓
invoke("list_sessions")
    ↓
Rust: list_sessions() command
    ↓
DB: Query sessions (Completed + Interrupted)
    ↓
For each session:
    DB: Aggregate segments by bundle_id (top 3)
    ↓
Build SessionSummary
    ↓
Return Vec<SessionSummary> to frontend
    ↓
Render SessionCard for each summary
```

**Expand Session:**

```
User clicks SessionCard
    ↓
ActivitiesView sets selectedSessionId
    ↓
Modal opens with SessionResults component
    ↓
SessionResults fetches full segments (existing flow)
    ↓
Display full timeline + stats
```

---

## 3. Data Models

### 3.1 Rust Backend Models

#### SessionSummary

```rust
/// Summary of a session for the activities list view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub started_at: DateTime<Utc>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub target_ms: u64,
    pub active_ms: u64,
    pub top_apps: Vec<TopApp>,
}
```

#### TopApp

```rust
/// Aggregated app duration for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopApp {
    pub bundle_id: String,
    pub app_name: Option<String>,
    pub duration_secs: u32,
    pub percentage: f64,
}
```

### 3.2 TypeScript Frontend Models

```typescript
interface SessionSummary {
  id: string;
  startedAt: string; // ISO 8601
  stoppedAt: string | null; // ISO 8601
  status: SessionStatus; // "completed" | "interrupted"
  targetMs: number;
  activeMs: number;
  topApps: TopApp[];
}

interface TopApp {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  percentage: number;
}
```

---

## 4. Database Queries

### 4.1 List Sessions Query

**Location:** `src-tauri/src/db/repositories/sessions.rs`

```rust
pub async fn list_sessions(&self) -> Result<Vec<Session>> {
    self.execute(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, started_at, stopped_at, status, target_ms, active_ms, created_at, updated_at
             FROM sessions
             WHERE status IN ('Completed', 'Interrupted')
             ORDER BY started_at DESC"
        )?;

        let sessions = stmt.query_map([], |row| {
            row_to_session(row)
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    })
    .await
}
```

**Characteristics:**

- Excludes `Running` sessions (only show finished sessions)
- Orders newest first (DESC)
- Returns full `Session` structs

### 4.2 Top Apps Aggregation Query

**Location:** `src-tauri/src/db/repositories/segments.rs`

```rust
pub async fn get_top_apps_for_session(
    &self,
    session_id: &str,
    limit: usize,
) -> Result<Vec<TopApp>> {
    let session_id = session_id.to_string();
    self.execute(move |conn| {
        let mut stmt = conn.prepare(
            "SELECT
                bundle_id,
                app_name,
                SUM(duration_secs) as total_duration,
                SUM(duration_secs) * 100.0 / (
                    SELECT SUM(duration_secs)
                    FROM segments
                    WHERE session_id = ?1
                ) as percentage
             FROM segments
             WHERE session_id = ?1
             GROUP BY bundle_id
             ORDER BY total_duration DESC
             LIMIT ?2"
        )?;

        let apps = stmt.query_map(params![session_id, limit], |row| {
            Ok(TopApp {
                bundle_id: row.get("bundle_id")?,
                app_name: row.get("app_name")?,
                duration_secs: row.get::<_, i64>("total_duration")? as u32,
                percentage: row.get("percentage")?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

        Ok(apps)
    })
    .await
}
```

**Characteristics:**

- Groups segments by `bundle_id`
- Calculates total duration per app
- Calculates percentage of total session time
- Returns top N apps (limit parameter)
- Handles sessions with no segments (returns empty Vec)

---

## 5. API Contracts

### 5.1 Tauri Commands

#### list_sessions

**Purpose:** Fetch all completed/interrupted sessions with top apps

**Signature:**

```rust
#[tauri::command]
pub async fn list_sessions(
    state: State<'_, AppState>,
) -> Result<Vec<SessionSummary>, String>
```

**Request:** None (no parameters)

**Response:**

```json
[
  {
    "id": "session-uuid-1",
    "startedAt": "2025-11-02T14:30:00Z",
    "stoppedAt": "2025-11-02T14:55:00Z",
    "status": "completed",
    "targetMs": 1500000,
    "activeMs": 1500000,
    "topApps": [
      {
        "bundleId": "com.microsoft.VSCode",
        "appName": "Visual Studio Code",
        "durationSecs": 900,
        "percentage": 60.0
      },
      {
        "bundleId": "com.google.Chrome",
        "appName": "Google Chrome",
        "durationSecs": 450,
        "percentage": 30.0
      },
      {
        "bundleId": "com.apple.Terminal",
        "appName": "Terminal",
        "durationSecs": 150,
        "percentage": 10.0
      }
    ]
  }
]
```

**Error Cases:**

- Database connection failure → "Failed to fetch sessions"
- Query execution error → "Database query failed"

**Performance:**

- Target: < 50ms for 50 sessions
- Optimization: Single query for sessions, batched top-app queries

---

## 6. UI Components

### 6.1 SessionCard Component

**File:** `src/components/SessionCard.tsx`

**Purpose:** Display a single session summary as a clickable card

**Props:**

```typescript
interface SessionCardProps {
  session: SessionSummary;
  onClick: (sessionId: string) => void;
}
```

**Layout:**

```
┌───────────────────────────────────────────────────┐
│ Nov 2, 2025 • 2:30 PM         [Completed] 25m    │
├───────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░▒▒▒▒▒▒▒▒                 │ ← Mini timeline
├───────────────────────────────────────────────────┤
│ Top Apps:                                         │
│ • Visual Studio Code (15m, 60%)                   │
│ • Google Chrome (7m, 30%)                         │
│ • Terminal (2m, 10%)                              │
└───────────────────────────────────────────────────┘
```

**Styling:**

- Border: `border border-black` (consistent with existing design)
- Hover: `hover:bg-gray-50 cursor-pointer`
- Status tag: `Completed` (green) / `Interrupted` (amber)
- Timeline: Colored bars matching app colors

### 6.2 ActivitiesView Component

**File:** `src/components/ActivitiesView.tsx`

**Purpose:** Main container for session list + modal expansion

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ [← Back to Timer]              Activities       │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ SessionCard 1                             │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ SessionCard 2                             │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ SessionCard 3                             │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

**States:**

1. **Loading:** "Loading sessions..."
2. **Empty:** "No past sessions yet. Complete a focus session to see it here."
3. **Loaded:** Grid of SessionCard components
4. **Error:** Error message + retry button

**Modal:** Reuses existing `SessionResults` component

### 6.3 TimerView Button Addition

**File:** `src/components/TimerView.tsx`

**Change:** Add "Activities" button next to title

```tsx
<div className="flex items-center gap-4">
  <h1 className="text-2xl font-light tracking-wide">LeFocus</h1>
  <button
    className="text-sm font-light border border-black px-3 py-1 hover:bg-black hover:text-white transition-colors"
    onClick={() => onNavigate("activities")}
  >
    Activities
  </button>
</div>
```

---

## 7. Navigation Flow

### 7.1 View State Management

**Location:** `src/App.tsx`

```typescript
type View = "timer" | "activities";

function App() {
  const [currentView, setCurrentView] = useState<View>("timer");

  return (
    <main>
      {currentView === "timer" && (
        <TimerView onNavigate={setCurrentView} />
      )}
      {currentView === "activities" && (
        <ActivitiesView onNavigate={setCurrentView} />
      )}
    </main>
  );
}
```

### 7.2 Navigation Triggers

1. **Timer → Activities:** Click "Activities" button
2. **Activities → Timer:** Click "Back to Timer" button
3. **Session completes → Results modal:** (existing flow, unchanged)
4. **Results modal → Timer:** Close modal, return to timer view

---

## 8. Implementation Guide

### 8.1 Backend Implementation Order

1. **Add `TopApp` struct to `db/models/session.rs`**
   - Simple struct with 4 fields
   - Add `Serialize` derive

2. **Add `SessionSummary` struct to `db/models/session.rs`**
   - Embed `TopApp` Vec
   - Add conversion from `Session` + `Vec<TopApp>`

3. **Implement `list_sessions()` in `db/repositories/sessions.rs`**
   - Query sessions table
   - Filter by status
   - Order by started_at DESC

4. **Implement `get_top_apps_for_session()` in `db/repositories/segments.rs`**
   - Aggregate query with SUM + GROUP BY
   - Calculate percentages
   - Limit to top N

5. **Add `list_sessions` command in `timer/commands.rs`**
   - Fetch sessions from DB
   - For each session, fetch top 3 apps
   - Build SessionSummary structs
   - Return Vec

6. **Register command in `lib.rs`**
   - Add to `invoke_handler!` macro

### 8.2 Frontend Implementation Order

1. **Add TypeScript types in `types/timer.ts`**
   - `SessionSummary` interface
   - `TopApp` interface

2. **Create `useSessionsList` hook in `hooks/useSessionsList.ts`**
   - Call `invoke("list_sessions")`
   - Handle loading/error states
   - Return sessions array

3. **Create `SessionCard` component in `components/SessionCard.tsx`**
   - Accept session + onClick props
   - Render mini timeline (reuse logic from SegmentTimeline)
   - Format date/time nicely
   - Show top 3 apps
   - Add status tag

4. **Create `ActivitiesView` component in `components/ActivitiesView.tsx`**
   - Use `useSessionsList` hook
   - Render SessionCard grid
   - Handle empty/loading/error states
   - Modal with SessionResults on click

5. **Update `App.tsx` for navigation**
   - Add view state
   - Render conditionally
   - Pass navigation callbacks

6. **Update `TimerView.tsx`**
   - Add Activities button
   - Accept `onNavigate` prop
   - Trigger navigation on click

### 8.3 Testing Checklist

- [ ] Backend: `list_sessions` returns correct sessions
- [ ] Backend: `get_top_apps_for_session` aggregates correctly
- [ ] Backend: Empty sessions list handled gracefully
- [ ] Backend: Session with no segments returns empty topApps
- [ ] Frontend: SessionCard renders all info correctly
- [ ] Frontend: Timeline bar shows correct proportions
- [ ] Frontend: Status tags display correct colors
- [ ] Frontend: Modal opens with full session details
- [ ] Frontend: Navigation works in both directions
- [ ] Frontend: Empty state displays helpful message

---

## 9. Testing & Acceptance Criteria

### 9.1 Unit Tests

**Rust:**

```rust
#[tokio::test]
async fn test_get_top_apps_for_session() {
    let db = setup_test_db().await;
    let session_id = create_test_session(&db).await;

    // Create 3 segments with different apps
    create_segment(&db, &session_id, "com.microsoft.VSCode", 600).await;
    create_segment(&db, &session_id, "com.google.Chrome", 300).await;
    create_segment(&db, &session_id, "com.apple.Terminal", 100).await;

    let top_apps = db.get_top_apps_for_session(&session_id, 3).await.unwrap();

    assert_eq!(top_apps.len(), 3);
    assert_eq!(top_apps[0].bundle_id, "com.microsoft.VSCode");
    assert_eq!(top_apps[0].duration_secs, 600);
    assert_eq!(top_apps[0].percentage, 60.0);
}

#[tokio::test]
async fn test_list_sessions_excludes_running() {
    let db = setup_test_db().await;
    create_session(&db, SessionStatus::Running).await;
    create_session(&db, SessionStatus::Completed).await;
    create_session(&db, SessionStatus::Interrupted).await;

    let sessions = db.list_sessions().await.unwrap();

    assert_eq!(sessions.len(), 2); // Only completed + interrupted
    assert!(sessions.iter().all(|s| s.status != SessionStatus::Running));
}
```

### 9.2 Integration Tests

**Manual Testing:**

1. **Empty state:**
   - Fresh install → Activities view shows "No past sessions"

2. **Single session:**
   - Complete one session
   - Navigate to Activities
   - Verify card shows correct data

3. **Multiple sessions:**
   - Complete 5 sessions
   - Verify all appear in list
   - Verify newest first

4. **Session without segments:**
   - Cancel session immediately after start
   - Verify card shows "No apps tracked"

5. **Modal expansion:**
   - Click session card
   - Verify modal shows full timeline
   - Verify "Back" returns to list

6. **Navigation:**
   - Timer → Activities → Timer
   - Verify state preserved

### 9.3 Acceptance Criteria

| Criterion                     | Pass Condition                                  |
| ----------------------------- | ----------------------------------------------- |
| All sessions displayed        | Completed + Interrupted sessions visible        |
| Correct ordering              | Newest sessions first                           |
| Top apps accuracy             | Durations and percentages add up correctly      |
| Timeline proportions          | Visual timeline matches segment durations       |
| Status tags                   | Correct color + text for each status            |
| Modal expansion               | Full session details load within 200ms          |
| Empty state                   | Helpful message when no sessions exist          |
| Navigation                    | Smooth transition between views                 |
| Performance                   | List renders in < 100ms for 20 sessions         |

---

## 10. Future Enhancements (P1+)

### 10.1 Pagination

- Show 20 sessions per page
- "Load more" button or infinite scroll
- Query optimization with LIMIT/OFFSET

### 10.2 Filtering

- Date range picker (last 7 days, 30 days, all time)
- Status filter (show only Completed)
- App filter (show sessions with specific app)

### 10.3 Analytics Aggregations

- Total focus time this week
- Most used apps
- Longest focus streak
- Focus time by day of week

### 10.4 Session Management

- Delete individual sessions
- Export session data (JSON/CSV)
- Session notes/tags

---

**End of Phase 4.5 System Design Document**

Total sections: 10
Target audience: Implementation agents, code reviewers

