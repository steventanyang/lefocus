# Icon Fetching Race Condition Analysis

## Problem Statement

When a session ends, the summary view appears immediately, but app icons are sometimes missing (e.g., only 3/4 icons load) even though all apps exist in the database and appear in the activity view later.

## Current Architecture

### 1. Session End Flow

When a session ends:
1. Segments are created from the raw window data
2. `insert_segments()` is called ([segments.rs:86](../../src-tauri/src/db/repositories/segments.rs#L86))
3. Transaction executes:
   - Apps are ensured in the `apps` table with `icon_data_url = NULL`
   - Segments are inserted
   - Bundle IDs without icons are collected
4. **After transaction commits**, `spawn_icon_fetch_task()` spawns a background task
5. UI immediately navigates to summary view
6. Summary view queries the database for apps

### 2. The Race Condition

```
Timeline:
T0: Session ends
T1: Database transaction commits (apps exist with NULL icons)
T2: Background icon fetch task spawned (async, non-blocking)
T3: UI navigates to summary view
T4: Summary view queries apps table ← RACE HAPPENS HERE
T5-Tn: Icons gradually get fetched and stored (background task running)
```

**The Problem**: There's no synchronization between:
- The background icon fetching task (T2-Tn)
- The summary view data load (T4)

### 3. Current Icon Fetching Implementation

Located in [segments.rs:55-81](../../src-tauri/src/db/repositories/segments.rs#L55-L81):

```rust
fn spawn_icon_fetch_task(db: Database, bundle_ids: HashSet<String>) {
    // ... filtering logic ...

    tokio::spawn(async move {  // ← ASYNC, NON-BLOCKING
        for bundle_id in bundle_ids_to_fetch {
            match crate::macos_bridge::get_app_icon_data(&bundle_id) {
                Some(icon_data_url) => {
                    // Update database with icon
                    db.update_app_icon(&bundle_id, &icon_data_url).await
                }
                None => {
                    log::warn!("Failed to fetch icon for {}", bundle_id);
                }
            }
        }
    });
    // Function returns immediately, doesn't wait for completion
}
```

### 4. Why Some Icons Load

Icons that DO appear in the summary view are likely:
1. **Already cached** from previous sessions (icon_data_url != NULL in apps table)
2. **Fetched quickly enough** to beat the summary view query (lucky timing)

Icons that DON'T appear:
1. **New apps** that haven't been seen before
2. Apps where the FFI call takes longer (larger icons, system load, etc.)

## Root Cause

The root cause is the **fire-and-forget** nature of `spawn_icon_fetch_task()`:
- It spawns a tokio task and returns immediately
- There's no way to await its completion
- The UI doesn't know when icons are ready

## Design Considerations

### Option 1: Synchronous Icon Fetching (Not Recommended)
- Block `insert_segments()` until all icons are fetched
- ❌ Would make session end slow and unresponsive
- ❌ Poor UX - user waits for all icons before seeing summary

### Option 2: Progressive Loading with Notifications
- Keep background fetching but add a notification mechanism
- ✅ Summary view subscribes to icon updates
- ✅ Icons appear as they're fetched
- ✅ Non-blocking, good UX

### Option 3: Pre-fetch Icons During Session
- Fetch icons when apps are first detected during the session
- ✅ Icons ready by session end
- ✅ Spreads load over time
- ❌ Still might miss very recently opened apps

### Option 4: Hybrid Approach (Recommended)
1. Pre-fetch during session (Option 3)
2. Quick sync fetch for missing icons at session end (with timeout)
3. Background fetch for any remaining
4. Progressive updates in UI (Option 2)

## Implementation Path

### Phase 1: Add Icon Update Events
1. Create an event system for icon updates
2. Emit events when `update_app_icon()` completes
3. Summary view subscribes and updates dynamically

### Phase 2: Pre-fetching During Session
1. When `ensure_app_exists()` is called during active session
2. Check if icon is missing
3. Trigger icon fetch immediately (don't wait for session end)

### Phase 3: Quick Sync at Session End
1. Before showing summary, attempt quick icon fetch
2. Use short timeout (e.g., 500ms)
3. Fall back to background for slow fetches

## Current Workaround

The activity view doesn't have this problem because:
- It loads after icons have been fetched in background
- Users typically don't navigate there immediately

## Code References

- Icon fetch trigger: [segments.rs:55-81](../../src-tauri/src/db/repositories/segments.rs#L55-L81)
- Segment insertion: [segments.rs:86-163](../../src-tauri/src/db/repositories/segments.rs#L86-L163)
- FFI bridge: [macos_bridge.rs:303-321](../../src-tauri/src/macos_bridge.rs#L303-L321)
- Swift icon provider: [AppIconProvider.swift](../../src-tauri/plugins/macos-sensing/Sources/MacOSSensing/AppIconProvider.swift)
- System bundle ID assignment: [loop_worker.rs:82-86](../../src-tauri/src/sensing/loop_worker.rs#L82-L86)