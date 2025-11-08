# Phase 5.6: Island Timer Controls

**Status**: ✅ Implemented
**Date**: November 2025
**Dependencies**: Phase 5.5 (Island Audio), Phase 1 (Swift Plugin Bridge)

---

## Overview

Adds **End** and **Cancel** buttons to the Dynamic Island's expanded state, allowing users to control running timers directly from the island interface without switching to the main app window.

### Goals

- Provide in-island controls for ending/canceling active timers
- Maintain consistency with existing audio control patterns
- Support different button layouts for Stopwatch vs Countdown modes
- Integrate seamlessly with existing timer session management

---

## User Experience

### Visual Layout

**Expanded Island State:**

```
┌─────────────────────────────────────────────────┐
│  [Waveform]                              05:23  │ ← Timer display
│               Track Info                        │
│                                                 │
│  [⏮ ⏯ ⏭]                      [End] [Cancel]   │ ← Controls row
└─────────────────────────────────────────────────┘
     ↑ Media controls (left)      ↑ Timer controls (right)
```

### Button Visibility Rules

| Timer Mode | Timer State | Buttons Shown |
|------------|-------------|---------------|
| Stopwatch | Running | `[End] [Cancel]` |
| Stopwatch | Idle | _(none)_ |
| Countdown | Running | `[Cancel]` |
| Countdown | Idle | _(none)_ |

### Button Behavior

**End Button (Stopwatch only):**
- Stops the timer and **saves the session** as `Completed`
- Runs segmentation to analyze the session
- Emits `session-completed` event
- Triggers full session processing

**Cancel Button (Both modes):**
- Stops the timer and **saves the session** as `Cancelled`
- Does **not** run segmentation
- Marks session as cancelled in database

### Interaction States

**Normal State:**
- Semi-transparent white background (15% for Cancel, 25% for End)
- White border (20% opacity)
- White text (85-95% opacity)

**Hover State:**
- Brighter background (25% for Cancel, 35% for End)
- Brighter border (40% opacity)
- Text remains same brightness
- Smooth transition

---

## Architecture

### Component Hierarchy

```
Rust (lib.rs)
├── AppState (holds TimerController)
├── macos_bridge.rs (FFI layer)
│   ├── APP_HANDLE (static storage)
│   └── Callback handlers
│
C Shim (MacOSSensingFFI.c)
├── g_timer_end_callback (function pointer)
├── g_timer_cancel_callback (function pointer)
└── Trigger functions
│
Swift (MacOSSensing)
├── IslandController
│   ├── endTimer() → C trigger
│   └── cancelTimer() → C trigger
│
└── IslandView
    ├── timerEndButton (ButtonArea)
    ├── timerCancelButton (ButtonArea)
    ├── layoutTimerControlButtonRects()
    ├── drawTimerControlButtonsIfNeeded()
    └── mouseDown() → delegate callbacks
```

### Data Flow

#### Initialization (App Startup)

```
1. lib.rs::setup()
   ↓
2. macos_bridge::set_app_handle(handle)
   → Stores AppHandle in static OnceLock
   ↓
3. macos_bridge::setup_timer_callbacks()
   ↓
4. C::macos_sensing_set_timer_end_callback(rust_timer_end_callback)
   C::macos_sensing_set_timer_cancel_callback(rust_timer_cancel_callback)
   → Registers Rust callbacks in C layer
```

#### User Interaction Flow (End Timer)

```
1. User clicks "End" button in island
   ↓
2. IslandView::mouseDown()
   → Hit test: timerEndButton.rect.contains(location)
   ↓
3. IslandViewInteractionDelegate::islandViewDidRequestEndTimer()
   ↓
4. IslandController::endTimer()
   ↓
5. Swift → C FFI: macos_sensing_trigger_end_timer()
   ↓
6. C::macos_sensing_trigger_end_timer()
   → if (g_timer_end_callback != NULL) g_timer_end_callback()
   ↓
7. Rust::rust_timer_end_callback()
   ↓
8. Rust::handle_island_end_timer()
   → Get APP_HANDLE
   → Get AppState from handle
   → Get TimerController from state
   ↓
9. tokio::spawn(async { timer.end_timer().await })
   ↓
10. TimerController::end_timer()
    → Stops timer
    → Marks session as Completed
    → Runs segmentation
    → Saves to database
    → Emits session-completed event
```

---

## Implementation Details

### 1. Swift UI Layer

**File**: `IslandView.swift`

