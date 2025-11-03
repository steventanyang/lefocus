# LeFocus System Design: P1 - App Configs & Custom Logos

**Document Version:** 1.0
**Last Updated:** 2025-11-03
**Status:** Planning
**Related:** [system-design-p0.md](./system-design-p0.md)

---

## Overview

This document specifies the **App Configs & Custom Logos** feature, allowing users to personalize how applications appear in LeFocus. Users can draw custom logos using an MS Paint-style sketch canvas and configure per-app settings like colors. This enhances the visual identity of the app and provides a more personalized, artsy aesthetic.

### Goals

- Enable users to sketch custom logos for any detected application
- Store per-app configuration (logo, color) with extensibility for future settings (tags, etc.)
- Display custom logos throughout the UI wherever app names appear
- Provide intuitive drawing tools with SVG export for scalable, crisp rendering

### Non-Goals (Future Work)

- Advanced drawing features (layers, gradients, fills) - v1 focuses on simple stroke-based drawing
- Logo templates or marketplace - users create from scratch
- Bulk import/export of app configs
- Tag system (mentioned for schema design, implementation deferred)

---

## Architecture Overview

### Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐  ┌──────────────────────────────┐  │
│  │ AppConfigSettings  │  │  AppLogo (Reusable Component)│  │
│  │   - List all apps  │  │   - Renders custom logo      │  │
│  │   - Edit button    │  │   - Fallback to app initial  │  │
│  └────────┬───────────┘  └──────────────┬───────────────┘  │
│           │                               │                  │
│           │ Opens                         │ Used in:         │
│           ▼                               │ - Summary View   │
│  ┌────────────────────┐                  │ - Segments List  │
│  │ LogoSketchModal    │                  │ - Live Context   │
│  │  - Canvas drawing  │◄─────────────────┘                  │
│  │  - Color picker    │                                      │
│  │  - Save/Cancel     │                                      │
│  └────────┬───────────┘                                      │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │ Tauri Commands
            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Rust/Tauri)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │            app_configs Table (SQLite)                  │ │
│  │  - id (PK, AUTOINCREMENT)                              │ │
│  │  - bundle_id (UNIQUE, indexed)                         │ │
│  │  - app_name (optional display name)                    │ │
│  │  - logo_data (JSON SVG paths)                          │ │
│  │  - color (hex string)                                  │ │
│  │  - created_at, updated_at                             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Tauri Commands (app_configs.rs)                │ │
│  │  - get_app_config(bundle_id) -> Option<AppConfig>     │ │
│  │  - get_all_app_configs() -> Vec<AppConfig>            │ │
│  │  - upsert_app_config(AppConfig) -> AppConfig          │ │
│  │  - delete_app_config(bundle_id)                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS app_configs (
    id TEXT PRIMARY KEY,                      -- Surrogate primary key (UUID-based)
    bundle_id TEXT NOT NULL UNIQUE,          -- Stable app identifier (e.g., "com.todesktop.230313mzl4w4u92")
    app_name TEXT,                           -- Display name (e.g., "Cursor"), optional
    logo_data TEXT,                          -- JSON: SVG path data, null if no custom logo
    color TEXT,                              -- Hex color code (e.g., "#FF5733")
    created_at TEXT NOT NULL,                -- ISO 8601 datetime string (e.g., "2025-01-15T10:30:00Z")
    updated_at TEXT NOT NULL                 -- ISO 8601 datetime string
);

CREATE INDEX idx_app_configs_bundle_id ON app_configs(bundle_id);
CREATE INDEX idx_app_configs_updated ON app_configs(updated_at);
```

**Future extensibility:** Add columns like `tags TEXT` (JSON array), `icon_style TEXT`, etc.

### Rust Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub id: Option<String>,            // Database ID (UUID string, None for new configs)
    pub bundle_id: String,             // Stable app identifier
    pub app_name: Option<String>,      // Display name, optional
    pub logo_data: Option<String>,     // JSON-serialized LogoData
    pub color: Option<String>,         // Hex color
    pub created_at: String,            // ISO 8601 datetime string
    pub updated_at: String,            // ISO 8601 datetime string
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogoData {
    pub view_box: String,            // e.g., "0 0 64 64"
    pub paths: Vec<SvgPath>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SvgPath {
    pub d: String,                   // SVG path data
    pub stroke: String,              // Hex color
    pub stroke_width: f32,
    pub fill: Option<String>,        // Optional fill color
}
```

### TypeScript Types

```typescript
export interface AppConfig {
  id?: string; // Database ID (UUID string, undefined for new configs)
  bundleId: string; // Stable app identifier
  appName?: string; // Display name, optional
  logoData?: LogoData;
  color?: string; // Hex color
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string
}

export interface LogoData {
  viewBox: string;
  paths: SvgPath[];
}

export interface SvgPath {
  d: string; // SVG path data
  stroke: string; // Hex color
  strokeWidth: number;
  fill?: string; // Optional fill (not supported in v1, reserved for future)
}

// Transient type used only in LogoSketchModal for editing with undo/redo
export interface EditableSvgPath extends SvgPath {
  id: number; // Unique ID for undo/redo tracking, NOT persisted to database
}

export interface DetectedApp {
  bundleId: string;
  appName?: string; // Most common app_name for this bundle_id
  lastSeen: string; // ISO 8601 datetime (serialized from Rust DateTime<Utc>)
  totalReadings: number; // Count of readings for this app
}
```

