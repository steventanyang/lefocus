# Island Window Implementation Report
Generated: 2026-01-24

## Summary

The Island implementation uses a sophisticated approach combining NSPanel window configuration, private CGS (Core Graphics Services) APIs, and a two-window hierarchy to create a persistent "Dynamic Island" that floats above all windows and remains visible across all macOS spaces/desktops.

## Key Implementation Files

1. **IslandWindowManager.swift** - Creates and manages the window hierarchy
2. **IslandSpaceManager.swift** - Uses private CGS APIs to keep windows across all spaces
3. **IslandController.swift** - Coordinates the overall Island system
4. **IslandView.swift** - Custom NSView for rendering the Island UI

---

## 1. Window Creation & Configuration

### Two-Window Hierarchy

**Location:** `/Users/showandtell_guest/steven/lefocus/src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandWindowManager.swift`

The implementation uses TWO NSPanel windows in a parent-child relationship:

#### Parent Window (Lines 74-98)
```swift
let panel = NSPanel(
    contentRect: screen.frame,
    styleMask: [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow],
    backing: .buffered,
    defer: false
)
panel.level = .mainMenu + 1
panel.isOpaque = false
panel.backgroundColor = .clear
panel.hasShadow = false
panel.hidesOnDeactivate = false
panel.ignoresMouseEvents = true
panel.isMovable = false
panel.isMovableByWindowBackground = false
panel.isReleasedWhenClosed = false
panel.collectionBehavior = [
    .canJoinAllSpaces,
    .stationary,
    .fullScreenAuxiliary,
    .ignoresCycle
]
```

#### Island Window (Lines 100-133)
```swift
let islandPanel = NSPanel(
    contentRect: targetFrame,
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
)
islandPanel.level = .mainMenu + 2
islandPanel.isOpaque = false
islandPanel.backgroundColor = .clear
islandPanel.hasShadow = true
islandPanel.hidesOnDeactivate = false
islandPanel.ignoresMouseEvents = false
islandPanel.isMovable = false
islandPanel.isMovableByWindowBackground = false
islandPanel.isReleasedWhenClosed = false
islandPanel.acceptsMouseMovedEvents = true
islandPanel.collectionBehavior = [
    .canJoinAllSpaces,
    .stationary,
    .fullScreenAuxiliary,
    .ignoresCycle
]
```

#### Parent-Child Relationship (Line 130)
```swift
parentWindow?.addChildWindow(islandPanel, ordered: .above)
```

---

## 2. Window Level - Floating Above All Windows

### NSWindow.Level Configuration

**Critical Settings:**

- **Parent Window Level:** `.mainMenu + 1` (Line 81)
- **Island Window Level:** `.mainMenu + 2` (Line 108)

This ensures the Island floats above:
- Normal windows (NSWindow.Level.normal = 0)
- Floating panels (NSWindow.Level.floating = 3)
- Modal panels (NSWindow.Level.modalPanel = 8)
- Main menu (NSWindow.Level.mainMenu = 24)
- Status items (NSWindow.Level.statusBar = 25)

By setting the level to `.mainMenu + 2` (26), the Island sits just above the menu bar, making it visible above all standard application windows.

---

## 3. Collection Behavior - Visible Across All Spaces

### NSWindow.CollectionBehavior Flags

**Lines 90-95 (parent) and 118-123 (island):**

```swift
panel.collectionBehavior = [
    .canJoinAllSpaces,      // Appears on all spaces/desktops
    .stationary,            // Doesn't move when switching spaces
    .fullScreenAuxiliary,   // Visible even in fullscreen mode
    .ignoresCycle           // Excluded from window cycling (Cmd+`)
]
```

| Flag | Purpose |
|------|---------|
| `.canJoinAllSpaces` | Window appears on all Mission Control spaces |
| `.stationary` | Window doesn't animate when switching spaces |
| `.fullScreenAuxiliary` | Remains visible when apps go fullscreen |
| `.ignoresCycle` | Not included in Cmd+` window cycling |

