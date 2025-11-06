# LeFocus: Dynamic Island Timer Display

**Version:** 1.0
**Date:** January 2025
**Phase:** Optional Enhancement (Post-P0)
**Status:** Design Ready
**Approach:** Swift-based floating window overlay

---

## Document Purpose

This document specifies the design and implementation of a **macOS Dynamic Island-style timer display** for LeFocus. This floating UI element provides persistent, at-a-glance timer status while users work across applications.

**Goal:** Create a minimal, unobtrusive floating timer that:
1. Shows timer countdown/stopwatch at top-center of screen
2. Expands on hover to show session details and controls
3. Integrates seamlessly with existing Tauri timer state
4. Follows macOS native UI patterns (menu bar level, borderless)

**Success Criteria:** The floating island appears during active sessions, displays accurate time, reflects pause and resume commands immediately, and uses ≤2% CPU overhead.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Swift Implementation](#3-swift-implementation)
4. [FFI Bridge Layer](#4-ffi-bridge-layer)
5. [Rust Integration](#5-rust-integration)
6. [React Integration](#6-react-integration)
7. [UI/UX Specifications](#7-uiux-specifications)
8. [Build System Changes](#8-build-system-changes)
9. [Testing Strategy](#9-testing-strategy)
10. [Performance Targets](#10-performance-targets)

---

## 1. Overview

### 1.1 What We Are Building

A **floating window** positioned at the top-center of the screen that mimics the iPhone Dynamic Island aesthetic:

- **Compact state** (default): Black pill showing timer countdown (e.g., "24:38")
- **Expanded state** (on hover): Shows session mode, current app context, pause/resume controls
- **Hidden state**: Not visible when timer is idle

### 1.2 Technical Approach

**Swift Native Window**
- Use a borderless `NSPanel` configured as non-activating
- Position at screen top-center (below menu bar or around notch)
- Window level: `.statusBar` or `.floating`
- Custom `NSView` for pill-shaped UI with rounded corners

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
- Animations between compact/expanded states (instant transitions OK)
- Custom positioning (always top-center)
- Settings/preferences UI

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
│  - NEW: Emits island_start payload and heartbeat sync      │
└─────────────────┬───────────────────────────────────┘
                  │
                  │ FFI calls
                  ↓
┌─────────────────────────────────────────────────────┐
│      Swift Island Plugin (IslandController.swift)   │
│                                                     │
│  - Creates/manages NSPanel                         │
│  - Custom IslandView (draws pill UI)                │
│  - NEW FFI exports:                                 │
│    • island_start(start_uptime_ms, target_ms, mode) │
│    • island_sync(value_ms)                          │
│    • island_pause() / island_resume()               │
│    • island_hide()                                  │
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

**Timer Start:**
1. User clicks "Start" in the React UI.
2. Tauri command `start_timer()` runs in Rust.
3. Rust updates `TimerState` to running and records `start_uptime_ms` (from `mach_absolute_time`) plus `target_ms`.
4. Rust calls `island_start(IslandStartPayload)` via FFI. The payload includes `start_uptime_ms`, `target_ms`, and `mode`.
5. Swift creates the window, caches the payload, and starts its own one-second render timer.

**Swift Render Loop (every 1s):**
1. Swift computes a display value using the cached payload and `ProcessInfo.processInfo.systemUptime` (remaining time for countdown, elapsed time for stopwatch).
2. The island view redraws with the new `MM:SS` value.

**Rust Heartbeat Sync (every heartbeat interval):**
1. Rust heartbeats that already drive the React UI obtain an authoritative timer measurement (remaining for countdown, elapsed for stopwatch).
2. The heartbeat calls `island_sync(value_ms)` via FFI with that measurement.
3. Swift compares the authoritative value with its local estimate and corrects drift greater than a tolerance (for example 250 ms).

**Timer End, Cancel, Pause, Resume:**
1. User action triggers the relevant Tauri command.
2. Rust updates `TimerState` and calls the matching island function (`island_pause`, `island_resume`, or `island_hide`).
3. Swift stops or resumes its internal timer and updates the UI accordingly.

### 2.3 Window Positioning Logic

Select the owning screen using the helper extension below, which always prefers the built-in (non-external) panel when available. That keeps the island anchored to the laptop display even if an external monitor is configured as primary, while still falling back to the active screen on desktops that lack an internal display.

```swift
// Determine which display should own the island.
let owningScreen = NSScreen.lf_preferredIslandDisplay ?? NSScreen.main!

// Island dimensions
let islandWidth: CGFloat = 180  // Compact state
let islandHeight: CGFloat = 36

// Position top-center relative to the owning screen.
let screenFrame = owningScreen.frame
let x = screenFrame.midX - (islandWidth / 2)

let topVisible = owningScreen.visibleFrame.maxY
var y = topVisible - islandHeight - 10

// If the screen has a notch, drop the pill just below it.
if owningScreen.lf_hasNotch {
    let safeBottom = owningScreen.lf_safeNotchBottom
    y = safeBottom - islandHeight - 8
}
```

```swift
private extension NSScreen {
    static var lf_preferredIslandDisplay: NSScreen? {
        // Always pick the built-in panel if it exists, regardless of notch presence.
        if let builtIn = NSScreen.screens.first(where: { $0.lf_isBuiltIn }) {
            return builtIn
        }
        return NSScreen.main
    }

    /// True when this display is the built-in laptop panel.
    var lf_isBuiltIn: Bool {
        CGDisplayIsBuiltin(displayID) != 0
    }

    /// Whether this screen reports a notch, based on safe area insets.
    var lf_hasNotch: Bool {
        guard #available(macOS 12.0, *) else {
            return false
        }
        let extraInset = safeAreaInsets.top - lf_menuBarHeight
        return extraInset > 1.0
    }

    /// The y-position (from bottom) where content is safe below the notch.
    var lf_safeNotchBottom: CGFloat {
        guard #available(macOS 12.0, *) else {
            return visibleFrame.maxY
        }
        return frame.maxY - safeAreaInsets.top
    }

    /// Menu bar height heuristic for the screen.
    var lf_menuBarHeight: CGFloat {
        frame.maxY - visibleFrame.maxY
    }

    private var displayID: CGDirectDisplayID {
        deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
    }
}
```

**Display Ownership Rules**
- Always prefer the internal (non-external) display when the machine has one, so laptop users see the island near the camera housing.
- Fall back to the current `NSScreen.main` value on desktops or other setups without a built-in panel.
- Always anchor to the top-center of the owning screen and join all Spaces so the island stays visible while the user switches desktops.

---

## 3. Swift Implementation

### 3.1 New Files to Create

```
src-tauri/plugins/macos-sensing/Sources/MacOSSensing/
├── Island/
│   ├── IslandController.swift    # Window management, FFI exports
│   ├── IslandView.swift           # Custom NSView for pill UI
│   └── IslandFFITypes.swift       # FFI data structures
```

### 3.2 IslandController.swift

**Responsibilities:**
- Create and manage the floating `NSPanel`
- Maintain an internal `Timer` that renders once per second
- Apply authoritative sync events from Rust to avoid drift
- Handle pause, resume, and hide commands
- Position the window correctly and manage window levels

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandController.swift

import Cocoa
import Foundation

public enum IslandMode: String {
    case countdown
    case stopwatch
}

public final class IslandController {
    public static let shared = IslandController()

    private var window: NSPanel?
    private var islandView: IslandView?
    private let stateQueue = DispatchQueue(label: "IslandController.State")
    private var renderTimer: Timer?

    private var startUptimeMs: Int64 = 0
    private var targetMs: Int64?
    private var mode: IslandMode = .countdown

    private init() {}

    // MARK: - Public API

    /// Start the island with initial state and begin the render loop.
    public func start(payload: IslandStartPayload) {
        stateQueue.async { [weak self] in
            DispatchQueue.main.async {
                self?.createWindowIfNeeded()
                self?.applyStartPayload(payload)
                self?.startRenderLoop()
            }
        }
    }

    /// Apply an authoritative timer value to correct drift (remaining for countdown, elapsed for stopwatch).
    public func sync(authoritativeMs: Int64) {
        stateQueue.async { [weak self] in
            DispatchQueue.main.async {
                self?.applyAuthoritativeValue(authoritativeMs)
            }
        }
    }

    public func pause() {
        stateQueue.async { [weak self] in
            DispatchQueue.main.async {
                self?.renderTimer?.invalidate()
                self?.renderTimer = nil
            }
        }
    }

    public func resume() {
        stateQueue.async { [weak self] in
            DispatchQueue.main.async {
                self?.startRenderLoop()
            }
        }
    }

    /// Hide the island entirely.
    public func hide() {
        stateQueue.async { [weak self] in
            DispatchQueue.main.async {
                self?.renderTimer?.invalidate()
                self?.renderTimer = nil
                self?.window?.orderOut(nil)
                self?.window?.alphaValue = 0.0
            }
        }
    }

    // MARK: - Window Management

    private func createWindowIfNeeded() {
        guard window == nil else { return }

        guard let screen = NSScreen.lf_preferredIslandDisplay ?? NSScreen.main else {
            print("⚠️ No main screen found")
            return
        }

        // Calculate position
        let screenWidth = screen.frame.width
        let screenHeight = screen.frame.height

        let islandWidth: CGFloat = 180
        let islandHeight: CGFloat = 36

        let x = (screenWidth - islandWidth) / 2
        var y = screenHeight - 50

        // Handle notch on newer MacBooks
        let topSafeArea = screen.safeAreaInsets.top
        if topSafeArea > 0 {
            y = screenHeight - topSafeArea - 10
        }

        let frame = NSRect(x: x, y: y, width: islandWidth, height: islandHeight)

        // Create panel (non-activating window) so the island does not steal focus.
        let panel = NSPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        panel.level = .statusBar
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.ignoresMouseEvents = false  // Allow hover interactions
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

        // Create custom view
        let view = IslandView(frame: NSRect(x: 0, y: 0, width: islandWidth, height: islandHeight))
        panel.contentView = view

        self.window = panel
        self.islandView = view

        panel.orderFrontRegardless()
        panel.alphaValue = 1.0
    }

    private func applyStartPayload(_ payload: IslandStartPayload) {
        startUptimeMs = payload.startUptimeMs
        mode = payload.mode
        targetMs = payload.mode == .countdown ? payload.targetMs : nil

        let initialDisplayMs: Int64
        switch payload.mode {
        case .countdown:
            initialDisplayMs = payload.targetMs
        case .stopwatch:
            initialDisplayMs = 0
        }

        islandView?.update(displayMs: initialDisplayMs, mode: payload.mode)
    }

    private func startRenderLoop() {
        renderTimer?.invalidate()
        renderTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let displayMs = self.currentDisplayMs()
            self.islandView?.update(displayMs: displayMs, mode: nil)
        }
        if let timer = renderTimer {
            RunLoop.main.add(timer, forMode: .common)
            timer.fire()
        }
    }

    private func applyAuthoritativeValue(_ authoritativeMs: Int64) {
        islandView?.update(displayMs: authoritativeMs, mode: nil)
        reseedClocks(authoritativeMs: authoritativeMs)
    }

    private func reseedClocks(authoritativeMs: Int64) {
        // Adjust startUptimeMs so that the next render tick stays aligned with Rust.
        let now = currentUptimeMs()
        switch mode {
        case .countdown:
            guard let target = targetMs else { return }
            let elapsed = max<Int64>(0, target - authoritativeMs)
            startUptimeMs = now - elapsed
        case .stopwatch:
            let elapsed = max<Int64>(0, authoritativeMs)
            startUptimeMs = now - elapsed
        }
    }

    private func currentDisplayMs() -> Int64 {
        let now = currentUptimeMs()
        let elapsed = max(0, now - startUptimeMs)
        switch mode {
        case .countdown:
            guard let target = targetMs else { return 0 }
            return max(0, target - elapsed)
        case .stopwatch:
            return elapsed
        }
    }

    private func currentUptimeMs() -> Int64 {
        let seconds = ProcessInfo.processInfo.systemUptime
        return Int64(seconds * 1000)
    }

    /// Cleanup (called when the app quits).
    public func cleanup() {
        stateQueue.sync { [weak self] in
            let cleanupWork = {
                self?.renderTimer?.invalidate()
                self?.renderTimer = nil
                self?.window?.close()
                self?.window = nil
                self?.islandView = nil
            }

            if Thread.isMainThread {
                cleanupWork()
            } else {
                DispatchQueue.main.async(execute: cleanupWork)
            }
        }
    }
}
```

### 3.3 IslandView.swift

**Responsibilities:**
- Draw pill-shaped background
- Render timer text
- Handle hover state (future: expand/collapse)

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandView.swift

import Cocoa

class IslandView: NSView {
    private var displayMs: Int64 = 0
    private var mode: IslandMode = .countdown
    private var isHovered: Bool = false

    private var trackingArea: NSTrackingArea?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setupTrackingArea()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) not implemented")
    }

    // MARK: - Public API

    func update(displayMs: Int64, mode: IslandMode?) {
        self.displayMs = displayMs
        if let mode = mode {
            self.mode = mode
        }
        self.needsDisplay = true
    }

    // MARK: - Drawing

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        guard let context = NSGraphicsContext.current?.cgContext else { return }

        // Background pill shape
        let path = NSBezierPath(roundedRect: bounds, xRadius: 18, yRadius: 18)

        // Black background with slight transparency
        NSColor(white: 0.1, alpha: 0.95).setFill()
        path.fill()

        // Subtle border
        NSColor(white: 0.2, alpha: 1.0).setStroke()
        path.lineWidth = 0.5
        path.stroke()

        // Draw timer text
        let timeString = formatTime(ms: displayMs)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 16, weight: .medium),
            .foregroundColor: NSColor.white,
        ]

        let attributedString = NSAttributedString(string: timeString, attributes: attributes)
        let textSize = attributedString.size()
        let textX = (bounds.width - textSize.width) / 2
        let textY = (bounds.height - textSize.height) / 2

        attributedString.draw(at: NSPoint(x: textX, y: textY))

        // Optional: Draw mode indicator (small icon or text)
        if mode == .stopwatch {
            let modeString = "⏱"
            let modeAttrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 10),
                .foregroundColor: NSColor.white.withAlphaComponent(0.6),
            ]
            let modeText = NSAttributedString(string: modeString, attributes: modeAttrs)
            modeText.draw(at: NSPoint(x: 8, y: bounds.height / 2 - 5))
        }
    }

    // MARK: - Mouse Tracking

    private func setupTrackingArea() {
        let options: NSTrackingArea.Options = [
            .mouseEnteredAndExited,
            .activeAlways
        ]
        trackingArea = NSTrackingArea(
            rect: bounds,
            options: options,
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea!)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingArea = trackingArea {
            removeTrackingArea(trackingArea)
        }
        setupTrackingArea()
    }

    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        needsDisplay = true
        // TODO: Expand to show controls
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        needsDisplay = true
        // TODO: Collapse back to compact state
    }

    // MARK: - Helpers

    private func formatTime(ms: Int64) -> String {
        let totalSeconds = max(0, ms / 1000)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
```

### 3.4 IslandFFITypes.swift

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandFFITypes.swift

import Foundation

public struct IslandStartPayload {
    public let startUptimeMs: Int64
    /// Countdown duration in ms. Pass 0 when mode == .stopwatch.
    public let targetMs: Int64
    public let mode: IslandMode
}
```

### 3.5 FFI Exports (add to FFIExports.swift)

```swift
// Add to: src-tauri/plugins/macos-sensing/Sources/MacOSSensing/FFIExports.swift

// MARK: - Island Controls

@_cdecl("macos_sensing_swift_island_start")
public func islandStartFFI(startUptimeMs: Int64, targetMs: Int64, modePtr: UnsafePointer<CChar>) {
    let modeString = String(cString: modePtr)
    let islandMode = IslandMode(rawValue: modeString) ?? .countdown
    let payload = IslandStartPayload(startUptimeMs: startUptimeMs, targetMs: targetMs, mode: islandMode)
    DispatchQueue.main.async {
        IslandController.shared.start(payload: payload)
    }
}

@_cdecl("macos_sensing_swift_island_sync")
public func islandSyncFFI(valueMs: Int64) {
    DispatchQueue.main.async {
        IslandController.shared.sync(authoritativeMs: valueMs)
    }
}

@_cdecl("macos_sensing_swift_island_pause")
public func islandPauseFFI() {
    DispatchQueue.main.async {
        IslandController.shared.pause()
    }
}

@_cdecl("macos_sensing_swift_island_resume")
public func islandResumeFFI() {
    DispatchQueue.main.async {
        IslandController.shared.resume()
    }
}

@_cdecl("macos_sensing_swift_island_hide")
public func islandHideFFI() {
    DispatchQueue.main.async {
        IslandController.shared.hide()
    }
}

@_cdecl("macos_sensing_swift_island_cleanup")
public func islandCleanupFFI() {
    IslandController.shared.cleanup()
}
```

---

## 4. FFI Bridge Layer

### 4.1 Update C Header

Add to `src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/include/MacOSSensingFFI.h`:

```c
// Island controls
void macos_sensing_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode);
void macos_sensing_island_sync(int64_t value_ms); // remaining for countdown, elapsed for stopwatch
void macos_sensing_island_pause(void);
void macos_sensing_island_resume(void);
void macos_sensing_island_hide(void);
void macos_sensing_island_cleanup(void);
```

### 4.2 Update C Implementation

Add to `src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/MacOSSensingFFI.c`:

```c
// Swift entry points (Island)
extern void macos_sensing_swift_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode);
extern void macos_sensing_swift_island_sync(int64_t value_ms);
extern void macos_sensing_swift_island_pause(void);
extern void macos_sensing_swift_island_resume(void);
extern void macos_sensing_swift_island_hide(void);
extern void macos_sensing_swift_island_cleanup(void);

void macos_sensing_island_start(int64_t start_uptime_ms, int64_t target_ms, const char *mode) {
    macos_sensing_swift_island_start(start_uptime_ms, target_ms, mode);
}

void macos_sensing_island_sync(int64_t value_ms) {
    macos_sensing_swift_island_sync(value_ms);
}

void macos_sensing_island_pause(void) {
    macos_sensing_swift_island_pause();
}

void macos_sensing_island_resume(void) {
    macos_sensing_swift_island_resume();
}

void macos_sensing_island_hide(void) {
    macos_sensing_swift_island_hide();
}

void macos_sensing_island_cleanup(void) {
    macos_sensing_swift_island_cleanup();
}
```

### 4.3 Rust FFI Bindings

Add to `src-tauri/src/macos_bridge.rs`:

```rust
use std::ffi::CString;

extern "C" {
    fn macos_sensing_island_start(start_uptime_ms: i64, target_ms: i64, mode: *const c_char);
    fn macos_sensing_island_sync(value_ms: i64);
    fn macos_sensing_island_pause();
    fn macos_sensing_island_resume();
    fn macos_sensing_island_hide();
    fn macos_sensing_island_cleanup();
}

/// Start the floating island timer.
pub fn island_start(start_uptime_ms: i64, target_ms: i64, mode: &str) {
    unsafe {
        let c_mode = CString::new(mode).unwrap();
        macos_sensing_island_start(start_uptime_ms, target_ms, c_mode.as_ptr());
    }
}

/// Push an authoritative timer value (remaining for countdown, elapsed for stopwatch) to Swift.
pub fn island_sync(value_ms: i64) {
    unsafe {
        macos_sensing_island_sync(value_ms);
    }
}

pub fn island_pause() {
    unsafe {
        macos_sensing_island_pause();
    }
}

pub fn island_resume() {
    unsafe {
        macos_sensing_island_resume();
    }
}

/// Hide the island entirely.
pub fn island_hide() {
    unsafe {
        macos_sensing_island_hide();
    }
}

/// Cleanup island resources (called on app quit).
pub fn island_cleanup() {
    unsafe {
        macos_sensing_island_cleanup();
    }
}

#[cfg(target_os = "macos")]
pub fn current_uptime_ms() -> i64 {
    // Requires the `mach` crate for monotonic time conversion.
    use mach::{mach_absolute_time, mach_timebase_info, mach_timebase_info_data_t};
    use std::mem::MaybeUninit;

    unsafe {
        let now = mach_absolute_time();
        let mut info = MaybeUninit::<mach_timebase_info_data_t>::uninit();
        mach_timebase_info(info.as_mut_ptr());
        let info = info.assume_init();
        ((now as u128 * info.numer as u128) / info.denom as u128 / 1_000_000) as i64
    }
}
```

---

## 5. Rust Integration

### 5.1 Update Timer Controller

Modify `src-tauri/src/lib.rs` to call island functions:

```rust
use crate::macos_bridge::{current_uptime_ms, island_start, island_sync, island_pause, island_resume, island_hide};
use std::time::Duration;

// In start_timer command:
#[tauri::command]
fn start_timer(state: State<AppState>, target_ms: i64, mode: TimerMode) -> Result<(), String> {
    let mut timer_state = state.timer.lock().unwrap();

    // ... existing timer start logic ...

    // Kick off the island window.
    #[cfg(target_os = "macos")]
    {
        let start_uptime_ms = current_uptime_ms();
        let mode_str = match mode {
            TimerMode::Countdown => "countdown",
            TimerMode::Stopwatch => "stopwatch",
        };
        let island_target_ms = match mode {
            TimerMode::Countdown => target_ms,
            TimerMode::Stopwatch => 0,
        };
        island_start(start_uptime_ms, island_target_ms, mode_str);
    }

    Ok(())
}

// Heartbeat callback (already servicing the React UI)
#[cfg(target_os = "macos")]
fn on_timer_heartbeat(mode: TimerMode, snapshot: &TimerSnapshot) {
    let authoritative_ms = match mode {
        TimerMode::Countdown => snapshot.remaining_ms,
        TimerMode::Stopwatch => snapshot.elapsed_ms,
    };

    island_sync(authoritative_ms);
}

#[tauri::command]
fn pause_timer(state: State<AppState>) -> Result<(), String> {
    // ... existing pause logic ...

    #[cfg(target_os = "macos")]
    island_pause();

    Ok(())
}

#[tauri::command]
fn resume_timer(state: State<AppState>) -> Result<(), String> {
    // ... existing resume logic ...

    #[cfg(target_os = "macos")]
    island_resume();

    Ok(())
}

// In end_timer/cancel_timer commands:
#[tauri::command]
fn end_timer(state: State<AppState>) -> Result<SessionInfo, String> {
    // ... existing end logic ...

    #[cfg(target_os = "macos")]
    island_hide();

    Ok(session_info)
}

#[tauri::command]
fn cancel_timer(state: State<AppState>) -> Result<(), String> {
    // ... existing cancel logic ...

    #[cfg(target_os = "macos")]
    island_hide();

    Ok(())
}
```

> **Note:** `TimerSnapshot` represents the existing heartbeat payload that already drives the React UI. It must expose both `remaining_ms` and `elapsed_ms` so the island can mirror whichever mode is active.

### 5.2 Island State Sync

- Swift renders every second using the start payload.
- Rust remains authoritative through the same heartbeat used by the React UI (for example one second or faster if already implemented).
- Each heartbeat calls `island_sync(value_ms)` where `value_ms` equals remaining time for countdowns or elapsed time for stopwatches. Swift ignores tiny differences, but reseeds when the drift threshold is exceeded.
- Pause, resume, and hide are pushed immediately so the island reflects the current session state without waiting for the next heartbeat.

---

## 6. React Integration

### 6.1 No Changes Required (v1)

The island is **fully controlled by Rust** based on timer state. The React UI does not need to know about it.

**Benefits:**
- Simpler implementation
- No additional React state
- Island persists even if the main window is minimized

The existing React heartbeat remains unchanged. Each heartbeat still updates the web UI and now doubles as the authoritative sync signal for the island.

### 6.2 Future: Island Controls in React (v2)

Could add Tauri commands for manual island control:

```typescript
// Future API:
import { invoke } from "@tauri-apps/api/core";

await invoke("island_start", {
  // current_uptime_ms would be a Tauri command that returns monotonic milliseconds.
  startUptimeMs: await invoke("current_uptime_ms"),
  targetMs: 1_500_000,
  mode: "countdown",
});
await invoke("island_sync", { valueMs: 1_400_000 }); // pass elapsed ms when in stopwatch mode
await invoke("island_pause");
await invoke("island_resume");
await invoke("island_hide");
```

---

## 7. UI/UX Specifications

### 7.1 Compact State (Default)

**Dimensions:**
- Width: 180px
- Height: 36px
- Border radius: 18px (perfect pill)

**Appearance:**
- Background: `rgba(26, 26, 26, 0.95)` (dark gray, semi-transparent)
- Border: 0.5px solid `rgba(51, 51, 51, 1.0)` (subtle)
- Shadow: Small shadow for depth
- Text: White, monospace, 16px, medium weight
- Format: `MM:SS` (e.g., "24:38")

**Positioning:**
- Screen: Top-center
- Y offset: 50px from top (or 10px below notch if present)
- Stays fixed in position (does not follow mouse)

### 7.2 Expanded State (Hover)

**Dimensions:**
- Width: 300px (expands horizontally)
- Height: 60px (expands vertically)

**Content:**
- Top row: Timer (larger font)
- Bottom row: Current app + mode indicator
- Right side: Pause/Resume button

**Example:**
```
┌──────────────────────────────────┐
│          24:38                   │
│  VSCode • Countdown       ⏸     │
└──────────────────────────────────┘
```

### 7.3 Animations

- Expand/collapse: Instant transition (no animation for v1, smooth 0.2s ease-in-out for v2)
- Appear/disappear: 0.15s fade
- Text updates: Instant (no animation)

### 7.4 Interaction

- **Hover**: Expands to show details and controls
- **Click pause button**: Calls `pause_timer()` command (or `resume_timer()` if paused)
- **Click timer text**: Opens main Tauri window (v2 feature)
- **No drag**: Window stays fixed in position (v1 - dragging is v2)

---

## 8. Build System Changes

### 8.1 No Changes Required

The existing `build.rs` already compiles the Swift package. New Swift files will be automatically included.

### 8.2 macOS Notch Window Integration (v1.1)

The initial implementation positioned the pill using a single `.statusBar`-level panel. That kept the visuals aligned with the notch, but the full-screen backing window captured mouse events and made the rest of the desktop unclickable. To solve this while keeping the pill visually “in” the notch, the runtime now creates a two-window stack:

- **Pass-through parent (`window`)**
  - Frame: full `screen.frame`
  - Level: `.mainMenu + 1` (beneath the pill)
  - `ignoresMouseEvents = true` → clicks fall through to underlying apps
  - No content, purely guarantees the child tracks display changes and notch geometry
  - Added once per session; listens for `NSApplication.didChangeScreenParameters` and resizes when displays are attached/detached

- **Interactive child (`islandWindow`)**
  - Frame: precise notch-aligned rect computed via `NSScreen.lf_notchRect`
  - Level: `.mainMenu + 2` (above the parent and menu bar)
  - Hosts `IslandView` and owns the pill’s hit-testing/gestures
  - Non-movable, borderless, transparent background; small vertical inset keeps the pill visually hugging the camera housing
  - Repositioned on every heartbeat when screens change or the preferred display (built-in panel) is swapped

Key Swift changes (already merged):

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandController.swift
private var window: NSPanel?        // pass-through parent
private var islandWindow: NSPanel?  // pill host

private func ensureWindowHierarchy() {
    // create/update parent (ignores mouse; spans full screen)
    // create/update child (pill panel at notch coordinates)
    window?.addChildWindow(islandPanel, ordered: .above)
}

extension NSScreen {
    var lf_notchRect: NSRect? { ... } // shared notch geometry helper
}
```

With this hierarchy, the pill stays in the notch on modern MacBook Pros, the rest of the desktop remains clickable, and we avoid using private CGS/SkyLight APIs. Future additions (hover expansion, buttons) should attach their NSViews to `islandWindow` so interactions remain scoped to the pill.

### 8.2 Verification

After adding new files:

```bash
cd src-tauri
cargo clean
cargo build

# Verify new symbols are exported:
nm -g .swift-build/macos-sensing/release/libMacOSSensing.dylib | grep island

# Expected output:
# _macos_sensing_island_start
# _macos_sensing_island_sync
# _macos_sensing_island_pause
# _macos_sensing_island_resume
# _macos_sensing_island_hide
# _macos_sensing_island_cleanup
```

---

## 9. Testing Strategy

### 9.1 Manual Testing

**Test 1: Island Appears on Timer Start**
1. Open LeFocus
2. Start a 25-minute timer
3. ✅ Island appears at top-center of screen
4. ✅ Shows correct time (e.g., "25:00")

**Test 2: Island Updates During Session**
1. Wait 10 seconds
2. ✅ Island shows decremented time (e.g., "24:50")
3. ✅ Updates are smooth (no flickering)

**Test 3: Island Disappears on End**
1. End timer
2. ✅ Island disappears immediately

**Test 4: Stopwatch Mode**
1. Start stopwatch
2. ✅ Island shows incrementing time (e.g., "00:38")
3. ✅ Mode indicator shows stopwatch icon

**Test 5: Multi-Display**
1. Connect external monitor
2. Start timer
3. ✅ Island appears on the built-in (non-external) display even if the external monitor is marked primary
4. ✅ Stays fixed when moving main window between displays

**Test 6: Hover Expansion (Future)**
1. Hover over island
2. ✅ Expands to show details
3. Move mouse away
4. ✅ Collapses back

### 9.2 Automated Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    use crate::macos_bridge::current_uptime_ms;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_island_ffi_calls() {
        // Test FFI functions do not crash.
        let start_uptime_ms = current_uptime_ms();

        island_start(start_uptime_ms, 1_500_000, "countdown");
        std::thread::sleep(Duration::from_millis(100));
        island_sync(1_400_000); // countdown uses remaining ms
        island_pause();
        island_resume();
        island_hide();

        island_start(start_uptime_ms, 0, "stopwatch");
        std::thread::sleep(Duration::from_millis(50));
        island_sync(2_500); // stopwatch uses elapsed ms
        island_hide();
    }
}
```

### 9.3 Performance Profiling

```bash
# Build in release mode
cargo build --release

# Run with Activity Monitor open
# Check CPU usage while timer is running
# Target: ≤2% CPU for island updates
```

---

## 10. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **CPU Usage** | ≤2% | Activity Monitor during active session |
| **Memory** | ≤10MB | Additional overhead for island window |
| **Update Drift** | ≤250ms | Difference between Swift display and Rust heartbeat |
| **Render Time** | ≤16ms | 60 FPS for smooth display |
| **FFI Call Overhead** | ≤1ms | Time to execute `island_sync()` |

### 10.1 Optimization Strategies

1. **Tune render cadence**: Maintain a 1s Swift render timer unless UX requires higher resolution
2. **Batch updates**: Redraw only when the displayed `MM:SS` value changes
3. **Optimize drawing**: Use layer-backed views
4. **Async FFI**: Do not block the Rust thread on Swift calls

---

## 11. Acceptance Criteria

| Criterion | Pass Condition |
|-----------|---------------|
| **Build Success** | Swift compiles, new symbols exported |
| **Island Appears** | Shows on timer start, correct position |
| **Time Display** | Shows accurate MM:SS format |
| **Updates** | Swift render loop ticks every 1s with ≤250ms drift |
| **Hide on End** | Disappears when timer ends/cancels |
| **Multi-Display** | Works correctly on main screen with external monitors |
| **Performance** | ≤2% CPU, ≤10MB memory |
| **No Crashes** | Stable during 25+ minute sessions |

---

## Implementation Checklist

- [ ] Create `Island/` directory in Swift plugin
- [ ] Implement `IslandController.swift`
- [ ] Implement `IslandView.swift`
- [ ] Add FFI exports to `FFIExports.swift`
- [ ] Update C header with island functions
- [ ] Update C shim implementation
- [ ] Add Rust FFI bindings to `macos_bridge.rs`
- [ ] Add `mach` crate for monotonic time conversions on macOS
- [ ] Integrate `island_start` payload emission in `start_timer()`
- [ ] Connect timer heartbeat to `island_sync`
- [ ] Integrate island lifecycle calls in `pause_timer()`, `resume_timer()`, `end_timer()`, and `cancel_timer()`
- [ ] Test build process
- [ ] Manual testing (all 6 scenarios)
- [ ] Performance profiling
- [ ] Memory leak check
- [ ] Documentation update

---

**End of Dynamic Island Timer System Design**

Total: ~800 lines | Focus: Native macOS floating UI with Swift-Rust FFI integration