---

## API Contracts

### Tauri Commands

#### `get_app_config`

**Description:** Retrieve config for a specific app by bundle_id
**Input:**

```rust
bundle_id: String
```

**Output:**

```rust
Result<Option<AppConfig>, String>
```

#### `get_all_app_configs`

**Description:** Get all app configs (for settings page listing)
**Output:**

```rust
Result<Vec<AppConfig>, String>
```

#### `upsert_app_config`

**Description:** Insert or update app config by bundle_id
**Input:**

```rust
config: AppConfig  // bundle_id is required, id is optional (None for new configs)
```

**Output:**

```rust
Result<AppConfig, String>  // Returns config with id populated
```

**Behavior:**

- If config with `bundle_id` exists, updates it
- If not, inserts new config
- Updates `updated_at` automatically
- Returns config with database `id` populated

**Validation:**

The backend validates all user-supplied data to ensure rendering stability:

1. **Color validation:**

   - Must be valid hex color format: `#RRGGBB` or `#RRGGBBAA` (6 or 8 hex digits)
   - Regex: `^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{8}$`
   - Reject invalid formats, return error: "Invalid color format. Must be hex (#RRGGBB)"

2. **Stroke width validation:**

   - Must be one of 5 preset values: `[1.0, 2.0, 4.0, 6.0, 8.0]`
   - Reject other values, return error: "Invalid stroke width. Must be one of: 1, 2, 4, 6, 8"

3. **Path data validation:**

   - SVG path `d` attribute must be valid SVG path syntax
   - Max path length: 10,000 characters (prevent DoS)
   - Max paths per logo: 1,000 (prevent bloat)
   - Reject invalid paths, return error: "Invalid SVG path data"

4. **ViewBox validation:**

   - Must match format: `"0 0 <width> <height>"` where width/height are positive numbers
   - Expected dimensions: 64x64 (standard logo size)
   - Max dimensions: 512x512 (prevent oversized SVGs)
   - Reject invalid viewBox, return error: "Invalid viewBox format"

5. **Logo data size limit:**
   - Max JSON size: 100 KB per logo (prevent database bloat)
   - Reject oversized data, return error: "Logo data too large (max 100 KB)"

**Validation Functions:**

```rust
fn validate_color(color: &str) -> Result<(), String> {
    if !color.starts_with('#') || (color.len() != 7 && color.len() != 9) {
        return Err("Invalid color format. Must be hex (#RRGGBB)".to_string());
    }
    if !color[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid color format. Must be hex (#RRGGBB)".to_string());
    }
    Ok(())
}

fn validate_stroke_width(width: f32) -> Result<(), String> {
    const VALID_WIDTHS: [f32; 5] = [1.0, 2.0, 4.0, 6.0, 8.0];
    if !VALID_WIDTHS.contains(&width) {
        return Err("Invalid stroke width. Must be one of: 1, 2, 4, 6, 8".to_string());
    }
    Ok(())
}

fn validate_path_data(path_d: &str) -> Result<(), String> {
    if path_d.len() > 10_000 {
        return Err("Path data too long (max 10,000 chars)".to_string());
    }
    // Basic SVG path syntax check (M, L, C, Q, Z commands)
    if !path_d.chars().any(|c| matches!(c, 'M' | 'm' | 'L' | 'l' | 'C' | 'c' | 'Q' | 'q' | 'Z' | 'z')) {
        return Err("Invalid SVG path data".to_string());
    }
    Ok(())
}
```

#### `delete_app_config`

**Description:** Remove custom config for an app by bundle_id
**Input:**

```rust
bundle_id: String
```

**Output:**

```rust
Result<(), String>
```

#### `get_all_detected_apps`

**Description:** Get all unique apps detected in sessions (for settings page listing)
**Output:**

```rust
Result<Vec<DetectedApp>, String>
```

