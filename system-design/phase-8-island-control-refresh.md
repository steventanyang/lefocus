# LeFocus: Dynamic Island Control Refresh

**Version:** 1.0
**Date:** November 2025
**Phase:** UX Polish / Island Controls
**Status:** Implemented
**Approach:** Swift + Rust bridge enhancements

---

## Document Purpose

This document captures the architectural changes made to the Dynamic Island implementation so the macOS overlay behaves like the primary timer UI. The update focuses on three problem areas that surfaced during UX validation:

1. **Timer-only expansion:** Previously the island refused to expand when no media metadata was loaded. Users could not reach the End/Cancel actions in timer-only scenarios.
2. **Post-timer action gap:** After a timer reached zero the island immediately reverted to the audio view, forcing users to open the desktop app to complete or cancel a session.
3. **Navigation context:** Clicking End/Cancel on the island should guide users back to the main LeFocus window to review summaries, but there was no plumbing to focus the Tauri window from Swift.

The changes described below ensure the island mirrors the React controls, preserves a timer-first experience, and remains in sync with the Rust state machine.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Goals and Non-goals](#2-goals-and-non-goals)
3. [Architecture Summary](#3-architecture-summary)
4. [Swift Layer Changes](#4-swift-layer-changes)
5. [Rust Bridge Changes](#5-rust-bridge-changes)
6. [UI/UX Behavior Matrix](#6-uiux-behavior-matrix)
7. [Lifecycle and State Diagrams](#7-lifecycle-and-state-diagrams)
8. [Build + Tooling Updates](#8-build--tooling-updates)
9. [Testing Strategy](#9-testing-strategy)
10. [Future Work](#10-future-work)

---

## 1. Problem Statement

### 1.1 Timer-only Expansion Dead-end

The island’s expanded layout was guarded by an implicit dependency on `currentTrack`. When no audio was playing, the controller refused to expand, leaving the compact pill as the only interaction surface. Users could not finish a timer directly from the island when listening to white noise or working silently.

### 1.2 Missing Session Completion Actions

When a countdown reached zero the island defaulted back to the media view and exposed only playback controls. React still required a manual “End” to persist the session, so timers would sit in a “stopped” limbo until the desktop UI came into focus.

### 1.3 App Focus Connectivity

End/Cancel buttons inside the island should guide users back to the LeFocus window (to label sessions, review stats, etc.). macOS sandboxing prevents Swift from directly poking the Tauri web view, so a dedicated callback was needed inside the Swift ⇄ Rust bridge.

---

## 2. Goals and Non-goals

### 2.1 Goals

- Allow the island to expand regardless of audio state while preserving sensible sizing.
- When the timer completes, keep the expanded timer UI visible until the session is acknowledged by the user.
- Mirror the React control surface: show End + Cancel in stopwatch mode, Cancel while running countdown/break, and End after countdown completion.
- Collapse the island **and** bring the Tauri window to the foreground when the user taps End or Cancel from the island.
- Document the Swift/Rust bridge paths so future sensor features can reuse the focus callback pattern.

### 2.2 Non-goals

- Redesigning the waveform/audio UI (only visibility conditions changed).
- Adding pause/resume interactions; the island still mirrors the existing timer statuses.
- Multi-session orchestration or queueing; the island continues to represent the active timer only.

---

## 3. Architecture Summary

```
┌────────────────────────────────────────────────────┐
│ React Timer UI (TimerControls, TimerView)           │
│   ↓                                                 │
│ Rust TimerController (start/end/cancel)             │
│   ↓                                                 │
│ macos_bridge.rs (FFI adapter + AppHandle registry)  │
│   ↓                                                 │
│ C FFI shim (MacOSSensingFFI.c/.h)                  │
│   ↓                                                 │
│ Swift IslandController / IslandView                 │
└────────────────────────────────────────────────────┘
```

New data paths introduced in this iteration:

1. **Audio Presence Broadcast:** `IslandController.updateAudioUI()` now notifies `IslandWindowManager` whether an audio track exists so the expanded width can switch between the rich media layout and the timer-only layout.
2. **Focus App Callback:** Swift declares `macos_sensing_trigger_focus_app()`, backed by a C shim and Rust callback (`macos_sensing_set_focus_app_callback`). This lifts UI context management back into Rust, which uses Tauri’s `get_webview_window("main")` to foreground the desktop window.

---

## 4. Swift Layer Changes

### 4.1 IslandController.swift

| Area | Change | Reason |
|------|--------|--------|
| Expansion guard | Removed the `currentTrack == nil` short-circuit inside `setExpanded`. Expansion now depends solely on whether we are already expanded and (if idle) whether a timer is running. | Enables timer-only expansion. |
| Timer state cache | Added `timerIsIdle` tracking derived from `IslandTimerPresenter`. Whenever presenter emits `idle` we update the cache and inform `IslandWindowManager`. | Allows window sizing logic to know whether to use idle/active dimensions even if the latest update lacked explicit idle info. |
| Collapse + focus helper | Introduced `collapseAndFocusApp()` which calls `setExpanded(false)` and fires the new focus callback after End/Cancel interactions. | Ensures the overlay hides promptly and the desktop UI comes forward. |

### 4.2 IslandWindowManager.swift

- Added `hasAudioContent` flag with a corresponding setter `updateAudioPresence(hasAudio:animated:)`.
- `currentIslandSize()` now selects widths using a 2×2 matrix: `{timer idle vs active} × {audio present vs not}`. The timer-only active state reuses the previous “idle” width so the expanded timer matches the media-only width target.
- The window manager keeps its animation durations consistent (`0.25s` expand, `0.15s` collapse) regardless of which dimension changed.

### 4.3 IslandView.swift

- Promoted `hasTimerFinished` from `private` to internal scope so the drawing helpers can react to countdown completion.
- Added `drawTimerOnlyExpandedLayout()` which centers the timer text and reuses the End/Cancel button geometry when no audio metadata exists.

### 4.4 IslandTimerDrawing.swift

- `drawTimerControlButtonsIfNeeded()` now supports three states:
  1. **Stopwatch running:** End + Cancel rendered side-by-side.
  2. **Countdown/Break running:** Cancel only, centered under timer.
  3. **Countdown finished:** End replaces Cancel and remains until clicked.
- Both `drawTimerControlButtonsIfNeeded()` and `layoutTimerControlButtonRects()` honor `hasTimerFinished` to keep buttons visible even when the timer technically reports `idle` after hitting zero.

### 4.5 IslandAudioDrawing.swift

- Reset logic avoids leaving stale playback button hitboxes when no audio is present.
- `expandedArtworkRect()` no longer stores the unused `artistHeight` intermediate, silencing the Swift build warning.

---

## 5. Rust Bridge Changes

### 5.1 C FFI Layer (MacOSSensingFFI)

| File | Addition |
|------|----------|
| `MacOSSensingFFI.h` | Declared `typedef void (*FocusAppCallback)(void)` plus `macos_sensing_set_focus_app_callback` and `macos_sensing_trigger_focus_app`. |
| `MacOSSensingFFI.c` | Stored a global `FocusAppCallback`, exposed setter, and forwarded `macos_sensing_trigger_focus_app()` to the registered Rust callback. |

### 5.2 Rust Adapter (macos_bridge.rs)

1. Added extern imports for `macos_sensing_set_focus_app_callback` and the new trigger.
2. Implemented `rust_focus_app_callback()` which calls `focus_main_window()`.
3. `focus_main_window()` fetches the Tauri window via `app_handle.get_webview_window("main")`, and attempts `show()`, `unminimize()`, and `set_focus()` (each guarded with logging).
4. `setup_timer_callbacks()` now registers the focus callback alongside the end/cancel callbacks.

### 5.3 Island Controller ↔ Window Manager

- `IslandController.updateAudioUI()` notifies the window manager whenever `currentTrack` transitions between `nil` and populated, ensuring animation states stay consistent.

---

## 6. UI/UX Behavior Matrix

| Timer Mode | State | Audio Playing? | Expanded Content | Buttons | Notes |
|------------|-------|----------------|------------------|---------|-------|
| Countdown | Running | No | Centered timer + Cancel | Cancel only | Expansion allowed (same width as audio-only). |
| Countdown | Finished | No | Centered timer + End | End only | Stays until user presses End; island collapses afterward. |
| Countdown | Running | Yes | Audio metadata + timer | Cancel (right column) | Mirrors previous behavior; audio presence determines width. |
| Countdown | Finished | Yes | Audio metadata + timer | End (right column) | Prevents auto-switch to audio-only view. |
| Stopwatch | Running | Any | Audio (if available) + timer | End + Cancel | End triggers confirmation in React, Cancel stops session. |
| Break | Running | Any | Timer emphasis | Cancel only | Same as countdown running. |

---

## 7. Lifecycle and State Diagrams

### 7.1 End Button Flow (Countdown)

```
[Timer hits 0]
      ↓
IslandTimerPresenter → hasTimerFinished = true
      ↓
IslandView draws End button
      ↓ user clicks End
IslandController.endTimer()
      ↓
rust_timer_end_callback → TimerController::end_timer()
      ↓
Timer persisted + UI state Idle
      ↓
IslandController.collapseAndFocusApp()
      ↓
macos_sensing_trigger_focus_app()
      ↓
Rust focus_main_window() → Tauri window show + focus
```

### 7.2 Cancel Flow

```
IslandView Cancel tapped
      ↓
IslandController.cancelTimer()
      ↓
rust_timer_cancel_callback → TimerController::cancel_timer()
      ↓
IslandController.collapseAndFocusApp()
      ↓
Same focus pipeline as End
```

### 7.3 Expansion Rules

```
setExpanded(target)
  ├─ if already in target → return
  ├─ if target == true AND timerIsIdle == true AND currentTrack == nil → block
  └─ else mutate window state, update IslandWindowManager
```

---

## 8. Build & Tooling Updates

1. **Swift compilation warnings:** Removing the unused `artistHeight` variable keeps the `.swift-build` step green.
2. **Rust build:** The new focus callback required switching from `get_window()` (not available on Tauri 2) to `get_webview_window("main")` so the code compiles across dev/prod builds.
3. **Validation commands:** `cargo build` now exercises the Swift plugin and verifies the C/Rust bindings. `npm run build` remains the frontend gate.

---

## 9. Testing Strategy

1. **Unit-equivalent:** Not applicable (AppKit + Tauri IO). Changes rely on integration tests.
2. **Manual matrix:**
   - Start countdown with no audio → expand → Cancel; verify width and collapse.
   - Start countdown with audio → let it finish → End from island; ensure desktop window focuses.
   - Start stopwatch → End from island; confirm React dialog appears and window focuses.
   - Toggle between tracks/no tracks while expanded → ensure width animates correctly.
3. **Regression pass:** Run `cargo build` (verifies Swift bridge) and `npm run build` (TypeScript compilation) before packaging.

---

## 10. Future Work

1. **Confirmation overlays:** Stopwatch mode currently relies on React for the double-Enter confirmation. A native overlay in the island could provide parity without switching apps.
2. **Media controls exposure:** With the focus callback available, we can add Next/Previous shims that also foreground the app when deeper context is required.
3. **Multi-tenant windows:** Explore keeping the timer-only view narrower even in expanded mode, possibly animating width per section rather than reusing idle width.
4. **Notification center hooks:** When End is triggered from the island we could surface a macOS notification summarizing session stats, allowing the user to stay in their current app.

---

## Appendix A – File Inventory

| File | Purpose |
|------|---------|
| `IslandController.swift` | Expansion logic, End/Cancel routing, focus callback usage. |
| `IslandWindowManager.swift` | Manages window sizing based on timer/audio state. |
| `IslandView.swift` | Stores `hasTimerFinished`, draws timer-only layout. |
| `IslandTimerDrawing.swift` | Renders End/Cancel buttons according to state matrix. |
| `MacOSSensingFFI.{h,c}` | Declares/implements focus callback plumbing. |
| `macos_bridge.rs` | Registers callbacks, focuses Tauri window. |

---

## Appendix B – Open Questions

1. Should the island display session labels or summaries after completion now that we keep it visible until End is pressed?
2. Do we want to queue desktop focus until after the Tauri window finishes rendering the completion modal to avoid visible flicker?
3. Could we store the End/Cancel confirmation state inside Rust to keep React and Swift perfectly synchronized?

---

*End of document.*