**Button Areas:**
```swift
private var timerEndButton = ButtonArea()
private var timerCancelButton = ButtonArea()

// Debouncing for timer control buttons
private var lastTimerButtonClickTime: TimeInterval?
private let timerButtonDebounceInterval: TimeInterval = 0.5  // 500ms
```

**Layout Logic:**
```swift
private func layoutTimerControlButtonRects() {
    guard isExpanded, !isIdle else {
        timerEndButton = ButtonArea()
        timerCancelButton = ButtonArea()
        return
    }

    let buttonWidth: CGFloat = 60.0
    let buttonHeight: CGFloat = 24.0
    let spacing: CGFloat = 8.0
    let bottomY: CGFloat = 20.0
    let rightPadding: CGFloat = 16.0

    if mode == .stopwatch {
        // Show both buttons
        timerCancelButton.rect = NSRect(
            x: bounds.maxX - rightPadding - buttonWidth,
            y: bottomY, width: buttonWidth, height: buttonHeight
        )
        timerEndButton.rect = NSRect(
            x: bounds.maxX - rightPadding - (buttonWidth * 2.0) - spacing,
            y: bottomY, width: buttonWidth, height: buttonHeight
        )
    } else {
        // Countdown: only Cancel
        timerCancelButton.rect = NSRect(
            x: bounds.maxX - rightPadding - buttonWidth,
            y: bottomY, width: buttonWidth, height: buttonHeight
        )
        timerEndButton.rect = .zero
    }
}
```

**Drawing:**
```swift
private func drawTextButton(_ button: ButtonArea, text: String, emphasized: Bool) {
    guard button.rect != .zero else { return }

    // Rounded rectangle background
    let bgPath = NSBezierPath(roundedRect: button.rect, xRadius: 6.0, yRadius: 6.0)

    // Background fill
    if emphasized {
        NSColor.white.withAlphaComponent(button.isHovered ? 0.25 : 0.15).setFill()
    } else {
        NSColor.white.withAlphaComponent(button.isHovered ? 0.15 : 0.08).setFill()
    }
    bgPath.fill()

    // Border
    NSColor.white.withAlphaComponent(button.isHovered ? 0.4 : 0.2).setStroke()
    bgPath.lineWidth = 1.0
    bgPath.stroke()

    // Text (centered)
    let fontSize: CGFloat = 11.0
    let textColor = NSColor.white.withAlphaComponent(emphasized ? 0.95 : 0.85)
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize, weight: emphasized ? .semibold : .regular),
        .foregroundColor: textColor
    ]
    let string = NSAttributedString(string: text, attributes: attributes)
    let origin = NSPoint(
        x: button.rect.midX - string.size().width / 2.0,
        y: button.rect.midY - string.size().height / 2.0
    )
    string.draw(at: origin)
}
```

**Interaction Handling with Debouncing:**
```swift
override func mouseDown(with event: NSEvent) {
    let location = convert(event.locationInWindow, from: nil)
    if isExpanded {
        layoutPlaybackButtonRects()
        layoutTimerControlButtonRects()

        // ... playback buttons ...

        // Debounce timer control buttons to prevent double-click issues
        if timerEndButton.rect.contains(location) || timerCancelButton.rect.contains(location) {
            let now = Date().timeIntervalSince1970
            if let lastClick = lastTimerButtonClickTime,
               now - lastClick < timerButtonDebounceInterval {
                return  // Debounce: ignore rapid clicks
            }
            lastTimerButtonClickTime = now

            if timerEndButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestEndTimer(self)
                return
            }
            if timerCancelButton.rect.contains(location) {
                interactionDelegate?.islandViewDidRequestCancelTimer(self)
                return
            }
        }
    }
    interactionDelegate?.islandViewDidRequestToggleExpansion(self)
}
```

**Hover Tracking:**
```swift
override func mouseMoved(with event: NSEvent) {
    guard isExpanded else { return }
    let point = convert(event.locationInWindow, from: nil)
    layoutTimerControlButtonRects()

    let wasHoveringEnd = timerEndButton.isHovered
    let wasHoveringCancel = timerCancelButton.isHovered

    timerEndButton.isHovered = timerEndButton.rect.contains(point)
    timerCancelButton.isHovered = timerCancelButton.rect.contains(point)

    if wasHoveringEnd != timerEndButton.isHovered ||
       wasHoveringCancel != timerCancelButton.isHovered {
        needsDisplay = true
    }
}
```

---

### 2. Swift Controller Layer

**File**: `IslandController.swift`

**FFI Declarations:**
```swift
// C FFI functions for triggering Rust callbacks
@_silgen_name("macos_sensing_trigger_end_timer")
func macos_sensing_trigger_end_timer()

@_silgen_name("macos_sensing_trigger_cancel_timer")
func macos_sensing_trigger_cancel_timer()
```