---

## 4. Advanced: CGS Private APIs for Space Management

### IslandSpaceManager - Cross-Space Persistence

**Location:** `/Users/showandtell_guest/steven/lefocus/src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/IslandSpaceManager.swift`

The implementation goes beyond standard NSWindow APIs by using **private Core Graphics Services (CGS) APIs** to create a dedicated space with maximum level.

#### Creating a Dedicated CGS Space (Lines 53-75)

```swift
private func ensureSpace() -> CGSSpaceID? {
    let connection = _CGSDefaultConnection()
    let space = CGSSpaceCreate(connection, 1, nil)
    
    // Set to maximum level (Int32.max)
    CGSSpaceSetAbsoluteLevel(connection, space, Int32.max)
    
    // Make the space visible
    CGSShowSpaces(connection, [NSNumber(value: space)] as CFArray)
    
    return space
}
```

#### Adding Windows to the Space (Lines 77-86)

```swift
private func addWindows(_ windowIDs: [CGSWindowID], to space: CGSSpaceID) {
    let connection = _CGSDefaultConnection()
    let cfWindows = windowIDs.map { NSNumber(value: $0) } as CFArray
    let cfSpaces = [NSNumber(value: space)] as CFArray
    CGSAddWindowsToSpaces(connection, cfWindows, cfSpaces)
}
```

#### Private CGS API Declarations (Lines 136-165)

```swift
@_silgen_name("_CGSDefaultConnection")
private func _CGSDefaultConnection() -> CGSConnectionID

@_silgen_name("CGSSpaceCreate")
private func CGSSpaceCreate(_ connection: CGSConnectionID, _ options: Int32, _ attributes: CFDictionary?) -> CGSSpaceID

@_silgen_name("CGSSpaceSetAbsoluteLevel")
private func CGSSpaceSetAbsoluteLevel(_ connection: CGSConnectionID, _ space: CGSSpaceID, _ level: Int32) -> Int32

@_silgen_name("CGSAddWindowsToSpaces")
private func CGSAddWindowsToSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32

@_silgen_name("CGSRemoveWindowsFromSpaces")
private func CGSRemoveWindowsFromSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32

@_silgen_name("CGSShowSpaces")
private func CGSShowSpaces(_ connection: CGSConnectionID, _ spaces: CFArray) -> Int32

@_silgen_name("CGSHideSpaces")
private func CGSHideSpaces(_ connection: CGSConnectionID, _ spaces: CFArray) -> Int32
```

### How IslandSpaceManager Works

1. **Creates a CGS space** with `CGSSpaceCreate()`
2. **Sets it to maximum level** with `CGSSpaceSetAbsoluteLevel(connection, space, Int32.max)`
3. **Makes it visible** with `CGSShowSpaces()`
4. **Adds Island windows** to this space using `CGSAddWindowsToSpaces()`
5. **Registers windows** in `attach()` method (Lines 109-125)

This ensures the Island persists across ALL Mission Control operations.

---

## 5. Additional Window Properties

### Mouse & Activation Behavior

**Parent Window:**
- `ignoresMouseEvents = true` - Clicks pass through
- `isMovable = false` - Cannot be dragged
- `hidesOnDeactivate = false` - Stays visible when focus changes

**Island Window:**
- `ignoresMouseEvents = false` - Accepts mouse input
- `acceptsMouseMovedEvents = true` - Tracks mouse hover
- `isMovable = false` - Cannot be dragged

### Visual Properties

- `isOpaque = false` - Transparent background
- `backgroundColor = .clear` - No background color
- `hasShadow = true` (island only) - Adds depth
- `styleMask = [.borderless, .nonactivatingPanel]` - No window chrome

---

## 6. Positioning Strategy

### Notch Detection & Alignment

**Lines 236-256 in IslandWindowManager.swift:**

