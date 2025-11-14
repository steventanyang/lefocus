# Icon Pre-fetching During Session - Implementation Plan

## Overview
Pre-fetch app icons as soon as apps are detected during an active session, rather than waiting until session end. This ensures icons are ready when the summary view loads.

## Current State Analysis

### Where Apps Are First Detected

1. **During Active Window Tracking** ([loop_worker.rs](../../src-tauri/src/sensing/loop_worker.rs))
   - `process_window_metadata()` gets app info from accessibility API
   - Creates `WindowMetadata` with bundle_id
   - This is the EARLIEST point we know about an app

2. **During Segmentation** ([segmentation.rs](../../src-tauri/src/sensing/segmentation.rs))
   - Too late - this happens at session end
   - Not suitable for pre-fetching

### Current App Registration Flow

```
Active Session:
1. Window detected → WindowMetadata created
2. WindowUpdate stored in buffer
3. ... (session continues) ...

Session End:
4. Segmentation runs → creates segments
5. insert_segments() called
6. ensure_app_exists() → creates app record
7. spawn_icon_fetch_task() → background fetch
```

## Proposed Architecture

### New Flow

```
Active Session:
1. Window detected → WindowMetadata created
2. ✅ NEW: Check if app exists with icon
3. ✅ NEW: If no icon → trigger immediate fetch
4. WindowUpdate stored in buffer
5. ... (session continues with icon fetching in parallel) ...

Session End:
6. Segmentation runs
7. insert_segments() called
8. ensure_app_exists() → app likely already exists with icon
9. spawn_icon_fetch_task() → only fetches truly missing icons
```

## Implementation Plan

### Phase 1: Add Icon Pre-fetch Infrastructure

#### 1.1 Create Icon Manager Module
**New file**: `src-tauri/src/sensing/icon_manager.rs`

```rust
pub struct IconManager {
    db: Database,
    seen_bundles: Arc<Mutex<HashSet<String>>>,
    fetch_handle: Option<JoinHandle<()>>,
}

impl IconManager {
    pub fn new(db: Database) -> Self

    /// Called when a new bundle_id is detected
    pub async fn ensure_icon(&self, bundle_id: &str, app_name: Option<&str>)

    /// Pre-fetch icon if needed
    async fn prefetch_icon(&self, bundle_id: &str)

    /// Check if we've already processed this bundle in this session
    fn should_process(&self, bundle_id: &str) -> bool
}
```

**Key Features**:
- Maintains set of already-seen bundles to avoid duplicate work
- Non-blocking - doesn't slow down window tracking
- Reuses existing FFI bridge code

#### 1.2 Integrate with Database Layer
**Modify**: `src-tauri/src/db/repositories/apps.rs`

Add method to check icon status without full app fetch:
```rust
pub fn has_icon(&self, bundle_id: &str) -> Result<bool>
```

### Phase 2: Hook into Window Detection

#### 2.1 Modify Loop Worker
**File**: `src-tauri/src/sensing/loop_worker.rs`

In `run()` method:
1. Create `IconManager` instance at session start
2. Pass it to window processing

In `process_active_window()`:
```rust
// After getting window metadata
if !metadata.bundle_id.is_empty() && metadata.bundle_id != "com.apple.system" {
    // Fire and forget - don't block window tracking
    let icon_mgr = self.icon_manager.clone();
    let bundle_id = metadata.bundle_id.clone();
    let app_name = Some(metadata.owner_name.clone());

    tokio::spawn(async move {
        icon_mgr.ensure_icon(&bundle_id, app_name.as_deref()).await;
    });
}
```

### Phase 3: Optimize Session End Flow

#### 3.1 Modify Segment Repository
**File**: `src-tauri/src/db/repositories/segments.rs`

In `spawn_icon_fetch_task()`:
- Keep existing logic but it will have much less work
- Most icons already fetched during session
- Only handles edge cases (very new apps opened right before session end)

### Phase 4: Handle Edge Cases

#### 4.1 Synthetic Bundle IDs
- Keep the filter for `com.apple.system`
- Add to both pre-fetch and end-of-session fetch

#### 4.2 Rapid App Switching
- The `seen_bundles` set prevents duplicate fetches
- If user rapidly switches between many apps, fetches queue up naturally

#### 4.3 Session Interruption
- If session ends while fetches are in progress, they continue
- Database updates are atomic

## Benefits of This Approach

1. **Icons Ready at Session End**: By the time summary view loads, most/all icons are fetched
2. **Distributed Load**: Icon fetching spread throughout session vs. burst at end
3. **No UI Blocking**: All fetching remains asynchronous
4. **Backward Compatible**: Falls back to end-of-session fetch if needed
5. **Efficient**: Only fetches each icon once per app lifetime

## Testing Strategy

1. **Unit Tests**:
   - Test `IconManager` with mock database
   - Test deduplication logic
   - Test synthetic bundle ID filtering

2. **Integration Tests**:
   - Start session, open multiple apps
   - Verify icons in database before session end
   - Check summary view has all icons

3. **Performance Tests**:
   - Measure impact on window tracking performance
   - Ensure no UI lag during icon fetching

## Rollback Plan

If issues arise:
1. Remove `IconManager` integration from loop_worker
2. Rely solely on existing end-of-session fetching
3. No database schema changes required - safe to rollback

## Implementation Order

1. ✅ Create this plan document
2. ⬜ Implement `IconManager` module
3. ⬜ Add `has_icon()` method to apps repository
4. ⬜ Integrate with loop_worker
5. ⬜ Add logging for debugging
6. ⬜ Test with real sessions
7. ⬜ Update the check for synthetic bundle IDs in both places

## Questions to Resolve

1. **Concurrency Limit**: Should we limit parallel icon fetches? (Probably not needed - OS handles it)
2. **Retry Logic**: If icon fetch fails, retry during session? (No - let end-of-session handle)
3. **Cache Duration**: Keep `seen_bundles` only per session? (Yes - clear on session start)