**Public Methods:**
```swift
public func endTimer() {
    // Trigger Rust callback via C shim
    macos_sensing_trigger_end_timer()
}

public func cancelTimer() {
    // Trigger Rust callback via C shim
    macos_sensing_trigger_cancel_timer()
}
```

**Delegate Implementation:**
```swift
extension IslandController: IslandViewInteractionDelegate {
    func islandViewDidRequestEndTimer(_ view: IslandView) {
        endTimer()
    }

    func islandViewDidRequestCancelTimer(_ view: IslandView) {
        cancelTimer()
    }
}
```

---

### 3. C Shim Layer

**File**: `MacOSSensingFFI.h`

```c
// Timer control callback types
typedef void (*TimerEndCallback)(void);
typedef void (*TimerCancelCallback)(void);

// Rust sets these callbacks during initialization
void macos_sensing_set_timer_end_callback(TimerEndCallback callback);
void macos_sensing_set_timer_cancel_callback(TimerCancelCallback callback);

// Swift calls these to trigger Rust actions
void macos_sensing_trigger_end_timer(void);
void macos_sensing_trigger_cancel_timer(void);
```

**File**: `MacOSSensingFFI.c`

```c
// Static storage for callback function pointers
static TimerEndCallback g_timer_end_callback = NULL;
static TimerCancelCallback g_timer_cancel_callback = NULL;

// Called by Rust during initialization
void macos_sensing_set_timer_end_callback(TimerEndCallback callback) {
    g_timer_end_callback = callback;
}

void macos_sensing_set_timer_cancel_callback(TimerCancelCallback callback) {
    g_timer_cancel_callback = callback;
}

// Called by Swift when user clicks buttons
void macos_sensing_trigger_end_timer(void) {
    if (g_timer_end_callback != NULL) {
        g_timer_end_callback();
    }
}

void macos_sensing_trigger_cancel_timer(void) {
    if (g_timer_cancel_callback != NULL) {
        g_timer_cancel_callback();
    }
}
```

---

### 4. Rust Bridge Layer

**File**: `macos_bridge.rs`

**Static App Handle Storage:**
```rust
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn set_app_handle(handle: AppHandle) {
    // Panic on duplicate calls - indicates initialization bug
    // Prevents silent failures with stale AppHandle during plugin reload
    APP_HANDLE.set(handle).expect(
        "set_app_handle called twice; this indicates a bug in initialization"
    );
}

fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}
```

**FFI Extern Declarations:**
```rust
extern "C" {
    fn macos_sensing_set_timer_end_callback(callback: extern "C" fn());
    fn macos_sensing_set_timer_cancel_callback(callback: extern "C" fn());
}
```

**Callback Handlers:**
```rust
pub fn handle_island_end_timer() {
    if let Some(app_handle) = get_app_handle() {
        if let Some(state) = app_handle.try_state::<crate::AppState>() {
            let timer = state.timer.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = timer.end_timer().await {
                    eprintln!("Failed to end timer from island: {}", e);
                }
            });
        }
    }
}

pub fn handle_island_cancel_timer() {
    if let Some(app_handle) = get_app_handle() {
        if let Some(state) = app_handle.try_state::<crate::AppState>() {
            let timer = state.timer.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = timer.cancel_timer().await {
                    eprintln!("Failed to cancel timer from island: {}", e);
                }
            });
        }
    }
}
```

**C Callback Registration:**
```rust
extern "C" fn rust_timer_end_callback() {
    handle_island_end_timer();
}

extern "C" fn rust_timer_cancel_callback() {
    handle_island_cancel_timer();
}

pub fn setup_timer_callbacks() {
    unsafe {
        macos_sensing_set_timer_end_callback(rust_timer_end_callback);
        macos_sensing_set_timer_cancel_callback(rust_timer_cancel_callback);
    }
}
```

---

### 5. App Initialization

**File**: `lib.rs`

```rust
// During app setup (inside .setup() hook)
#[cfg(target_os = "macos")]
{
    macos_bridge::set_app_handle(app.handle().clone());
    macos_bridge::setup_timer_callbacks();
    macos_bridge::island_init();
    macos_bridge::audio_start_monitoring();
}
```

**Initialization Order:**
1. Store AppHandle for FFI access
2. Register timer control callbacks with C layer
3. Initialize island window (shows "00:00" idle state)
4. Start audio monitoring

---

## Key Design Decisions

### 1. Callback-Based Architecture

**Why?** Swift needs to call Rust, but Swift compiles before Rust during build.

