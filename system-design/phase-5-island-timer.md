# LeFocus: Dynamic Island Timer Display

**Version:** 1.0
**Date:** January 2025
**Phase:** Optional Enhancement (Post-P0)
**Status:** Implemented
**Approach:** Swift-based floating window overlay

---

## Document Purpose

This document specifies the design and implementation of a **macOS Dynamic Island-style timer display** for LeFocus. This floating UI element provides persistent, at-a-glance timer status while users work across applications.

**Goal:** Create a minimal, unobtrusive floating timer that:

1. Shows timer countdown/stopwatch at top-center of screen
2. Integrates seamlessly with existing Tauri timer state
3. Follows macOS native UI patterns (menu bar level, borderless)
4. Aligns with notch on modern MacBooks

**Success Criteria:** The floating island appears during active sessions, displays accurate time, syncs with Rust heartbeat, and uses ≤2% CPU overhead.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Swift Implementation](#3-swift-implementation)
4. [FFI Bridge Layer](#4-ffi-bridge-layer)
5. [Rust Integration](#5-rust-integration)
6. [React Integration](#6-react-integration)
7. [UI/UX Specifications](#7-uiux-specifications)
8. [Build System](#8-build-system)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance Targets](#10-performance-targets)

---

## 1. Overview

### 1.1 What We Are Building

A **floating window** positioned at the top-center of the screen that mimics the iPhone Dynamic Island aesthetic:

- **Idle state**: Black notch-shaped pill showing "00:00" when no timer is active (dimmed text)
- **Active state**: Black notch-shaped pill showing timer countdown/stopwatch (e.g., "24:38")
- **Notch alignment**: On MacBooks with notches, aligns with the camera housing

### 1.2 Technical Approach

**Swift Native Window**

- Two-window hierarchy: pass-through parent + interactive child
- Parent: full-screen, ignores mouse events, tracks display changes
- Child: notch-aligned pill, level `.mainMenu + 2`, hosts `IslandView`
- Custom `NSView` draws notch-shaped path (curved top corners)

**Communication Pattern**

```
React UI (Tauri) ←→ Rust Commands ←→ Swift FFI ←→ NSPanel Controller
       ↓                 ↑
  Timer Heartbeat   Periodic Sync (Rust authoritative)
       ↓
 Swift Timer Loop (renders every 1s)
```

### 1.3 Why Swift?

- **Native performance**: Direct access to AppKit, no web view overhead
- **System integration**: Proper window levels, multi-display support
- **Existing infrastructure**: Already have Swift plugin, FFI bridge
- **Polish**: Native animations, shadows, blur effects

### 1.4 Out of Scope (v1)

- Multi-session display (only current active session)
- Hover expansion (future)
- Pause/resume integration (island continues running, Rust handles state)
- Custom positioning (always top-center)

---

## 2. Architecture

### 2.1 Component Overview

```
┌────────────────────────────────────────────────────┐
│               Main Tauri Window                     │
│  (React UI - TimerView, TimerControls)              │
│                                                     │
│  useTimerSnapshot() → polls timer state every 100ms (existing behavior for web UI) │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ Timer state changes
                  ↓
┌─────────────────────────────────────────────────────┐
│          Rust Timer Controller (lib.rs)             │
│                                                     │
│  - Manages TimerState (idle/running)                │
│  - Exposes Tauri commands                          │
│  - Emits island_start payload and heartbeat sync          │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ FFI calls
                  ↓
┌─────────────────────────────────────────────────────┐
│      Swift Island Plugin (IslandController.swift)   │
│                                                     │
│  - Creates/manages NSPanel                         │
│  - Custom IslandView (draws pill UI)                │
│  - FFI exports:                                     │
│    • island_init()                                   │
│    • island_start(start_uptime_ms, target_ms, mode) │
│    • island_sync(value_ms)                          │
│    • island_reset()                                  │
└─────────────────────────────────────────────────────┘
                  │
                  ↓
          ┌──────────────────┐
          │  Floating Window  │
          │   ╭─────────╮    │
          │   │ 24:38   │    │  ← Compact state
          │   ╰─────────╯    │
          └──────────────────┘
```

### 2.2 Data Flow

**App Launch:**

1. App initializes and calls `island_init()` via FFI.
2. Swift creates the island window and displays "00:00" in idle state (slightly transparent).
3. Island remains visible but dimmed until a timer starts.

**Timer Start:**

1. User clicks "Start" in the React UI.
2. Tauri command `start_timer()` runs in Rust.
3. Rust updates `TimerState` to running and records `start_uptime_ms` (from `mach_absolute_time`) plus `target_ms`.
4. Rust calls `island_start(IslandStartPayload)` via FFI. The payload includes `start_uptime_ms`, `target_ms`, and `mode`.
5. Swift transitions from idle to active state, caches the payload, and starts its one-second render timer.

**Swift Render Loop (every 1s):**

1. Swift computes a display value using the cached payload and `ProcessInfo.processInfo.systemUptime` (remaining time for countdown, elapsed time for stopwatch).
2. The island view redraws with the new `MM:SS` value.

**Rust Heartbeat Sync (every heartbeat interval):**

1. Rust heartbeats that already drive the React UI obtain an authoritative timer measurement (remaining for countdown, elapsed for stopwatch).
2. The heartbeat calls `island_sync(value_ms)` via FFI with that measurement.
3. Swift compares the authoritative value with its local estimate and corrects drift greater than a tolerance (for example 250 ms).

**Timer End, Cancel:**

1. User action triggers the relevant Tauri command.
2. Rust updates `TimerState` and calls `island_reset()`.
3. Swift stops its internal timer and returns to idle state (shows "00:00", slightly transparent).

**Note:** Pause/resume FFI functions exist but are not currently called from Rust. The island continues its render loop; Rust remains authoritative via heartbeat sync.

### 2.3 Window Positioning Logic

The island uses a two-window hierarchy to align with the notch while keeping the desktop clickable:

- **Parent window**: Full-screen, level `.mainMenu + 1`, ignores mouse events, tracks display changes
- **Child window**: Notch-aligned frame (300x36), level `.mainMenu + 2`, hosts `IslandView`

Positioning prefers the built-in display and uses `NSScreen.lf_notchRect` when available. The parent listens for `NSApplication.didChangeScreenParametersNotification` to reposition on display changes.

---

## 3. Swift Implementation

### 3.1 Files

```
src-tauri/plugins/macos-sensing/Sources/MacOSSensing/
├── Island/
│   ├── IslandController.swift    # Window management, two-window hierarchy
│   ├── IslandView.swift           # Custom NSView with notch-shaped path
│   └── IslandFFITypes.swift       # IslandMode enum, IslandStartPayload struct
```

### 3.2 IslandController.swift

**Key implementation details:**

- Two-window hierarchy: `window` (pass-through parent) and `islandWindow` (pill host)
- Screen observer for `NSApplication.didChangeScreenParametersNotification`
- Render timer fires every 1s, reseeds clock on authoritative sync
- Window dimensions: 300x36px, positioned via `islandFrame(for:)` using `lf_notchRect`

```swift
public final class IslandController {
    public static let shared = IslandController()

    private var window: NSPanel?           // Pass-through parent
    private var islandWindow: NSPanel?       // Pill host
    private var islandView: IslandView?
    private var renderTimer: Timer?
    private var screenObserver: NSObjectProtocol?

    private var startUptimeMs: Int64 = 0
    private var targetMs: Int64?
    private var mode: IslandMode = .countdown
    private var isIdle: Bool = true

    // ensureWindowHierarchy() creates/updates both windows
    // islandFrame(for:) computes notch-aligned rect (300x36)
    // reseedClock() adjusts startUptimeMs on sync to prevent drift
}
```

### 3.3 IslandView.swift

**Key implementation details:**

- Draws notch-shaped path: bottom corners curve inward, top corners curve outward
- Text: left-aligned with 12px padding, 13px monospace font
- Stopwatch mode shows ⏱ indicator to the right of time
- Idle state dims text (0.6 alpha) but background remains black

```swift
final class IslandView: NSView {
    private func createNotchPath() -> NSBezierPath {
        // Bottom corners: inward curves (radius = height/2)
        // Top corners: outward curves (negative radius)
        // Creates Dynamic Island notch shape
    }

    private func drawTimerText() {
        // Left-aligned at x=12px
        // Font: monospacedSystemFont(ofSize: 13, weight: .medium)
        // Color: white (idle: 0.6 alpha)
    }
}
```

### 3.4 IslandFFITypes.swift

```swift
public enum IslandMode: String {
    case countdown
    case stopwatch
}

public struct IslandStartPayload {
    public let startUptimeMs: Int64
    public let targetMs: Int64  // 0 for stopwatch mode
    public let mode: IslandMode
}
```

### 3.5 FFI Exports

FFI functions are exported in `FFIExports.swift`:

- `macos_sensing_swift_island_init()`
- `macos_sensing_swift_island_start(startUptimeMs:targetMs:modePtr:)`
- `macos_sensing_swift_island_sync(valueMs:)`
- `macos_sensing_swift_island_pause()` (not used from Rust)
- `macos_sensing_swift_island_resume()` (not used from Rust)
- `macos_sensing_swift_island_reset()`
- `macos_sensing_swift_island_cleanup()`

### 3.6 IslandSpaceManager.swift (Persistent CGS Space)

Mission Control transitions were briefly hiding the island even with `.canJoinAllSpaces` because macOS treated the panels as part of the active desktop animation. To keep the island visible we mirror MewNotch’s approach and move both NSPanels into a dedicated Core Graphics Services (CGS) space:

- `IslandSpaceManager` lazily creates a CGS space with the **desktop-render flag (`options = 0x1`)** so Finder does not attempt to draw desktop contents in it. The space is set to the max absolute level (`Int32.max`) and shown immediately.
- `attach(window:)` waits until the panel has a valid `windowNumber` (panel ordered on screen) before calling `CGSAddWindowsToSpaces`, ensuring every panel actually lands in the persistent space. Attach calls are always marshalled to the main thread.
- Cleanup removes windows with `CGSRemoveWindowsFromSpaces`, calls `CGSHideSpaces` to keep Finder bookkeeping consistent, and finally destroys the CGS space. This prevents Mission Control from listing ghost spaces or logging `space still visible` errors.
- `IslandController` simply calls `IslandSpaceManager.shared.attach/detach` when windows are created/teardown. This isolates all private CGS usage in a single helper and keeps the window code readable.

The result is a truly persistent island that stays visible above Mission Control, stage manager, and space swipes while still honoring fullscreen and display changes.

---

## 4. FFI Bridge Layer

FFI bridge consists of C header (`MacOSSensingFFI.h`), C shim (`MacOSSensingFFI.c`), and Rust bindings (`macos_bridge.rs`). All island functions are implemented:

- C header declares `macos_sensing_island_*` functions
- C shim forwards to Swift `@_cdecl` exports
- Rust bindings wrap C calls with `unsafe` blocks

**Rust functions:**

- `island_init()` - called in `lib.rs` setup
- `island_start(start_uptime_ms, target_ms, mode)` - called in `TimerController::start_timer()`
- `island_sync(value_ms)` - called in heartbeat loop (countdown uses `remaining_ms()`)
- `island_reset()` - called in `end_timer()` and `cancel_timer()`
- `island_pause()` / `island_resume()` - exist but unused (marked `#[allow(dead_code)]`)
- `current_uptime_ms()` - uses `mach` crate for monotonic time

---

## 5. Rust Integration

### 5.1 Timer Controller Integration

**Initialization** (`lib.rs`):

```rust
#[cfg(target_os = "macos")]
macos_bridge::island_init();
```

**Timer Start** (`TimerController::start_timer()`):

```rust
let start_uptime_ms = current_uptime_ms();
let island_target_ms = match mode {
    TimerMode::Countdown => actual_target_ms as i64,
    TimerMode::Stopwatch => 0,
};
island_start(start_uptime_ms, island_target_ms, mode_str);
```

**Heartbeat Sync** (`TimerController` ticker loop):

```rust
island_sync(snapshot.remaining_ms());  // Always uses remaining_ms
```

**Timer End/Cancel**:

```rust
island_reset();  // Returns to idle state "00:00"
```

**Note:** Pause/resume FFI functions exist but are not called from Rust. The island continues its render loop; Rust remains authoritative via heartbeat sync.

### 5.2 State Sync

- Island initialized on app startup, shows "00:00" in idle state
- Swift renders every 1s using cached start payload
- Rust heartbeat calls `island_sync()` with `remaining_ms()` (countdown mode)
- Swift reseeds clock on sync to prevent drift
- Reset returns to idle state without hiding window

---

## 6. React Integration

No changes required. The island is fully controlled by Rust based on timer state. The React UI does not need to know about it. The existing React heartbeat doubles as the authoritative sync signal for the island.

---

## 7. UI/UX Specifications

### 7.1 Compact State

**Dimensions:**

- Width: 300px
- Height: 36px
- Shape: Notch-shaped (bottom corners curve inward, top corners curve outward)

**Appearance:**

- Background: Black (`NSColor.black`)
- Text: White, monospace, 13px, medium weight, left-aligned (12px padding)
- Format: `MM:SS` (e.g., "24:38")
- Stopwatch mode: Shows ⏱ indicator to the right of time
- Idle state: Text dimmed to 0.6 alpha, background remains black

**Positioning:**

- Top-center of preferred display (built-in panel if available)
- Aligns with notch on MacBooks with camera housing
- Fixed position, non-movable

---

## 8. Build System

No changes required. The existing `build.rs` compiles the Swift package. Swift files in `Island/` are automatically included.

**Two-window hierarchy:**

- Parent: full-screen, level `.mainMenu + 1`, ignores mouse events, tracks display changes
- Child: notch-aligned (300x36), level `.mainMenu + 2`, hosts `IslandView`
- Parent listens for `NSApplication.didChangeScreenParametersNotification` to reposition

---

## 9. Testing Strategy

**Manual tests:**

1. Island appears on timer start, shows correct time
2. Updates smoothly during session (1s cadence)
3. Resets to idle "00:00" on end/cancel
4. Stopwatch mode shows ⏱ indicator
5. Multi-display: appears on built-in panel even if external is primary
6. Notch alignment on MacBooks with camera housing

**Performance:** Monitor CPU usage (target ≤2% during active session)

---

## 10. Performance Targets

| Metric           | Target | Measurement                            |
| ---------------- | ------ | -------------------------------------- |
| **CPU Usage**    | ≤2%    | Activity Monitor during active session |
| **Memory**       | ≤10MB  | Additional overhead for island window  |
| **Update Drift** | ≤250ms | Difference between Swift and Rust sync |

**Optimization:** 1s render cadence, layer-backed views, async FFI (no Rust blocking)

---

## 11. Acceptance Criteria

| Criterion           | Pass Condition                                 |
| ------------------- | ---------------------------------------------- |
| **Build Success**   | Swift compiles, symbols exported               |
| **Island Appears**  | Shows on app launch with "00:00" in idle state |
| **Idle State**      | Dimmed text (0.6 alpha) when showing "00:00"   |
| **Active State**    | Full opacity when timer is running             |
| **Time Display**    | Accurate MM:SS format, left-aligned            |
| **Updates**         | 1s render loop with ≤250ms drift               |
| **Reset on End**    | Returns to idle state, stays visible           |
| **Multi-Display**   | Prefers built-in panel                         |
| **Notch Alignment** | Aligns with camera housing on MacBooks         |
| **Performance**     | ≤2% CPU, ≤10MB memory                          |

---

**End of Dynamic Island Timer System Design**