```swift
private func islandFrame(for screen: NSScreen, size: NSSize) -> NSRect {
    let originX = screen.frame.midX - size.width / 2.0

    if let notch = screen.lf_notchRect {
        // Calculate where the compact island's top edge would be
        let compactTopEdge = notch.maxY + islandVerticalInset(for: screen)
        
        // Keep the top edge aligned when expanding - only grow downward
        let originY = compactTopEdge - size.height
        
        return NSRect(x: originX, y: originY, width: size.width, height: size.height)
    }
    
    // For screens without notch, use similar logic
    let compactTopEdge = screen.frame.maxY - 8.0
    let originY = compactTopEdge - size.height
    
    return NSRect(x: originX, y: originY, width: size.width, height: size.height)
}
```

### Screen Extensions (IslandController.swift Lines 340-404)

Custom NSScreen extensions detect:
- Built-in display (`lf_isBuiltIn`)
- Notch presence (`lf_hasNotch`)
- Notch dimensions (`lf_notchRect`)
- Safe area below notch (`lf_safeNotchBottom`)

---

## 7. Integration Points

### Initialization Flow (IslandController.swift Lines 85-94)

```swift
public func initialize() {
    stateQueue.async { [weak self] in
        guard let self else { return }
        DispatchQueue.main.async {
            self.windowManager.ensureWindowHierarchy()  // Creates windows
            self.audioController.startMonitoring()
            self.timerPresenter.initializeIdleState()
            IslandChimePlayer.shared.bootstrap()
        }
    }
}
```

### Window Registration (IslandWindowManager.swift Lines 140, 146)

```swift
if let parentWindow {
    IslandSpaceManager.shared.attach(window: parentWindow)
}

if let islandPanel = islandWindow {
    IslandSpaceManager.shared.attach(window: islandPanel)
}
```

---

## Summary of Techniques

| Technique | API/Pattern | Purpose |
|-----------|-------------|---------|
| **Window Level** | `NSWindow.level = .mainMenu + 2` | Float above all windows |
| **Collection Behavior** | `.canJoinAllSpaces`, `.stationary`, `.fullScreenAuxiliary` | Visible on all spaces |
| **Parent-Child Hierarchy** | `addChildWindow(_:ordered:)` | Coordinate two panels |
| **CGS Space** | `CGSSpaceCreate()`, `CGSSpaceSetAbsoluteLevel()` | Dedicated max-level space |
| **Window Attachment** | `CGSAddWindowsToSpaces()` | Add windows to CGS space |
| **Notch Detection** | `NSScreen.safeAreaInsets`, custom extensions | Position near notch |

---

## Key Insights

1. **Dual-window approach:** Parent window covers full screen (for space management), child window is the visible Island
2. **Window level stacking:** `.mainMenu + 2` ensures it's above standard UI but doesn't interfere with system dialogs
3. **CGS private APIs:** The real "magic" is creating a dedicated space with `Int32.max` level
4. **Collection behavior is not enough:** Standard `.canJoinAllSpaces` helps, but CGS APIs ensure true persistence
5. **Retry mechanism:** Window attachment retries up to 5 times (Lines 109-125) to handle timing issues

---

## Code Pattern for Replication

To create a similar always-on-top, cross-space window:

```swift
// 1. Create NSPanel with high window level
let panel = NSPanel(...)
panel.level = .mainMenu + 2
panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]

// 2. Use CGS APIs to create dedicated space
let space = CGSSpaceCreate(_CGSDefaultConnection(), 1, nil)
CGSSpaceSetAbsoluteLevel(_CGSDefaultConnection(), space, Int32.max)
CGSShowSpaces(_CGSDefaultConnection(), [NSNumber(value: space)] as CFArray)

// 3. Add window to the space
let windowID = CGSWindowID(panel.windowNumber)
CGSAddWindowsToSpaces(_CGSDefaultConnection(), [windowID] as CFArray, [space] as CFArray)
```

This combination ensures the window appears on all spaces and floats above all other content.
