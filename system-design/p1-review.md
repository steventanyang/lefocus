# LeFocus P1 System Design Review

**Date:** January 2025  
**Status:** Gap Analysis

---

## Overview

This document identifies gaps and missing implementation details in the P1 Dynamic Island system design. The Swift window management foundation is solid, but several critical areas need specification before implementation.

---

## Critical Gaps

### 1. WebView Embedding — Missing Implementation Details

**Issue:** The P1 doc mentions "embeds webviews" but provides no implementation details.

**Missing:**

- How to embed `WKWebView` in `NSWindow` programmatically
- How React content loads into island windows (same bundle, separate build, or different route?)
- Initial state passing to webviews
- URL/routing strategy for island windows

**Current Status:**

- `createIslandWindow()` creates empty NSWindows
- No content loading mechanism specified
- Phase 7 mentions "WebView embedding" but no details

---

### 2. Screen Space Validation — Missing Bounds Checking

**Issue:** Window positioning logic may place windows off-screen or overlapping with notch.

**Missing:**

- Validation that calculated positions are within screen bounds
- Handling when notch is too close to screen edge
- Fallback when windows would overlap with notch

**Risk:** Windows may be invisible or positioned incorrectly on some displays.

---

### 3. Window Lifecycle vs App Lifecycle

**Issue:** Unclear behavior when main app closes/restarts.

**Missing:**

- What happens when main app closes?
- Do island windows persist independently?
- What about app restarts (crash recovery)?
- Should island windows close when main app closes?

**Current Behavior (Unspecified):**

- Island windows created in Swift, managed independently
- No explicit cleanup on app termination
- No persistence strategy

---

### 4. Display Change Handling — Incomplete Implementation

**Issue:** Mentions listening but no implementation details.

**Missing:**

- Implementation of `NSApplication.didChangeScreenParametersNotification` listener
- Debouncing/throttling for rapid changes
- Handling display disconnect/reconnect
- Multi-monitor re-positioning logic

**Current Status:**

- `repositionWindows()` method exists but not called automatically
- No notification listener setup

---

### 5. Error Handling for Window Operations

**Issue:** Missing comprehensive error handling.

**Missing:**

- What if `createWindows()` fails mid-session?
- Retry logic for window creation failures
- Graceful degradation when windows can't be created
- Logging/reporting for debugging

**Current Status:**

- `createWindows()` returns `Bool` but no error details
- No retry mechanism
- No fallback strategy

---

### 6. Window Identification and Tracking

**Issue:** No way to reference windows later for updates.

**Missing:**

- Track which window is left vs right
- Reference windows later for updates
- Handle window close events from Swift side

**Current Status:**

- Windows stored as `leftWindow` and `rightWindow` (good)
- But no way for Rust to identify which window to update
- No window close event handling

---

### 7. State Synchronization for Island Windows

**Issue:** P1 doc mentions timer updates but missing implementation details.

**Missing:**

- How React components in island windows receive initial state
- Whether island windows are separate React instances or shared
- How to update window content (timer display) from Rust
- WebView communication bridge (Swift ↔ WebView ↔ React)

**Current Status:**

- Timer state syncs via Tauri events (`timer-state-changed`, `timer-heartbeat`)
- But island windows may not be Tauri windows (they're Swift NSWindows)
- No bridge specified for Swift windows to receive events

**Options:**

- **Option A:** WebView Message Bridge (Swift ↔ WebView ↔ React)
- **Option B:** Tauri IPC Bridge (if island windows are Tauri windows)
- **Option C:** HTTP Server Bridge (Rust runs local server, WebViews poll)

---

### 8. App Handle Lifecycle in FFI Bridge

**Issue:** Concerns about weak reference handling.

**Missing:**

- Explicit lifecycle management when app handle is destroyed
- Callback registration timing guarantees
- Thread safety for app handle access

**Current Status:**

- P1 doc shows weak reference pattern (good)
- But no explicit cleanup on app shutdown
- No guarantees about callback registration timing

---

### 9. Window Positioning Edge Cases

**Issue:** Missing handling for various display scenarios.

**Missing:**

- Multiple displays with different scaling
- Notch on secondary display (if possible)
- Safe area insets changing dynamically
- Menu bar height variations

---

### 10. Content Loading Strategy — Completely Unspecified

**Issue:** Phase 7 mentions "WebView embedding" but no details.

**Missing:**

- Load React bundle from same URL as main app?
- Create separate island-specific HTML entry point?
- How to pass window identifier to React?
- CSS/styling isolation between windows?

**Options:**

- **Option A:** Same React app, route-based (`/island-left`, `/island-right`)
- **Option B:** Separate entry points (separate bundles)
- **Option C:** Single bundle with window context (hash-based routing)

---

### 11. Performance Considerations — Incomplete

**Issue:** Missing specific performance targets and measurements.

**Missing:**

- WebView memory overhead per window
- JavaScript execution context (shared or separate?)
- Animation performance (60fps requirements)
- Battery impact of WebViews

**No Performance Targets Specified:**

- Memory budget per window
- CPU usage targets
- Battery drain limits
- Rendering performance requirements

---

### 12. Testing Strategy Gaps

**Issue:** Missing testing infrastructure details.

**Missing:**

- How to test Swift code without full app
- Unit test strategy for notch detection
- Integration test setup for window creation
- Automated testing for window positioning

---

### 13. Build and Bundling

**Issue:** Missing production build details.

**Missing:**

- How Swift plugin gets bundled in production
- WebView asset loading in production
- Code signing implications
- dylib location in release builds

**Current Status:**

- Development path specified (`target/debug/libmacos_sensing_plugin.dylib`)
- Production path incomplete (`libmacos_sensing_plugin.dylib` - may not exist in bundle)
- No build process documented

---

## Summary by Priority

### High Priority (Block Implementation)

1. **WebView Embedding** — Specify how React content loads into Swift windows
2. **Content Loading Strategy** — Decide on routing/bundling approach
3. **State Synchronization** — Implement bridge between Rust and WebView
4. **Error Handling** — Add comprehensive error handling and recovery

### Medium Priority (Needed for Robustness)

5. **Window Lifecycle** — Specify cleanup and persistence behavior
6. **Display Change Handling** — Implement notification listeners
7. **Screen Space Validation** — Add bounds checking
8. **Window Tracking** — Add delegate and state management

### Low Priority (Polish & Optimization)

9. **Performance Monitoring** — Add measurement tools
10. **Testing Infrastructure** — Create test suites
11. **Build Configuration** — Document production builds
12. **Edge Case Handling** — Multi-monitor, scaling, etc.

---

## Questions for Product Owner

1. Should island windows close when main app closes? Or persist?
2. Should island windows be Tauri windows (easier IPC) or pure Swift windows (more control)?
3. What's the preferred content loading strategy? Route-based or separate bundles?
4. Do we need island windows to work on Macs without notch? (Fallback UI?)
5. Should island windows persist across app restarts? (State persistence?)

---

**End of Review Document**
