# LeChat CGS Cross-Space Window Implementation

## Problem Statement

LeChat is a Tauri app with a popup window triggered by `Cmd+Shift+L`. The popup must appear on **any macOS Space** the user is currently on, above all other windows (including fullscreen apps like Obsidian).

**Current behavior**: Popup only appears on Space 1 (where the app was launched), not on the user's current Space.

**Goal**: Popup appears on the CURRENT Space at maximum z-level, visible above everything.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Rust (src-tauri/src/lib.rs)                                 │
│   - Tauri app entry point                                   │
│   - Global shortcut handler (Cmd+Shift+L)                   │
│   - Calls elevate_popup_window() when popup shown           │
│   - FFI binding to Swift function                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ FFI call
┌─────────────────────────────────────────────────────────────┐
│ Swift (swift/Sources/Accessibility.swift)                   │
│   - CGS private API declarations                            │
│   - elevate_window_to_dedicated_space() function            │
│   - Creates dedicated Space, sets max level, adds window    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ @_silgen_name bindings
┌─────────────────────────────────────────────────────────────┐
│ CoreGraphics Server (private framework)                     │
│   - _CGSDefaultConnection()                                 │
│   - CGSSpaceCreate()                                        │
│   - CGSSpaceSetAbsoluteLevel()                              │
│   - CGSShowSpaces()                                         │
│   - CGSAddWindowsToSpaces()                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## File 1: Swift Implementation

**Path**: `swift/Sources/Accessibility.swift`

```swift
// MARK: - CGS Private APIs (Nuclear Option for Cross-Space Windows)

typealias CGSConnectionID = UInt32
typealias CGSSpaceID = UInt64
typealias CGSWindowID = UInt32

@_silgen_name("_CGSDefaultConnection")
func _CGSDefaultConnection() -> CGSConnectionID

@_silgen_name("CGSSpaceCreate")
func CGSSpaceCreate(_ connection: CGSConnectionID,
                    _ options: Int32,
                    _ attributes: CFDictionary?) -> CGSSpaceID

@_silgen_name("CGSSpaceSetAbsoluteLevel")
func CGSSpaceSetAbsoluteLevel(_ connection: CGSConnectionID,
                              _ space: CGSSpaceID,
                              _ level: Int32) -> Int32

@_silgen_name("CGSShowSpaces")
func CGSShowSpaces(_ connection: CGSConnectionID,
                   _ spaces: CFArray) -> Int32

@_silgen_name("CGSAddWindowsToSpaces")
func CGSAddWindowsToSpaces(_ connection: CGSConnectionID,
                           _ windows: CFArray,
                           _ spaces: CFArray) -> Int32

/// Elevate a window to a dedicated CGS Space at maximum level
/// This makes the window appear above ALL other windows on ALL Spaces
@_cdecl("elevate_window_to_dedicated_space")
public func elevateWindowToDedicatedSpace(_ windowNumber: Int32) -> Bool {
    print("[Swift-CGS] elevate_window_to_dedicated_space called for window \(windowNumber)")

    let connection = _CGSDefaultConnection()
    print("[Swift-CGS] Got connection: \(connection)")

    // 1. Create a DEDICATED space (not just get current one)
    let space = CGSSpaceCreate(connection, 0, nil)
    print("[Swift-CGS] Created dedicated space: \(space)")

    // 2. Set to MAXIMUM level - this is the key!
    let levelResult = CGSSpaceSetAbsoluteLevel(connection, space, Int32.max)
    print("[Swift-CGS] Set level result: \(levelResult)")

    // 3. Make space visible - MUST use NSNumber wrapper for CFArray
    let spaceArray = [NSNumber(value: space)] as CFArray
    let showResult = CGSShowSpaces(connection, spaceArray)
    print("[Swift-CGS] Show spaces result: \(showResult)")

    // 4. Add window to the elevated space - MUST use NSNumber wrapper
    let windowArray = [NSNumber(value: windowNumber)] as CFArray
    let addResult = CGSAddWindowsToSpaces(connection, windowArray, spaceArray)
    print("[Swift-CGS] Add window to space result: \(addResult)")

    return addResult == 0
}
```

### CRITICAL Implementation Detail

The CFArray elements **MUST** use `NSNumber` wrappers:
```swift
// CORRECT - CGS functions receive proper values
let spaceArray = [NSNumber(value: space)] as CFArray
let windowArray = [NSNumber(value: windowNumber)] as CFArray

// WRONG - CGS functions receive garbage, fail silently
let spaceArray = [space] as CFArray
let windowArray = [windowNumber] as CFArray
```

---

## File 2: C Header

**Path**: `swift/Sources/include/accessibility.h`

```c
#ifndef ACCESSIBILITY_H
#define ACCESSIBILITY_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ... other declarations ...

// CGS Private API - elevate window to dedicated space
bool elevate_window_to_dedicated_space(int32_t window_number);

#ifdef __cplusplus
}
#endif

#endif // ACCESSIBILITY_H
```