**Solution:** C callback registry pattern:
- C layer provides callback registration functions
- Rust registers callbacks during app initialization
- Swift calls C trigger functions
- C invokes registered Rust callbacks

**Alternative Considered:** Direct Swift → Rust FFI with weak linking
- **Rejected**: `@_weakLinked` didn't work reliably for this use case

---

### 2. Static AppHandle Storage

**Why?** FFI callbacks need access to Tauri's managed state (TimerController).

**Solution:** `OnceLock<AppHandle>` stored in `macos_bridge.rs`
- Thread-safe single initialization
- Provides access to `AppState` from C callback context
- Set once during app setup, never changes

**Alternatives Considered:**
- Global mutable static: Unsafe, requires `Mutex`
- Thread-local storage: Overcomplicated for single app instance

---

### 3. Async Spawn in Callbacks

**Why?** C callbacks are synchronous, but `end_timer()` is async.

**Solution:** Use `tauri::async_runtime::spawn()` to run async code
- Doesn't block the FFI callback
- Proper error handling via eprintln
- Matches Tauri's async runtime

---

### 4. Mode-Specific Button Layout

**Stopwatch Mode:**
- Shows `[End] [Cancel]` - user can complete or discard session
- End button emphasized (higher opacity)

**Countdown Mode:**
- Shows `[Cancel]` only - countdown auto-completes at 0:00
- No "End" button needed (would be redundant)

**Idle State:**
- No buttons shown - nothing to control

---

### 5. Click Debouncing (500ms)

**Why?** Double-clicking timer buttons could spawn multiple async operations:
- Race conditions in timer state
- Duplicate database writes
- Multiple segmentation runs
- Inconsistent UI state

**Solution:** UI-level debouncing in `IslandView`
- Track `lastTimerButtonClickTime` (timestamp of last click)
- Ignore clicks within 500ms window
- Simple, single point of control
- No performance overhead

**Why 500ms?**
- Long enough to block accidental double-clicks
- Short enough to be imperceptible for intentional use
- Standard debounce duration for critical actions

**Alternatives Considered:**
- **Rust-level atomic guard**: Rejected as too complex, UI layer is sufficient
- **Button disable state**: Rejected to avoid UI flashing/complexity
- **Longer debounce (1s+)**: Rejected as potentially frustrating for users

---

### 6. Defense in Depth: Timer Mode Validation

**Why?** The UI hides the End button for countdown timers, but there's no Rust-layer defense:
- **Attack vectors**: Stale UI state, race conditions, direct FFI calls, future bugs
- **Impact**: Countdown could be wrongly marked Completed and run segmentation
- **Risk**: Database corruption with incorrect session status

**Solution:** Mode validation in `TimerController::end_timer()`

```rust
pub async fn end_timer(&self) -> Result<SessionInfo> {
    let mut state = self.state.lock().await;

    if state.status == TimerStatus::Idle {
        return Err(anyhow!("no active session to end"));
    }

    // Validate mode: end_timer() is only valid for stopwatch mode
    if state.mode != TimerMode::Stopwatch {
        return Err(anyhow!(
            "end_timer() is only valid for stopwatch mode (current mode: {:?})",
            state.mode
        ));
    }

    // ... proceed with ending timer
}
```

**Benefits:**
- **Fail-fast**: Invalid calls rejected immediately at Rust layer
- **Defense in depth**: UI layer hides button + Rust layer validates mode
- **Clear errors**: Mode mismatch logged with diagnostic context
- **Future-proof**: Protects against any entry point (IPC, FFI, future UI)

**Why Not `cancel_timer()`?**
- `cancel_timer()` is valid for **both** countdown and stopwatch modes
- Countdown can be cancelled mid-run (user decision to abort)
- Stopwatch can be cancelled without saving (discard session)
- No mode validation needed

---

### 7. Fail-Fast on Duplicate AppHandle

**Why?** `OnceLock::set()` returns `Result` but was previously ignored with `let _`:
- **Risk**: Second call during hot reload/plugin reinit silently fails
- **Impact**: Callbacks bound to stale `AppHandle` → panic or no-op
- **Very hard to debug**: No clear error pointing to the issue

**Solution:** Panic on duplicate `set_app_handle()` calls

```rust
pub fn set_app_handle(handle: AppHandle) {
    APP_HANDLE.set(handle).expect(
        "set_app_handle called twice; this indicates a bug in initialization"
    );
}
```

**Why Panic Instead of Log?**
- **Fail-fast**: Forces fix during development
- **Production safety**: `.setup()` called only once in prod
- **Clear diagnosis**: Stack trace points to duplicate call site
- **Prevents corruption**: No stale handle = no silent failures