**DetectedApp type:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedApp {
    pub bundle_id: String,
    pub app_name: Option<String>,  // Most common app_name for this bundle_id
    pub last_seen: DateTime<Utc>,  // Most recent timestamp from context_readings
    pub total_readings: i64,        // Count of readings for this app
}
```

**Behavior:**

- Queries `context_readings` table for unique `bundle_id` values
- Aggregates most common `app_name` per `bundle_id` (from segments or readings)
- Orders by `last_seen` DESC (most recently used apps first)
- Used to populate settings page app list

**Performance Optimization:**

To handle large datasets efficiently (hundreds of thousands of readings), this command uses:

1. **Index on `bundle_id`:** Ensure `context_readings` has an index on `bundle_id`

   ```sql
   CREATE INDEX IF NOT EXISTS idx_context_readings_bundle_id
   ON context_readings(bundle_id);
   ```

2. **Optimized GROUP BY query:** Uses SQLite's aggregation functions to avoid full table scans

   ```sql
   -- Get most common app_name per bundle_id using subquery
   WITH app_names AS (
       SELECT
           bundle_id,
           owner_name as app_name,
           COUNT(*) as count
       FROM context_readings
       GROUP BY bundle_id, owner_name
   ),
   most_common AS (
       SELECT
           bundle_id,
           app_name,
           ROW_NUMBER() OVER (PARTITION BY bundle_id ORDER BY count DESC) as rn
       FROM app_names
   )
   SELECT
       cr.bundle_id,
       mc.app_name,
       MAX(cr.timestamp) as last_seen,
       COUNT(*) as total_readings
   FROM context_readings cr
   LEFT JOIN most_common mc ON cr.bundle_id = mc.bundle_id AND mc.rn = 1
   GROUP BY cr.bundle_id, mc.app_name
   ORDER BY last_seen DESC;
   ```

   **Simpler alternative** (if performance is acceptable):

   ```sql
   -- Use MAX(owner_name) as approximation (faster, less accurate)
   SELECT
       bundle_id,
       MAX(owner_name) as app_name,
       MAX(timestamp) as last_seen,
       COUNT(*) as total_readings
   FROM context_readings
   GROUP BY bundle_id
   ORDER BY last_seen DESC;
   ```

   **Fastest option** (if segments table exists):

   ```sql
   -- Query segments table (already aggregated, much faster)
   SELECT DISTINCT
       bundle_id,
       app_name,
       MAX(end_time) as last_seen,
       COUNT(*) * 5 as total_readings  -- Approximate (segments don't have exact count)
   FROM segments
   GROUP BY bundle_id, app_name
   ORDER BY last_seen DESC;
   ```

3. **Query strategy selection:**

   - **Primary:** Use segments table if available (fastest, already aggregated)
   - **Fallback:** Use simplified `context_readings` query with `MAX(owner_name)`
   - **Most accurate:** Use complex CTE query only if segments unavailable and accuracy is critical

4. **Caching strategy:**
   - Cache results in memory for 5 minutes
   - Invalidate cache when new session completes
   - Settings page only queries on mount (not on every render)

**Expected Performance:**

- With index + segments table: <10ms (recommended)
- With index + simplified query: <50ms for 100K readings, <200ms for 1M readings
- Without index: Degrades linearly (avoid full table scan)

---

## Component Specifications

### 1. LogoSketchModal Component

**Purpose:** Modal for drawing custom app logos

**Props:**

```typescript
interface LogoSketchModalProps {
  bundleId: string; // Required: stable app identifier
  appName?: string; // Optional: display name for UI
  initialLogoData?: LogoData;
  onSave: (logoData: LogoData) => Promise<void>;
  onCancel: () => void;
}
```

**Features:**

- **Canvas:** 512x512px drawing area (exports as 64x64 viewBox SVG)
- **Tools:**
  - Pen tool (freehand drawing)
  - Eraser (removes paths on click - works like a stroke, removes any path intersecting with the eraser stroke)
  - **Color picker:** RGB hex color wheel + direct hex input (returns `#RRGGBB` format)
  - **Stroke width presets:** 5 preset buttons (1px, 2px, 4px, 6px, 8px) - no slider
  - Clear all
  - Undo/redo (maintain path history)
- **Preview:** Live SVG preview at actual display size (32x32px)
- **Export:** Converts canvas strokes to SVG path data using `perfect-freehand` for stroke generation and path simplification

**Stroke Width Presets:**

```typescript
const STROKE_WIDTH_PRESETS = [
  { value: 1.0, label: "1px" },
  { value: 2.0, label: "2px" },
  { value: 4.0, label: "4px" },
  { value: 6.0, label: "6px" },
  { value: 8.0, label: "8px" },
] as const;
```

**Color Picker:**

- Use a color wheel/picker component (e.g., `react-color` or `@uiw/react-color-picker`)
- Output format: RGB hex (`#RRGGBB`)
- Display current color swatch
- Provide both RGB sliders and direct hex input field
- Same color picker component used in both LogoSketchModal (for stroke color) and settings page (for app background color)

**Implementation Notes:**

- Use HTML5 Canvas for drawing (better performance)
- Convert Canvas strokes to SVG paths on save using path simplification
- Library: `perfect-freehand` for smooth stroke generation

**Canvas-to-SVG Conversion:**

The conversion process transforms canvas strokes into optimized SVG path data:

1. **Stroke capture:** As user draws, collect pointer coordinates (x, y) at each frame
2. **Stroke generation:** Pass coordinates to `perfect-freehand` with settings:
   - `size`: Current stroke width (1-8px)
   - `thinning`: 0.5 (moderate pressure simulation)
   - `smoothing`: 0.5 (balanced between accuracy and smoothness)
   - `streamline`: 0.5 (reduce jitter)
3. **Path simplification:** Convert `perfect-freehand` output points to SVG path `d` string
   - Use `M` (moveTo) for first point
   - Use `L` (lineTo) for subsequent points
   - Apply Douglas-Peucker algorithm with epsilon=0.5 to reduce point count while preserving shape
   - Close path with `Z` if needed
4. **Path object creation:** Create `EditableSvgPath` object with:
   - `id`: Next available ID from counter (auto-increment)
   - `d`: Generated SVG path string
   - `stroke`: Current color from color picker
   - `strokeWidth`: Current stroke width
   - `fill`: `none` (v1 does not support fill)
5. **Validation:** Ensure path `d` length < 10,000 chars, reject if oversized
6. **Before save:** Convert `EditableSvgPath[]` → `SvgPath[]` by stripping `id` field from each path

**Path Simplification Benefits:**

- Reduces path string size by 50-70% on average
- Maintains visual fidelity (epsilon=0.5 means max 0.5px deviation)
- Improves rendering performance for complex drawings

**Library:** `simplify-js` or custom Douglas-Peucker implementation

**Canvas Library Decision:**

- **Primary choice:** `perfect-freehand` - Provides smooth, natural stroke generation with pressure simulation
- **Alternatives considered:**
  - `react-sketch-canvas` - Simpler API but less control over stroke quality
  - Custom canvas implementation - More work, but full control over UX
- **Rationale:** `perfect-freehand` balances ease of use with high-quality output, aligns with "artsy" aesthetic

**Path Management:**

The component uses a transient `EditableSvgPath` type (with `id` field) during editing, which is converted to `SvgPath` (without `id`) before saving to database. This keeps the persisted schema clean while enabling reliable undo/redo.

The component maintains paths in two data structures:

1. **Path map:** `Map<number, EditableSvgPath>` - Maps path IDs to full path data for fast lookup and undo/redo restoration
2. **Path ID counter:** Auto-incrementing counter starting at 1
3. **Current paths array:** `EditableSvgPath[]` - Array of paths currently visible on canvas (for rendering)

**Note:** Path IDs are only used in-memory for undo/redo management. When saving to database:

1. Convert `EditableSvgPath[]` to `SvgPath[]` by removing the `id` field from each path
2. Store in `LogoData.paths` array
3. On load, convert `SvgPath[]` back to `EditableSvgPath[]` by assigning new sequential IDs

**Path creation:**

- When user draws a stroke, create `EditableSvgPath` with unique `id` from counter
- Increment counter
- Add to path map and current paths array
- Create `add-path` action with full path data (including ID)

**Path deletion (eraser):**

- When user activates eraser and draws an eraser stroke:
  - Detect all paths intersecting with the eraser stroke bounding box
  - For each intersecting path:
    - Look up path by ID from path map
    - Store full path snapshot in `remove-path` action
    - Remove from path map and current paths array
  - Eraser stroke itself is not saved as a path (it only triggers deletion)

**Clear all:**

- Before clearing:
  - Create snapshot of all current paths with IDs (copy of array: `EditableSvgPath[]`)
  - Store in `clear-all` action
  - Clear path map and current paths array
  - On undo: restore both the array and rebuild the path map from the snapshot

**Undo/Redo Implementation:**

Uses `EditableSvgPath` (with `id` field) in all actions to enable reliable canvas state restoration.

- **Action types:**

  ```typescript
  type Action =
    | { type: "add-path"; path: EditableSvgPath } // Includes ID for undo removal
    | { type: "remove-path"; path: EditableSvgPath } // Full path with ID for restoration
    | { type: "clear-all"; pathsSnapshot: EditableSvgPath[] }; // All paths with IDs
  ```

- **History and redo stacks:**

  - `history: Action[]` - Array of actions (max 50)
  - `redoStack: Action[]` - Stack of undone actions

- **Undo implementation:**

  - Pop last action from history array
  - Apply reverse operation:
    - `add-path` → Remove path from both path map (by `path.id`) and current paths array
    - `remove-path` → Restore `path` to both path map (`map.set(path.id, path)`) and current paths array
    - `clear-all` → Restore all paths from `pathsSnapshot` to both canvas array and rebuild path map
  - Push action to redo stack
  - Clear redo stack if new action is performed after undo

- **Redo implementation:**

  - Pop action from redo stack
  - Reapply original operation:
    - `add-path` → Add `path` back to both path map and current paths array
    - `remove-path` → Remove path from both path map (by `path.id`) and current paths array
    - `clear-all` → Clear both path map and current paths array
  - Push action back to history

- **State consistency:** All operations maintain both `Map<number, EditableSvgPath>` and `EditableSvgPath[]` in sync

- **Limit:** 50 actions max (prevent memory bloat)

- **Memory estimate:**

  - `add-path`: ~200 bytes (full path data with ID)
  - `remove-path`: ~200 bytes (full path with ID)
  - `clear-all`: ~200 bytes × N paths (snapshot with all IDs)
  - Average: ~300 bytes per action, ~15 KB total for 50 actions

- **Keyboard shortcuts:** `Cmd/Ctrl+Z` for undo, `Cmd/Ctrl+Shift+Z` for redo

- **Eraser behavior:** When path deleted, store full `EditableSvgPath` (with ID) in `remove-path` action for restoration

### 2. AppLogo Component

**Purpose:** Reusable component to display app logo

**Props:**

```typescript
interface AppLogoProps {
  bundleId: string; // Required: stable app identifier
  appName?: string; // Optional: display name for fallback initial
  size?: number; // Default: 32px
  className?: string;
}
```

**React Query Caching Strategy:**

React Query provides automatic request deduplication and caching, eliminating the need to fetch all configs upfront:

- **Query key:** `['app-config', bundleId]` for individual configs
- **Query key:** `['app-configs']` for all configs list (used only on settings page)
- **Request deduplication:** If multiple `<AppLogo>` components render with the same `bundleId` simultaneously, React Query automatically deduplicates them into a single Tauri call
- **Shared cache:** All components share the same cache, so once a config is fetched, other components use the cached value
- **Stale time:** 5 minutes (configs don't change frequently)
- **Cache invalidation:** On `upsert_app_config` success, invalidate both `['app-config', bundleId]` and `['app-configs']`

**Prefetching Strategy:**

- **Summary View:** When session summary loads, prefetch configs for all unique `bundleId`s in segments

  ```typescript
  // In SummaryView component
  const bundleIds = useMemo(
    () => [...new Set(segments.map((s) => s.bundleId))],
    [segments]
  );

  // Prefetch all configs needed for this view
  bundleIds.forEach((bundleId) => {
    queryClient.prefetchQuery({
      queryKey: ["app-config", bundleId],
      queryFn: () => invoke("get_app_config", { bundleId }),
    });
  });
  ```

- **Settings Page:** Fetch all configs at once using `get_all_app_configs()` (only page that needs all configs)

  ```typescript
  const { data: configs } = useQuery({
    queryKey: ["app-configs"],
    queryFn: () => invoke("get_all_app_configs"),
  });
  ```

- **No prefetch on app start:** Configs are fetched on-demand when components mount, leveraging React Query's deduplication

**Performance Benefits:**

- **First render:** Individual requests per unique bundleId (deduplicated automatically)
- **After first render:** Subsequent renders use cached values (no Tauri calls)
- **Summary view:** Prefetching ensures logos appear immediately without loading states
- **Settings page:** Single bulk fetch is efficient for listing all apps

**Behavior:**

1. Use `useQuery(['app-config', bundleId])` to fetch `AppConfig` (React Query handles caching and deduplication)
2. While loading, render fallback immediately (no blocking)
3. If `logoData` exists, render custom SVG
4. If no custom logo, render fallback:
   - Colored square with app name initial (or bundle_id first char if appName unavailable)
   - Use `color` from config if available, else use `getAppColor(bundleId)`

**Implementation:**

```typescript
function AppLogo({ bundleId, appName, size = 32 }: AppLogoProps) {
  const { data: config, isLoading } = useQuery({
    queryKey: ['app-config', bundleId],
    queryFn: () => invoke('get_app_config', { bundleId }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Render fallback immediately (no loading state needed)
  if (!config?.logoData) {
    const color = config?.color || getAppColor(bundleId);
    return (
      <div style={{ width: size, height: size, backgroundColor: color }}>
        {(appName || bundleId)[0].toUpperCase()}
      </div>
    );
  }

  // Render custom logo
  return (
    <svg viewBox={config.logoData.viewBox} width={size} height={size}>
      {config.logoData.paths.map((path, i) => (
        <path key={i} d={path.d} stroke={path.stroke}
              strokeWidth={path.strokeWidth} fill={path.fill} />
      ))}
    </svg>
  );
}
```

**Color Resolution Priority:**

When determining the color for an app logo or bar segment, use the following priority order:

1. **Custom config color** (`AppConfig.color`) - User-defined color from database
2. **Hardcoded `APP_COLORS`** - Existing app-specific colors from `src/constants/appColors.ts` (for backward compatibility)
3. **Confidence-based color** - If confidence score provided, use `getConfidenceColor()`
4. **Default gray** - `#7A7A7A` (neutral fallback)

**Implementation:** Create a shared utility function `getAppColor(bundleId: string, config?: AppConfig, confidenceScore?: number): string` in `src/lib/appColors.ts` that implements this priority logic. This function should be used consistently across:

- `AppLogo` component for logo background
- Segment rendering in timeline/summary views
- Any other UI elements displaying app-specific colors

**Logo Size Standards:**

- **Timeline bars:** 12px (compact view)
- **List items:** 24px (SessionCard, SegmentStats)
- **Default:** 32px (Summary view, SegmentDetailsModal)
- **Detail modal:** 48px (larger preview)
- **Settings page:** 32px (app list)

All sizes use the same SVG viewBox (64x64), so logos scale perfectly.

**Rendering:**

```tsx
// Custom logo
<svg viewBox={logoData.viewBox} width={size} height={size}>
  {logoData.paths.map((path, i) => (
    <path key={i} d={path.d} stroke={path.stroke}
          strokeWidth={path.strokeWidth} fill={path.fill} />
  ))}
</svg>

// Fallback
<div className="app-logo-fallback"
     style={{ width: size, height: size, backgroundColor: color }}>
  {(appName || bundleId)[0].toUpperCase()}
</div>
```

### 3. AppConfigSettings Page

**Purpose:** Settings page to manage all app configs

**Layout:**

```
┌────────────────────────────────────────┐
│   App Configurations                    │
├────────────────────────────────────────┤
│  [Search apps...                    ]  │
│                                         │
│  ┌─────┬──────────────┬───────────┐   │
│  │Logo │ App Name     │ Actions   │   │
│  ├─────┼──────────────┼───────────┤   │
│  │ 🎨 │ Cursor       │ [Edit]    │   │
│  │ 📦 │ VS Code      │ [Edit]    │   │
│  │ C  │ Chrome       │ [Edit]    │   │
│  └─────┴──────────────┴───────────┘   │
└────────────────────────────────────────┘
```

**Features:**

- List all apps that have appeared in sessions (join with `context_readings`)
- Show current logo (custom or fallback)
- Click "Edit" → opens `LogoSketchModal` + color picker
- Search/filter apps by name

**Search/Filter Implementation:**

- **Client-side filtering:** Filter `appList` array in memory (fast for <1000 apps)
- **Search fields:** Search by `appName` (display name) or `bundleId` (for debugging)
- **Debounce:** 300ms delay on input to avoid excessive re-renders
- **Case-insensitive:** Convert both search term and app names to lowercase
- **Empty state:** Show message "No apps found" when filter returns empty, "No apps detected yet. Start a focus session to see apps here." when no apps exist

**Empty State Handling:**

When no apps are detected:

```
┌────────────────────────────────────────┐
│   App Configurations                    │
├────────────────────────────────────────┤
│                                         │
│         No apps detected yet            │
│                                         │
│   Start a focus session to see apps    │
│   appear here for customization.        │
│                                         │
│          [Start Timer]                 │
│                                         │
└────────────────────────────────────────┘
```

When search filter returns no results:

```
┌────────────────────────────────────────┐
│   App Configurations                    │
├────────────────────────────────────────┤
│  [Search apps...                    ]  │
│                                         │
│        No apps match "xyz"             │
│                                         │
│   [Clear Search]                       │
│                                         │
└────────────────────────────────────────┘
```

**Logo Deletion UX:**

- **Delete button:** Shown in edit modal (not in main list to avoid accidental deletion)
- **Confirmation dialog:** "Remove custom logo for [App Name]? This will reset to default."
- **On confirm:**
  - Call `delete_app_config(bundleId)`
  - Invalidate React Query cache
  - Immediately revert to default logo/color
  - Show success toast: "Logo reset to default"
- **No undo:** Deletion is permanent (user can redraw if needed)

**Data Loading:**

```typescript
// Get unique apps from context_readings
const apps = await invoke("get_all_detected_apps"); // Returns Vec<DetectedApp>

// Get configs
const configs = await invoke("get_all_app_configs");

// Merge: apps with configs overlay
const appList = apps.map((app) => ({
  bundleId: app.bundleId,
  appName: app.appName,
  config: configs.find((c) => c.bundleId === app.bundleId),
}));
```

---

## Implementation Phases

### Phase 1: Database & Backend (Day 1)

**Deliverables:**

- [ ] Create `app_configs` table migration
- [ ] **Create index on `context_readings.bundle_id`** (required for `get_all_detected_apps` performance)
- [ ] Implement `AppConfig` Rust types
- [ ] Write CRUD functions in `src-tauri/src/db/app_configs.rs`
- [ ] Implement `get_all_detected_apps` with optimized GROUP BY query
- [ ] Expose Tauri commands
- [ ] Write unit tests for database operations
- [ ] **Deferred:** Migration from existing `APP_COLORS` - Will be implemented in a future phase. Frontend will use `APP_COLORS` as fallback until migration is complete.

**Database Index Migration:**

Create a new migration (e.g., `schema_v7.sql`) that adds the index:

```sql
-- Add index on bundle_id for efficient app detection queries
CREATE INDEX IF NOT EXISTS idx_context_readings_bundle_id
ON context_readings(bundle_id);
```

**Note:** Hardcoded colors in `APP_COLORS` remain as fallback for apps not yet configured. Migration of hardcoded colors to database is deferred to a future phase.

**Files to create/modify:**

- `src-tauri/src/db/schema.rs` (add table + index migration)
- `src-tauri/src/db/schemas/schema_v7.sql` (new migration for bundle_id index)
- `src-tauri/src/db/app_configs.rs` (new)
- `src-tauri/src/lib.rs` (register commands)

### Phase 2: Drawing Canvas (Day 2)

**Deliverables:**

- [ ] Build `LogoSketchModal` component
- [ ] Implement canvas drawing with pen tool using `perfect-freehand`
- [ ] Add RGB hex color wheel picker with hex input (using `react-color` or similar)
- [ ] Implement eraser tool (click-to-remove paths intersecting with eraser stroke)
- [ ] Implement stroke width preset buttons (1px, 2px, 4px, 6px, 8px)
- [ ] Implement undo/redo with `EditableSvgPath` snapshots (including IDs for reliable state restoration)
- [ ] Convert canvas to SVG paths on save using Douglas-Peucker simplification (epsilon=0.5)
- [ ] Implement `EditableSvgPath` ↔ `SvgPath` conversion helpers
- [ ] Test SVG export/import roundtrip
- [ ] Validate all data before sending to backend
- [ ] Add validation error handling UI (toasts, field highlighting)

**Files to create:**

- `src/components/LogoSketchModal.tsx`
- `src/lib/canvas-to-svg.ts` (conversion utilities with `perfect-freehand` and path simplification)
- `src/lib/appColors.ts` (shared color resolution utility)
- `src/types/app-config.ts` (TypeScript types: `SvgPath`, `EditableSvgPath`, `LogoData`, `AppConfig`, `DetectedApp`)

**Type Conversion Helpers:**

```typescript
// Convert persisted SvgPath[] to editable paths with IDs
function toEditablePaths(paths: SvgPath[]): EditableSvgPath[] {
  return paths.map((path, index) => ({ ...path, id: index + 1 }));
}

// Convert editable paths to persistable format (strip IDs)
function toPersistablePaths(paths: EditableSvgPath[]): SvgPath[] {
  return paths.map(({ id, ...path }) => path);
}
```

### Phase 3: UI Integration (Day 3)

**Deliverables:**

- [ ] Create `AppLogo` component
- [ ] Integrate into Summary view (Phase 5 components)
- [ ] Build `AppConfigSettings` page
- [ ] Add navigation to settings from main UI
- [ ] Implement React Query hooks for config fetching with deduplication
- [ ] Add prefetching in SummaryView for segment bundleIds
- [ ] Test logo display across different screen sizes

**Files to create/modify:**

- `src/components/AppLogo.tsx` (new)
- `src/pages/AppConfigSettings.tsx` (new)
- Summary/segment components (modify to use `AppLogo`)

### Phase 4: Polish (Day 4)

**Deliverables:**

- [ ] Add color picker to settings modal (same component as LogoSketchModal)
- [ ] Implement delete config (reset to default)
- [ ] Add loading states and error handling
- [ ] Optimize SVG rendering performance (React.memo for AppLogo)
- [ ] Add keyboard shortcuts (Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo)
- [ ] Write E2E tests for full workflow
- [ ] Verify path simplification reduces file size by 50-70%
- [ ] Test eraser intersection detection accuracy

---

## Integration Points

### Where Logos Appear

1. **Summary View** (Phase 5 - stacked bar charts)

   - Show logo next to app name in chart legend
   - Use config color for bar segments if set

2. **Activity Timeline** (Future)

   - Display logo for each segment in timeline view

3. **Current Context Display** (If implemented)

   - Show logo for currently active app

4. **Settings Page**
   - Logo preview in app config list

### Navigation to Settings

**Access Points:**

- **Main navigation:** Add "Settings" tab/item in main app navigation (alongside Timer, Activities, etc.)
- **Summary view:** Add "Customize Apps" button/link in summary footer
- **Future:** Keyboard shortcut (`Cmd/Ctrl+,` for settings)

**Settings Page Structure:**

```
┌────────────────────────────────────────┐
│  [← Back]  App Configurations          │
├────────────────────────────────────────┤
│  [Search apps...                    ]  │
│  ...                                   │
└────────────────────────────────────────┘
```

### Data Flow Example

```
User draws logo for Cursor (bundle_id: "com.todesktop.230313mzl4w4u92")
  ↓
LogoSketchModal converts canvas to SVG paths
  ↓
Frontend: invoke('upsert_app_config', {
  bundleId: 'com.todesktop.230313mzl4w4u92',
  appName: 'Cursor',
  logoData: {...}
})
  ↓
Backend: Lookup by bundle_id, INSERT OR UPDATE app_configs
  ↓
React Query cache invalidated for ['app-config', bundleId]
  ↓
All <AppLogo bundleId="com.todesktop.230313mzl4w4u92" /> components re-render with new logo
```

---

## Error Handling

### Frontend

- **Canvas errors:** Graceful degradation, show error toast
  - Message: "Drawing canvas unavailable. Please refresh the page."
  - Fallback: Disable drawing tools, show static preview
- **Save failures:** Retry mechanism, keep modal open with user's drawing
  - Message: "Failed to save logo. Please try again."
  - Retry button: Attempt save again (up to 3 retries)
- **Invalid SVG:** Validate path data before save, show inline error
  - Message: "Logo data is invalid. Please try drawing again."
  - Validation: Check path `d` attribute format, stroke colors, etc.

### Backend

- **Database write failures:** Return descriptive error, log to file
  - User message: "Failed to save configuration. Please try again."
  - Log: Full error details with timestamp
- **Invalid JSON in logo_data:** Return error, don't crash app
  - User message: "Logo data is corrupted. Please redraw your logo."
  - Log: JSON parse error details
- **Missing bundle_id:** Validate required fields before insert
  - User message: "Application identifier is missing."
  - Return: `Err("bundle_id is required")`
- **Duplicate bundle_id:** Handle gracefully (update existing config)
  - Behavior: Silent update (expected behavior for upsert)
  - Log: "Updating existing config for bundle_id: {bundle_id}"
- **Validation errors:** Return specific validation error messages
  - User message: Return validation error as-is (e.g., "Invalid stroke width. Must be one of: 1, 2, 4, 6, 8")
  - Log: Validation failure with field name and value
  - Frontend: Display validation error inline in modal
    - Parse error message to determine which field failed (stroke width, color, path data, etc.)
    - Show error toast with full message
    - Disable save button until error is resolved
    - For drawing canvas errors: highlight invalid paths with red outline
    - For color picker errors: show error text below color input field

### Edge Cases

- **App name changes:** `app_name` can be updated independently without affecting `bundle_id` lookup
- **Large SVG data:** Limit path count (max 1000 paths) to prevent bloat
- **Corrupted logo_data:** Fallback to default logo, log warning
- **Missing bundle_id:** Query should fail gracefully, return None
- **Empty canvas on save:** Allow saving empty logo (clears custom logo, reverts to default)
- **Concurrent edits:** Last write wins (simple approach for v1)

---

## Performance Considerations

### Storage

- **SVG size:** Simplify paths on save (reduce points while preserving shape)
- **Database growth:** Typical config ~1-5 KB, 100 apps = ~500 KB (negligible)

### Rendering

- **AppLogo component:** Memoize with React.memo, only re-render on config change
- **Canvas performance:** Throttle drawing updates to 60fps
- **Config caching:** React Query handles caching automatically with shared cache and request deduplication

### Optimization Targets

- Drawing latency: <16ms per frame (smooth 60fps)
- Logo render time: <1ms per logo
- Settings page load: <500ms for 100 apps

---

## Testing Strategy

### Unit Tests

- SVG path generation from canvas strokes
- Database CRUD operations
- Logo data serialization/deserialization

### Integration Tests

- Full workflow: draw → save → verify display
- Config updates reflect across all AppLogo instances
- Fallback rendering when no custom logo

### Manual Testing Checklist

- [ ] Draw complex logo with multiple colors
- [ ] Undo/redo works correctly
- [ ] Logo displays at various sizes without distortion
- [ ] Delete config resets to default fallback
- [ ] Settings page loads quickly with many apps

---

## Future Enhancements (Out of Scope for v1)

### Advanced Drawing Tools

- Fill tool for closed shapes
- Shape primitives (circle, square, line)
- Text tool for adding labels
- Layers support

### Logo Management

- Import SVG/PNG files instead of drawing
- Export/import all configs (backup/restore)
- Logo templates or community marketplace

### Extended App Configs

- Tags for categorization (e.g., "work", "social")
- Custom app aliases/nicknames
- Productivity ratings per app
- Time limits/notifications

### UI Enhancements

- Drag-and-drop logo upload
- Logo history/versioning
- Bulk edit (apply color to multiple apps)
- Dark mode for drawing canvas

---

## Open Questions

1. **SVG vs PNG storage?**

   - **Decision:** Use SVG (scalable, small size, aligns with "sketch" aesthetic)

2. **Canvas size constraints?**

   - **Decision:** 512x512 canvas, export as 64x64 viewBox (balance detail vs. file size)

3. **Color picker in modal or separate?**

   - **Decision:** Same color picker component used in both LogoSketchModal (for stroke color) and settings page (for app background color)
   - **Features:** RGB color wheel + RGB sliders + direct hex input field
   - **Format:** Hex colors (`#RRGGBB`) with validation on backend

4. **Stroke width input method?**

   - **Decision:** 5 preset buttons (1px, 2px, 4px, 6px, 8px) - no slider
   - **Rationale:** Simpler UX, prevents invalid values, ensures backend validation compatibility

5. **Should we auto-generate default colors?**

   - **Decision:** Yes, hash app name to generate consistent fallback color

6. **Undo buffer limit?**

   - **Decision:** 50 actions (reasonable for drawing session, ~15 KB memory with path snapshots)

7. **Backend validation requirements?**

   - **Decision:** Full validation contract with specific limits:
     - Colors: Hex format (`#RRGGBB` or `#RRGGBBAA`)
     - Stroke widths: Preset values only (1, 2, 4, 6, 8)
     - Path data: Max 10,000 chars, max 1,000 paths per logo
     - Logo data: Max 100 KB JSON size
     - ViewBox: Expected 64x64, max 512x512 dimensions

8. **Eraser interaction model?**

   - **Decision:** Click-to-draw eraser stroke (like pen tool), removes any paths intersecting with eraser stroke bounding box
   - **Behavior:** Eraser stroke itself is not saved, only triggers path deletion

9. **Canvas-to-SVG conversion algorithm?**
   - **Decision:** Use `perfect-freehand` for stroke generation + Douglas-Peucker algorithm for path simplification
   - **Settings:** Epsilon=0.5 for simplification (balance between file size and visual fidelity)
   - **Expected reduction:** 50-70% smaller path strings

---

## Success Metrics

- **Adoption:** % of users who create at least one custom logo
- **Engagement:** Average # of custom logos per user
- **Performance:** Logo rendering time <1ms (p95)
- **Satisfaction:** User feedback on drawing experience

---

## References

- [P0 System Design](./system-design-p0.md) - Core architecture
- [SVG Path Specification](https://www.w3.org/TR/SVG/paths.html)
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) - Stroke smoothing library

---

**Document Status:** Ready for implementation
**Next Steps:** Begin Phase 1 (Database & Backend)