---

## File 3: Rust FFI and Usage

**Path**: `src-tauri/src/lib.rs`

```rust
#[cfg(target_os = "macos")]
use cocoa::appkit::{NSApp, NSApplication, NSWindow, NSWindowCollectionBehavior};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil, YES, NO};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

#[cfg(target_os = "macos")]
extern "C" {
    fn elevate_window_to_dedicated_space(window_number: i32) -> bool;
}

#[cfg(target_os = "macos")]
fn elevate_popup_window(window: &WebviewWindow) {
    if let Ok(ns_window) = window.ns_window() {
        let ns_window = ns_window as id;
        unsafe {
            // Get window number for CGS APIs
            let window_number: i64 = msg_send![ns_window, windowNumber];
            println!("[LeChat] Window number: {}", window_number);

            // Standard elevation (belt)
            // Level 26 = mainMenu + 2 (above menu bar)
            ns_window.setLevel_(26);

            // Full cross-space visibility
            ns_window.setCollectionBehavior_(
                NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                    | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                    | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
            );

            // Stay visible when app loses focus
            ns_window.setHidesOnDeactivate_(NO);

            // CGS nuclear option (suspenders)
            let cgs_result = elevate_window_to_dedicated_space(window_number as i32);
            println!("[LeChat] CGS elevation result: {}", cgs_result);

            NSApp().activateIgnoringOtherApps_(YES);
            ns_window.makeKeyAndOrderFront_(nil);
        }
        println!("[LeChat] Elevated popup window with CGS dedicated space");
    }
}
```

---

## Expected Console Output (Success)

```
[LeChat] Window number: 12345
[Swift-CGS] elevate_window_to_dedicated_space called for window 12345
[Swift-CGS] Got connection: 1
[Swift-CGS] Created dedicated space: 9876543210
[Swift-CGS] Set level result: 0
[Swift-CGS] Show spaces result: 0
[Swift-CGS] Add window to space result: 0
[LeChat] CGS elevation result: true
[LeChat] Elevated popup window with CGS dedicated space
```

---

## Expected Console Output (Failure - Before NSNumber Fix)

```
[Swift-CGS] Created dedicated space: 0          # <- Should be non-zero!
[Swift-CGS] Set level result: -
[Swift-CGS] Add window to space result: -1      # <- Failure
[LeChat] CGS elevation result: false
```

---

## What We've Tried (Failed Approaches)

1. **AppKit NSWindow.level** - `setLevel_(26)` works for z-order but NOT for cross-Space
2. **NSWindowCollectionBehavior.canJoinAllSpaces** - Documented but doesn't work reliably
3. **CGSGetActiveSpace + CGSAddWindowsToSpaces** - Gets current space but window doesn't appear there
4. **Island pattern (public APIs)** - Same as #1, doesn't cross Spaces

---

## CGS API Reference

| Function | Purpose | Return |
|----------|---------|--------|
| `_CGSDefaultConnection()` | Get connection to window server | Connection ID (UInt32) |
| `CGSSpaceCreate(conn, opts, attrs)` | Create new Space | Space ID (UInt64) |
| `CGSSpaceSetAbsoluteLevel(conn, space, level)` | Set Space z-level | 0 = success |
| `CGSShowSpaces(conn, spaces)` | Make Spaces visible | 0 = success |
| `CGSAddWindowsToSpaces(conn, windows, spaces)` | Add windows to Spaces | 0 = success |
| `CGSGetActiveSpace(conn)` | Get current active Space | Space ID |

---

## Build Commands

```bash
# Build release
cd src-tauri && cargo build --release

# Run with console output visible
./target/release/lechat

# Or run via cargo
cargo run --release
```

---

## Test Procedure

1. Launch LeChat (stays on Space 1)
2. Switch to Space 2 with Obsidian in fullscreen
3. Select text in Obsidian
4. Press `Cmd+Shift+L`
5. **Expected**: Popup appears on Space 2, above Obsidian
6. **Actual (bug)**: Popup appears on Space 1 or not visible

---

## Questions for Debugging

1. Is `CGSSpaceCreate` returning a valid (non-zero) space ID?
2. Does `CGSSpaceSetAbsoluteLevel` return 0 (success)?
3. Does `CGSShowSpaces` return 0?
4. Does `CGSAddWindowsToSpaces` return 0?
5. Are there alternative CGS functions that work better for this use case?
6. Is there a different approach (e.g., overlay window, status item window) that reliably shows on all Spaces?

---

## Working Reference (What We're Trying to Emulate)

- **Spotlight** - Appears on any Space instantly
- **Notification Center** - Slides in on current Space
- **Dynamic Island** (on supported Macs) - Always visible
- **Alfred/Raycast** - Popup appears on current Space

These all use private APIs to achieve cross-Space visibility.