**When This Triggers:**
- ✅ Integration tests calling setup multiple times (good catch!)
- ✅ Plugin reload bug (exposes initialization issue)
- ❌ Normal dev hot reload (full process restart resets `OnceLock`)
- ❌ Production (setup called once)

**Alternatives Considered:**
- **Log warning + ignore**: Silent failure still possible
- **RwLock + replace**: Performance overhead, hides root cause
- **Panic with expect**: ✅ **Chosen** - simplest, safest, debuggable

---

## Testing Checklist

### Visual Testing
- [ ] Buttons appear in expanded state when timer running
- [ ] Buttons hidden when timer idle
- [ ] Stopwatch shows both End and Cancel
- [ ] Countdown shows only Cancel
- [ ] Hover effects work smoothly
- [ ] Button text is readable
- [ ] Buttons don't overlap with timer display or media controls

### Interaction Testing
- [ ] Click "End" in stopwatch mode ends timer
- [ ] Click "Cancel" in stopwatch mode cancels timer
- [ ] Click "Cancel" in countdown mode cancels timer
- [ ] Session saved with correct status (Completed vs Cancelled)
- [ ] Segmentation runs for End, not for Cancel
- [ ] Events emitted correctly
- [ ] Island resets to idle state after End/Cancel

### Edge Cases
- [ ] Rapid clicking doesn't cause crashes or duplicate operations
- [ ] Double-clicking is properly debounced (second click ignored within 500ms)
- [ ] Clicking during state transitions (expanding/collapsing)
- [ ] Multiple timers started/stopped in quick succession
- [ ] App restart with running timer (recovery)
- [ ] Debounce resets properly between different button clicks

### Mode Validation Testing
- [ ] Calling `end_timer()` on countdown mode returns error (not allowed)
- [ ] Calling `end_timer()` on stopwatch mode succeeds (allowed)
- [ ] Calling `cancel_timer()` on countdown mode succeeds (allowed)
- [ ] Calling `cancel_timer()` on stopwatch mode succeeds (allowed)
- [ ] Error message includes current mode for debugging
- [ ] Mode validation happens before any state changes

---

## Future Enhancements

### Potential Additions
1. **Pause/Resume Button**: Pause timer without ending session
2. **Add Time Button**: Quick +5min extension for countdown
3. **Haptic Feedback**: Subtle click feedback on button press
4. **Keyboard Shortcuts**: Cmd+E to end, Cmd+. to cancel
5. **Confirmation Dialog**: "Are you sure?" for long sessions

### Known Limitations
- Buttons only appear when island is expanded
- No visual indication of button action completion
- No undo for accidental End/Cancel

---

## File Manifest

### Modified Files
```
src-tauri/
├── src/
│   ├── lib.rs                          (+3 lines: setup calls)
│   ├── macos_bridge.rs                 (+80 lines: callback system)
│   └── timer/controller.rs             (+7 lines: mode validation)
│
└── plugins/macos-sensing/
    ├── Sources/
    │   ├── CMacOSSensing/
    │   │   ├── include/MacOSSensingFFI.h   (+10 lines: callback types)
    │   │   └── MacOSSensingFFI.c          (+24 lines: callback impl)
    │   │
    │   └── MacOSSensing/
    │       └── Island/
    │           ├── IslandController.swift   (+22 lines: FFI calls)
    │           └── IslandView.swift        (+180 lines: UI + debouncing)
```

### New Files
```
system-design/
└── phase-5.6-island-timer-controls.md   (this document)
```

---

## Metrics

**Lines of Code:**
- Swift: ~180 lines (UI + debouncing)
- Rust: ~90 lines (callbacks + mode validation)
- C: ~34 lines (callback registry)
- **Total**: ~304 lines

**Files Changed**: 8

**Build Time Impact**: Negligible (no new dependencies)

---

## References

- **Phase 1**: [Swift Plugin Bridge](./phase-1-swift-plugin.md)
- **Phase 5**: [Island Timer](./phase-5-island-timer.md)
- **Phase 5.5**: [Island Audio](./phase-5.5-island-audio.md)
- **Timer Controller**: [controller.rs](../src-tauri/src/timer/controller.rs)

---

**Document Version**: 1.2
**Last Updated**: November 8, 2025
**Author**: Claude Code + User
**Changelog**:
- v1.2: Added fail-fast panic for duplicate AppHandle initialization
- v1.1: Added click debouncing (500ms) and timer mode validation
- v1.0: Initial implementation with End/Cancel buttons
