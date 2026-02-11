# Island Always-On-Top Implementation

How to make a window float above all other windows and persist across all Mission Control spaces on macOS.

## Overview

The Island uses a three-layer approach:
1. **High window level** (above menu bar)
2. **Collection behavior flags** (cross-space visibility)
3. **Private CGS APIs** (dedicated space with max level)

---

## 1. Window Level

Use `NSPanel` (not `NSWindow`) with a high window level:

```swift
let panel = NSPanel(
    contentRect: frame,
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
)

// Float above menu bar
panel.level = NSWindow.Level.mainMenu + 2
```

**Level hierarchy:**
- `.normal` = 0 (regular windows)
- `.floating` = 3 (floating panels)
- `.mainMenu` = 24 (menu bar)
- `.mainMenu + 2` = 26 (our island)

---

## 2. Collection Behavior

Make the window appear on all spaces and survive fullscreen:

```swift
panel.collectionBehavior = [
    .canJoinAllSpaces,      // Visible on all Mission Control spaces
    .stationary,            // Doesn't slide when switching spaces
    .fullScreenAuxiliary,   // Visible even in fullscreen apps
    .ignoresCycle           // Excluded from Cmd+` window cycling
]
```

---

## 3. Additional NSPanel Configuration

```swift
// Visual
panel.isOpaque = false
panel.backgroundColor = .clear
panel.hasShadow = false  // Optional

// Behavior
panel.hidesOnDeactivate = false  // Stay visible when app loses focus
panel.isMovable = false
panel.canBecomeKey = false       // For non-interactive overlays
panel.canBecomeMain = false

// Mouse handling (choose based on needs)
panel.ignoresMouseEvents = true  // For overlays
// OR
panel.ignoresMouseEvents = false
panel.acceptsMouseMovedEvents = true  // For interactive UI
```

---

## 4. Private CGS APIs (Nuclear Option)

For absolute top-level positioning that survives everything:

```swift
// Type aliases
typealias CGSConnectionID = UInt32
typealias CGSSpaceID = UInt64

// Private API declarations
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
```

**Usage:**

```swift
func setupDedicatedSpace(for windowNumber: Int) {
    let connection = _CGSDefaultConnection()

    // Create a dedicated space
    let space = CGSSpaceCreate(connection, 0, nil)

    // Set to maximum level
    CGSSpaceSetAbsoluteLevel(connection, space, Int32.max)

    // Make space visible
    CGSShowSpaces(connection, [space] as CFArray)

    // Add window to the space
    CGSAddWindowsToSpaces(connection,
                          [windowNumber] as CFArray,
                          [space] as CFArray)
}

// Call after window is displayed
if let windowNumber = panel.windowNumber {
    setupDedicatedSpace(for: windowNumber)
}
```

---

## 5. Minimal Working Example

For most use cases, you don't need CGS APIs. This works:

```swift
import AppKit

class AlwaysOnTopPanel {
    private var panel: NSPanel?

    func show(content: NSView, frame: NSRect) {
        let panel = NSPanel(
            contentRect: frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        // Always on top
        panel.level = .mainMenu + 2

        // All spaces + fullscreen
        panel.collectionBehavior = [
            .canJoinAllSpaces,
            .stationary,
            .fullScreenAuxiliary,
            .ignoresCycle
        ]

        // Transparent background
        panel.isOpaque = false
        panel.backgroundColor = .clear

        // Stay visible
        panel.hidesOnDeactivate = false

        // Content
        panel.contentView = content

        // Show
        panel.orderFrontRegardless()

        self.panel = panel
    }
}
```

---

## Caveats

| Issue | Solution |
|-------|----------|
| **App Store rejection** | CGS APIs are private; Apple may reject |
| **macOS updates** | Private APIs can break between versions |
| **Screen recording** | High-level windows appear in recordings |
| **Accessibility** | Ensure VoiceOver can still reach content |

---

## Source Files (lefocus)

- `IslandWindowManager.swift` - Window creation & levels
- `IslandSpaceManager.swift` - CGS private API usage
- `IslandController.swift` - Orchestration

---

## Quick Reference

```swift
// Minimum for always-on-top
panel.level = .mainMenu + 2
panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
panel.hidesOnDeactivate = false
```
