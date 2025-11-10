# Phase 6 UX: App Icons & Apps Table

**Version:** 2.1 (Added Icon Color Extraction)
**Date:** November 2025
**Status:** Implemented
**Dependencies:** Phase 4.5 (Activities View), Schema V6

---

## Document Purpose

This document specifies the design for **app icon display** and introduces the **`apps` table** - a simple database table for storing app metadata and icons.

**Key Architectural Decision:**
Instead of caching icons in React state (ephemeral), we store them in a persistent `apps` table. This table becomes the **single source of truth** for app metadata and icon caching.

**Goals:**
1. Display native macOS app icons in SessionResults and Activities view
2. Persist icons in database (survive app restarts, faster than FFI re-fetching)
3. Extract and store dominant colors from app icons for progress bar theming
4. Simple schema focused on Phase 6 needs only

**Success Criteria:**
- Initial render: < 100ms (unchanged)
- Icon display: instant from DB cache, < 50ms FFI fallback
- Schema migration: backward compatible, auto-backfill

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Apps Table Schema](#2-apps-table-schema)
3. [Icon Storage Strategy](#3-icon-storage-strategy)
4. [Database Operations](#4-database-operations)
5. [Migration & Backfill](#5-migration--backfill)
6. [FFI Layer (Icon Fetching)](#6-ffi-layer-icon-fetching)
7. [React Integration](#7-react-integration)
8. [Implementation Guide](#8-implementation-guide)

---

## 1. Architecture Overview

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Frontend                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  SessionResults / ActivitiesView                          │  │
│  │    → Render app icons from DB                             │  │
│  └─────────────────┬─────────────────────────────────────────┘  │
│                    │ invoke("list_sessions")                     │
└────────────────────┼─────────────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────────────┐
│                    Tauri Rust Core                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  list_sessions() command                                  │  │
│  │    1. Fetch sessions                                      │  │
│  │    2. Fetch segments → extract bundle IDs                 │  │
│  │    3. JOIN with apps table → hydrate app metadata         │  │
│  │    4. Return { sessions, app_icon_map }                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AppRepository (new)                                      │  │
│  │    - ensure_app_exists(bundle_id, app_name)               │  │
│  │    - get_app(bundle_id) → App                             │  │
│  │    - update_icon(bundle_id, icon_data_url)                │  │
│  │    - get_apps_with_missing_icons() → Vec<App>             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Database (SQLite)                                        │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  apps table                                        │  │  │
│  │  │  - id (PK)                                         │  │  │
│  │  │  - bundle_id (UNIQUE)                              │  │  │
│  │  │  - app_name                                        │  │  │
│  │  │  - icon_data_url (base64 PNG, nullable)           │  │  │
│  │  │  - icon_color (hex color, nullable)               │  │  │
│  │  │  - icon_fetched_at                                 │  │  │
│  │  │  - created_at, updated_at                          │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────┬──────────────────────────────────────────────┘
                     │ FFI (only if icon missing)
┌────────────────────▼──────────────────────────────────────────────┐
│              Swift Plugin (MacOSSensing)                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AppIconProvider.swift                                    │  │
│  │    - Fetches icon via NSWorkspace (main thread)           │  │
│  │    - Extracts dominant color from icon pixels             │  │
│  │    - Returns base64 PNG data URL + hex color              │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow

**Session End Flow (Icon Population):**
```
1. User ends session
   ↓
2. Segmentation runs → creates segments with bundle_id
   ↓
3. For each bundle_id in segments:
   a. AppRepository::ensure_app_exists(bundle_id, app_name)
   b. save_segment_to_db()
   c. If app.icon_data_url is NULL, add bundle_id to `missing_icon_set`
   ↓
4. After commit: spawn one background job per unique bundle_id in `missing_icon_set`
   - FFI fetch icon and extract color
   - update apps.icon_data_url + icon_color + icon_fetched_at
```

**Activities View Load (Icon Display):**
```
1. User clicks "Activities"
   ↓
2. invoke("list_sessions") → ~50ms
   ↓
3. Rust query:
   - Fetch sessions + topApps aggregate (existing)
   - LEFT JOIN apps once per unique bundle_id → build `AppIconMap`
   ↓
4. Return `{ sessions, app_icon_map }`
   ↓
5. React renders SessionCards with `app_icon_map[bundleId]` (no async fetch needed)
   ↓
6. SessionResults (`useSegments`) also JOINs apps to get per-segment icons
```

**Icon Missing Fallback:**
```
IF apps.icon_data_url IS NULL:
  1. Show colored box (existing fallback)
  2. Background job: fetch icon + color via FFI
  3. Update apps.icon_data_url + icon_color
  4. Next render: icon appears

IF apps.icon_color IS NULL (but icon_data_url exists):
  1. Use hardcoded color map or confidence-based color
  2. Background job: extract color from existing icon
  3. Update apps.icon_color
  4. Next render: progress bars use extracted color
```

---

## 2. Apps Table Schema

### 2.1 Schema Definition

**File:** `src-tauri/src/db/schemas/schema_v7.sql` (initial)
**File:** `src-tauri/src/db/schemas/schema_v8.sql` (adds icon_color)

```sql
-- Migration to version 7: Add apps table for app metadata and icons

CREATE TABLE apps (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- App identity
    bundle_id TEXT NOT NULL UNIQUE,
    app_name TEXT,

    -- Icon storage (base64 PNG data URL)
    icon_data_url TEXT,  -- "data:image/png;base64,iVBORw0KGgo..." or NULL
    icon_fetched_at TEXT,  -- ISO 8601 timestamp of last fetch

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for bundle_id lookups
CREATE INDEX idx_apps_bundle_id ON apps(bundle_id);
```

```sql
-- Migration to version 8: Add icon_color column to apps table

-- Add icon_color column to store extracted dominant color from app icons
ALTER TABLE apps ADD COLUMN icon_color TEXT;
```

### 2.2 Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `id` | TEXT PK | UUID primary key |
| `bundle_id` | TEXT UNIQUE | Unique app identifier (e.g., "com.microsoft.VSCode") |
| `app_name` | TEXT | Display name (e.g., "Visual Studio Code") |
| `icon_data_url` | TEXT NULL | Base64-encoded PNG data URL from NSWorkspace |
| `icon_color` | TEXT NULL | Hex color string (e.g., "#AABBCC") extracted from icon |
| `icon_fetched_at` | TEXT NULL | Timestamp of last icon fetch |
| `created_at` | TEXT | Row creation timestamp |
| `updated_at` | TEXT | Row last modified timestamp |

### 2.3 Example Rows

```sql
INSERT INTO apps VALUES (
    'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',  -- id (UUID)
    'com.microsoft.VSCode',                   -- bundle_id
    'Visual Studio Code',                     -- app_name
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',  -- icon_data_url
    '#4A5F7A',                                -- icon_color (extracted dominant color)
    '2025-11-08T14:23:45Z',                   -- icon_fetched_at
    '2025-10-01T10:00:00Z',                   -- created_at
    '2025-11-08T14:23:45Z'                    -- updated_at
);
```

---

## 3. Icon Storage Strategy

### 3.1 Why Store Icons in DB?

**Compared to React Cache (Old Approach):**

| Aspect | React Cache | DB Storage |
|--------|-------------|------------|
| Persistence | Lost on app restart | Persists forever |
| Initial load | Need FFI fetch (~50ms/icon) | Instant from DB |
| Memory usage | ~2-5 MB in RAM | 0 MB in RAM (disk) |
| Shared across views | No (per-component state) | Yes (global) |
| Cache invalidation | Complex (manual) | Simple (timestamp) |

**Decision:** Store in DB for better UX and simpler architecture.

### 3.2 Icon Data Format

**Format:** Base64-encoded PNG wrapped in data URL
**Example:** `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0...`

**Size:** ~10-20 KB per icon (32x32 PNG, optimized)

**Storage Impact:**
- 100 apps × 20 KB = 2 MB (negligible for SQLite)
- 1000 apps × 20 KB = 20 MB (still acceptable)

### 3.3 Icon Fetch Priority

**Priority 1: DB Cache (Instant)**
```rust
// In list_sessions()
let mut app_icon_map = HashMap::new();
for bundle_id in unique_bundle_ids {
    let icon = app_repo.get_app(&bundle_id)?.and_then(|app| app.icon_data_url);
    app_icon_map.insert(bundle_id.clone(), icon);
}
```

**Priority 2: FFI Fetch (Background)**
```rust
if app_icon_map.get(&bundle_id).and_then(|icon| icon.clone()).is_none() {
    missing_icon_set.insert(bundle_id.clone());
}
```

**Priority 3: Colored Box (Fallback)**
```typescript
const iconDataUrl = appIcons[bundleId] ?? null;
const iconColor = appColors[bundleId] ?? null;
return iconDataUrl ? (
  <img src={iconDataUrl} alt="" />
) : (
  <div style={{ backgroundColor: getAppColor(bundleId, { iconColor }) }} />
);
```

**Color Priority (for progress bars):**
1. Extracted `icon_color` from database (preferred)
2. Hardcoded color map (`appColors.ts`)
3. Confidence-based color (for unknown apps)
4. Default gray fallback

### 3.4 Icon Cache Invalidation

**Strategy:** Icons are cached indefinitely. Apps rarely update icons. If needed in the future, implement a background job to refresh icons older than 30 days.

---

## 4. Database Operations

### 4.1 AppRepository API

**File:** `src-tauri/src/db/repositories/apps.rs` (new file)

```rust
use crate::db::models::App;
use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};

pub struct AppRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AppRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// Ensure app exists in DB (upsert pattern)
    pub fn ensure_app_exists(&self, bundle_id: &str, app_name: Option<&str>) -> Result<()> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn.execute(
            "INSERT INTO apps (id, bundle_id, app_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(bundle_id) DO UPDATE SET
                 app_name = COALESCE(excluded.app_name, apps.app_name),
                 updated_at = excluded.updated_at",
            params![id, bundle_id, app_name, now],
        )?;
        Ok(())
    }

    /// Get app metadata (including icon)
    pub fn get_app(&self, bundle_id: &str) -> Result<Option<App>> {
        self.conn
            .query_row(
                "SELECT id, bundle_id, app_name, icon_data_url, icon_color, icon_fetched_at
                 FROM apps WHERE bundle_id = ?1",
                params![bundle_id],
                |row| {
                    Ok(App {
                        id: row.get(0)?,
                        bundle_id: row.get(1)?,
                        app_name: row.get(2)?,
                        icon_data_url: row.get(3)?,
                        icon_fetched_at: row
                            .get::<_, Option<String>>(4)?
                            .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                            .map(|dt| dt.with_timezone(&Utc)),
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    /// Update app icon and color
    pub fn update_icon(&self, bundle_id: &str, icon_data_url: &str, icon_color: Option<&str>) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE apps SET icon_data_url = ?1, icon_color = ?2, icon_fetched_at = ?3, updated_at = ?3
             WHERE bundle_id = ?4",
            params![icon_data_url, icon_color, now, bundle_id],
        )?;
        Ok(())
    }

    /// Check if app has a color
    pub fn has_color(&self, bundle_id: &str) -> Result<bool> {
        let result: Option<bool> = self
            .conn
            .query_row(
                "SELECT icon_color IS NOT NULL AND icon_color != '' FROM apps WHERE bundle_id = ?1",
                params![bundle_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(result.unwrap_or(false))
    }

    /// Get apps with missing icons (for background fetch)
    pub fn get_apps_with_missing_icons(&self) -> Result<Vec<App>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, bundle_id, app_name, icon_data_url, icon_fetched_at
             FROM apps
             WHERE icon_data_url IS NULL",
        )?;

        let apps = stmt
            .query_map([], |row| {
                Ok(App {
                    id: row.get(0)?,
                    bundle_id: row.get(1)?,
                    app_name: row.get(2)?,
                    icon_data_url: row.get(3)?,
                    icon_fetched_at: row
                        .get::<_, Option<String>>(4)?
                        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&Utc)),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(apps)
    }
}
```

### 4.2 Integration with Segmentation

**When segments are created, update apps table:**

```rust
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::Mutex;

static IN_FLIGHT_ICON_FETCHES: Lazy<Mutex<HashSet<String>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));

// In segmentation/algorithm.rs or wherever segments are saved

pub async fn save_segments(db: &Database, segments: Vec<Segment>) -> Result<()> {
    let conn = db.conn.lock().await;
    let tx = conn.transaction()?;
    let app_repo = AppRepository::new(&tx);
    let mut bundles_missing_icons = std::collections::HashSet::new();

    for segment in &segments {
        app_repo.ensure_app_exists(
            &segment.bundle_id,
            segment.app_name.as_deref(),
        )?;

        save_segment_to_db(&tx, segment)?;

        if let Some(app) = app_repo.get_app(&segment.bundle_id)? {
            if app.icon_data_url.is_none() {
                bundles_missing_icons.insert(segment.bundle_id.clone());
            }
        }
    }

    tx.commit()?;

    // Background icon fetch for missing icons
    if !bundles_missing_icons.is_empty() {
        let db_clone = db.clone();
        tokio::spawn(async move {
            for bundle_id in bundles_missing_icons {
                if IN_FLIGHT_ICON_FETCHES.lock().unwrap().insert(bundle_id.clone()) {
                    if let Some((icon, color)) = macos_bridge::get_app_icon_and_color(&bundle_id) {
                        let color_opt = if color.is_empty() { None } else { Some(color.as_str()) };
                        if let Err(err) = db_clone.update_app_icon(&bundle_id, &icon, color_opt).await {
                            log::warn!("Failed to store icon for {}: {}", bundle_id, err);
                        }
                    } else {
                        log::warn!("App icon fetch returned None for {}", bundle_id);
                    }
                    IN_FLIGHT_ICON_FETCHES.lock().unwrap().remove(&bundle_id);
                }
            }
        });
    }

    Ok(())
}
```

---

## 5. Migration & Backfill

### 5.1 Migration SQL

**File:** `src-tauri/src/db/schemas/schema_v7.sql` (initial apps table)
**File:** `src-tauri/src/db/schemas/schema_v8.sql` (adds icon_color)

```sql
-- Migration to version 7: Add apps table for app metadata and icons

CREATE TABLE apps (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- App identity
    bundle_id TEXT NOT NULL UNIQUE,
    app_name TEXT,

    -- Icon storage (base64 PNG data URL)
    icon_data_url TEXT,
    icon_fetched_at TEXT,

    -- Metadata
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Index for bundle_id lookups
CREATE INDEX idx_apps_bundle_id ON apps(bundle_id);

-- Backfill apps table from existing segments
INSERT INTO apps (
    id,
    bundle_id,
    app_name,
    created_at,
    updated_at
)
SELECT
    lower(hex(randomblob(16))) as id,
    bundle_id,
    MAX(app_name) as app_name,
    datetime('now') as created_at,
    datetime('now') as updated_at
FROM segments
GROUP BY bundle_id;
```

### 5.2 Migration Code

**Update:** `src-tauri/src/db/migrations.rs`

```rust
const CURRENT_SCHEMA_VERSION: i32 = 8;  // Bump from 7 to 8 (added icon_color)

fn apply_migration(tx: &Transaction<'_>, version: i32) -> Result<()> {
    match version {
        // ... existing migrations 1-6
        7 => {
            tx.execute_batch(include_str!("schemas/schema_v7.sql"))
                .context("failed to execute schema_v7.sql")?;
            Ok(())
        }
        8 => {
            tx.execute_batch(include_str!("schemas/schema_v8.sql"))
                .context("failed to execute schema_v8.sql")?;
            Ok(())
        }
        _ => bail!("unknown migration target version: {version}"),
    }
}
```

### 5.3 Post-Migration Icon Fetch

**After migration, fetch icons for all backfilled apps:**

```rust
// In app startup (after migrations run)
pub async fn backfill_missing_icons(db: &Database) -> Result<()> {
    let apps_without_icons = db.get_apps_with_missing_icons().await?;

    log::info!("Backfilling icons for {} apps", apps_without_icons.len());

    for app in apps_without_icons {
        if let Some((icon, color)) = macos_bridge::get_app_icon_and_color(&app.bundle_id) {
            let color_opt = if color.is_empty() { None } else { Some(color.as_str()) };
            db.update_app_icon(&app.bundle_id, &icon, color_opt).await?;
        }

        // Rate limit: 20ms per icon to avoid blocking main thread
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    Ok(())
}
```

---

## 6. FFI Layer (Icon Fetching & Color Extraction)

### 6.1 Swift Implementation

**File:** `src-tauri/plugins/macos-sensing/Sources/MacOSSensing/AppIconProvider.swift`

The Swift implementation includes:
- Icon fetching via NSWorkspace
- Dominant color extraction from icon pixels
- Returns both icon data URL and hex color

**Key Methods:**

```swift
/// Extract dominant color from an NSImage
/// Filters out black, white, and transparent pixels, then finds the most common color cluster
private func extractDominantColor(from image: NSImage) -> String? {
    // 1. Sample all pixels from the 32x32 icon
    // 2. Filter out transparent, very dark (< 20 brightness), and very light (> 235 brightness) pixels
    // 3. Separate colorful pixels (maxDiff >= 15 RGB units) from grayscale
    // 4. Cluster similar colors together
    // 5. Return the largest colorful cluster's average color as hex
    // 6. Fallback: if no colorful pixels, use most common non-black/white color
}

/// Get app icon data and dominant color
public func getIconDataAndColor(forBundleId bundleId: String) -> (icon: String, color: String)? {
    // Fetch icon, resize to 32x32, extract color
    // Returns tuple: (icon_data_url, hex_color) or nil
}
```

**FFI Export:**

```swift
@_cdecl("macos_sensing_swift_get_app_icon_and_color")
public func getAppIconAndColorFFI(bundleIdPtr: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    // Returns JSON: {"icon": "data:image/png;base64,...", "color": "#AABBCC"}
    // Must run on main thread (AppKit requirement)
}
```

### 6.2 Rust Bridge

**File:** `src-tauri/src/macos_bridge.rs`

```rust
extern "C" {
    fn macos_sensing_swift_get_app_icon_and_color(bundle_id: *const c_char) -> *mut c_char;
    fn macos_sensing_swift_free_string(ptr: *mut c_char);
}

/// Get app icon and dominant color
/// Returns tuple of (icon_data_url, icon_color) where color may be empty string if extraction failed
pub fn get_app_icon_and_color(bundle_id: &str) -> Option<(String, String)> {
    unsafe {
        // Call FFI, parse JSON response, return (icon, color)
    }
}
```

**Note:** The old `get_app_icon_data()` function is deprecated and commented out. All icon fetching now uses `get_app_icon_and_color()`.

---

## 7. React Integration

### 7.1 Type Changes

```typescript
export interface TopApp {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  percentage: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
  topApps: TopApp[];
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  status: SessionStatus;
  targetMs: number;
  activeMs: number;
  topApps: TopApp[];
  appIcons: Record<string, string | null>; // Unique bundleId -> icon data URL
  appColors: Record<string, string | null>; // Unique bundleId -> icon color (hex)
}

export interface Segment {
  // existing fields...
  bundleId: string;
  appName: string | null;
  iconDataUrl?: string | null; // populated by useSegments() JOIN
  iconColor?: string | null; // populated by useSegments() JOIN
}

export interface AppDuration {
  bundleId: string;
  appName: string | null;
  durationSecs: number;
  percentage: number;
  iconDataUrl?: string | null;
  iconColor?: string | null; // extracted color from icon
}
```

`appIcons` deduplicates icon payloads across every card, so Activities still transfers ~tens of kilobytes even if the same app shows up in dozens of sessions.

### 7.2 Component Changes

**AppIcon component (unchanged API, still accepts `iconDataUrl`):**
```typescript
<AppIcon
  bundleId={bundleId}
  iconDataUrl={appIcons[bundleId] ?? null}
  size={12}
/>
```

**SessionCard usage:**
```typescript
{session.topApps.map((app) => (
  <div key={app.bundleId} className="flex items-center gap-2">
    <AppIcon
      bundleId={app.bundleId}
      iconDataUrl={appIcons[app.bundleId] ?? null}
      size={12}
    />
    <span>{app.appName || app.bundleId}</span>
  </div>
))}
```

**SessionResults / SegmentStats:**
- `useSegments(sessionId)` now returns segments with `iconDataUrl` and `iconColor`.
- `SegmentStats` and `SegmentDetailsModal` pass `segment.iconDataUrl` into `AppIcon`, so post-session timelines share the same icons as Activities.
- Progress bars use `getAppColor(bundleId, { iconColor: segment.iconColor })` to prioritize extracted colors.

**Color Usage:**
```typescript
// Progress bar color priority:
const barColor = getAppColor(app.bundleId, {
  iconColor: app.iconColor,  // 1. Extracted from icon (preferred)
  confidence: segment.confidence  // 3. Fallback to confidence-based
});
// Falls back to hardcoded map, then default gray
```

**No async fetching needed** – icons and colors arrive with the initial payloads (`appIcons`/`appColors` maps for Activities, inline on segments for SessionResults).

---

## 8. Implementation Guide

### 8.1 Implementation Order

**Phase 1: Schema & Migration (1-2 hours)**
1. Create `schema_v7.sql`
2. Update `migrations.rs` (bump to version 7)
3. Run migration, verify backfill
4. Test on existing DB

**Phase 2: Repository Layer (2-3 hours)**
1. Create `src-tauri/src/db/repositories/apps.rs`
2. Implement `AppRepository` methods
3. Add `Database::apps()` helper
4. Unit tests

**Phase 3: Segmentation Integration (1 hour)**
1. Update segment save flow to call `ensure_app_exists()`
2. Background icon fetch job for missing icons

**Phase 4: Icon Fetching & Color Extraction (Swift/Rust) (3-4 hours)**
1. Swift `AppIconProvider.swift` with color extraction algorithm
2. FFI exports with main thread dispatch (`get_app_icon_and_color`)
3. Rust `macos_bridge::get_app_icon_and_color()` JSON parsing
4. Test FFI roundtrip and color extraction accuracy

**Phase 5: Update Queries (2-3 hours)**
1. Modify `list_sessions()` to JOIN with apps table
2. Return `{ sessions, app_icons, app_colors }` (unique icons/colors only)
3. Extend `list_segments()` JOIN to emit `segment.icon_data_url` and `segment.icon_color`
4. Update `get_app_icons_for_bundle_ids()` to return tuples of `(icon, color)`
5. Test query performance

**Phase 6: React Updates (2 hours)**
1. Update Activities data hook to read `{ sessions, appIcons, appColors }`
2. Simplify `AppIcon` component (no cache hook)
3. Update `SessionCard` and `SegmentStats` to pull icons from `appIcons`/`segment.iconDataUrl`
4. Update `getAppColor()` to prioritize `iconColor` from database
5. Update all components to pass `iconColor` to `getAppColor()`
6. Remove old React cache code

**Phase 7: Post-Migration Icon Backfill (1 hour)**
1. Add startup job to fetch missing icons
2. Rate-limited background fetch
3. Progress logging

**Total Estimate:** 12-15 hours (includes color extraction feature)

### 8.2 Testing Checklist

**Schema:**
- [ ] Migration runs successfully on fresh DB
- [ ] Migration runs successfully on existing DB with segments
- [ ] Backfill populates apps table correctly
- [ ] Indexes created properly

**Repository:**
- [ ] `ensure_app_exists()` creates new apps
- [ ] `ensure_app_exists()` updates existing apps (upsert)
- [ ] `get_app()` returns correct data
- [ ] `update_icon()` persists icon
- [ ] `get_apps_with_missing_icons()` returns apps without icons

**Icon Fetching & Color Extraction:**
- [ ] Swift FFI returns valid base64 PNG
- [ ] Swift FFI returns null for missing apps
- [ ] Color extraction returns valid hex colors for colorful icons
- [ ] Color extraction falls back to grayscale for monochrome icons
- [ ] Main thread dispatch prevents crashes
- [ ] Icon + color fetched on first segment creation
- [ ] Icon + color cached in DB on subsequent loads
- [ ] Existing icons get colors backfilled when app is used again

**Query Performance:**
- [ ] `list_sessions()` with icons: < 100ms

**React:**
- [ ] Icons display in SessionResults
- [ ] Icons display in ActivitiesView
- [ ] Progress bars use extracted icon colors
- [ ] Color fallback chain works (iconColor → hardcoded → confidence → default)
- [ ] Colored box fallback works
- [ ] No layout shift on icon load

---

## Appendix: File Manifest

### New Files

**SQL:**
- `src-tauri/src/db/schemas/schema_v7.sql` (~35 lines) - initial apps table
- `src-tauri/src/db/schemas/schema_v8.sql` (~4 lines) - adds icon_color column

**Rust:**
- `src-tauri/src/db/repositories/apps.rs` (~90 lines)
- `src-tauri/src/db/models/app.rs` (~12 lines)

**Swift:**
- `src-tauri/plugins/macos-sensing/Sources/MacOSSensing/AppIconProvider.swift` (~240 lines) - includes color extraction

**React:**
- No new files (simplifies existing components)

### Modified Files

**Rust:**
- `src-tauri/src/db/migrations.rs` (+15 lines - adds v8 migration)
- `src-tauri/src/db/repositories/mod.rs` (+1 export)
- `src-tauri/src/db/repositories/apps.rs` (+30 lines - color support)
- `src-tauri/src/db/models/app.rs` (+1 field - icon_color)
- `src-tauri/src/db/models/segment.rs` (+1 field - icon_color)
- `src-tauri/src/segmentation/algorithm.rs` (~20 lines - app upsert)
- `src-tauri/src/timer/commands.rs` (~40 lines - JOIN apps table, return colors)
- `src-tauri/src/macos_bridge.rs` (+30 lines - FFI wrapper for icon+color)
- `src-tauri/src/sensing/icon_manager.rs` (~20 lines - color backfill logic)

**React:**
- `src/types/timer.ts` (add `appColors` to `SessionSummary`)
- `src/types/segment.ts` (add `iconColor` to `Segment`, `AppDuration`)
- `src/constants/appColors.ts` (~15 lines - update `getAppColor()` to use iconColor)
- `src/components/session/AppIcon.tsx` (simplified, -30 lines)
- `src/components/session/SessionCard.tsx` (~15 lines - use iconColor)
- `src/components/segments/SegmentStats.tsx` (~20 lines - use iconColor)
- `src/components/segments/SegmentTimeline.tsx` (~5 lines - use iconColor)
- `src/components/segments/SegmentDetailsModal.tsx` (~5 lines - use iconColor)
- `src/hooks/useSegments.ts` (~10 lines - aggregate iconColor)

**Total LOC:** ~350 new, ~150 modified

---

**End of Phase 6 UX: App Icons & Apps Table Design**

**Version:** 2.1
**Total Lines:** ~900
**Key Innovation:** 
- Apps table as single source of truth for app metadata and icon caching
- Dominant color extraction from app icons for dynamic progress bar theming
**Performance:** Instant icon display from DB cache, < 50ms FFI fallback, scalable to 1000+ apps
**Color Extraction:** Analyzes icon pixels to extract dominant colors, falls back gracefully for monochrome icons
