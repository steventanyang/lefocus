# MewNotch System Design Document

## Overview

This document explains how MewNotch displays content in the menu bar area under the notch on MacBook Pro displays. The implementation uses a combination of window management, private macOS APIs, and SwiftUI layout techniques to achieve this effect.

## Architecture

### Core Components

1. **MewPanel** - Custom window class for notch display
2. **NotchManager** - Manages window lifecycle and positioning
3. **NotchSpaceManager** - Handles window space management using private CGS APIs
4. **WindowManager** - Alternative space management using SkyLight framework
5. **NotchUtils** - Utility for detecting and calculating notch dimensions
6. **NotchView** - SwiftUI view that renders the actual notch content

---

## 1. Window Positioning Strategy

### MewPanel (`MewWindow.swift`)

The foundation of the notch display is a custom `NSPanel` subclass with specific properties:

```swift
class MewPanel: NSPanel {
    // Key properties:
    level = .mainMenu + 1  // Positions window just above menu bar
    isOpaque = false
    backgroundColor = .clear
    styleMask = [.borderless, .nonactivatingPanel, .utilityWindow, .hudWindow]
    collectionBehavior = [.fullScreenAuxiliary, .stationary, .canJoinAllSpaces, .ignoresCycle]
}
```

**Key Points:**
- **Window Level**: `.mainMenu + 1` ensures the window appears above the menu bar but below system overlays
- **Transparency**: Fully transparent background allows content to appear "inside" the notch
- **Non-activating**: Window doesn't steal focus from other applications
- **Borderless**: No window chrome, just content

---

## 2. Notch Detection

### NotchUtils (`NotchUtils.swift`)

The app uses macOS screen APIs to detect and measure the notch:

```swift
func hasNotch(screen: NSScreen) -> Bool {
    return screen.safeAreaInsets.top > 0
}

func notchSize(screen: NSScreen) -> CGSize {
    // Calculate width using auxiliary areas
    let topLeftSpace = screen.auxiliaryTopLeftArea?.width
    let topRightSpace = screen.auxiliaryTopRightArea?.width
    let notchWidth = screen.frame.width - topLeftSpace - topRightSpace
    
    // Calculate height from safe area insets
    let notchHeight = screen.safeAreaInsets.top
    
    return CGSize(width: notchWidth, height: notchHeight)
}
```

**NSScreen Properties Used:**
- `safeAreaInsets.top` - Detects presence of notch and provides height
- `auxiliaryTopLeftArea?.width` - Width of menu bar area to the left of notch
- `auxiliaryTopRightArea?.width` - Width of menu bar area to the right of notch
- `frame.maxY - visibleFrame.maxY` - Alternative height calculation for menu bar matching

---

## 3. Full-Screen Window with Centered Content

### NotchManager (`NotchManager.swift`)

The window management strategy:

```swift
// Create window covering entire screen
panel.setFrame(screen.frame, display: true)

// Create SwiftUI view
let view = NSHostingView(rootView: NotchView(screen: screen))
panel.contentView = view

// Show window
panel.orderFrontRegardless()
```

**Layout Strategy:**
- Window covers the **entire screen** (`screen.frame`)
- Content is centered using SwiftUI `HStack` with `Spacer()` on both sides
- Only the centered notch-shaped area is visible due to masking

### NotchView Layout (`NotchView.swift`)

```swift
VStack {
    HStack {
        Spacer()  // Pushes content to center
        
        ZStack {
            // Notch content here
        }
        .mask(NotchShape(...))  // Masks to notch shape
        
        Spacer()  // Balances the centering
    }
    Spacer()  // Pushes content to top
}
```

**Visual Masking:**
- Uses `NotchShape` with rounded corners to mask the content
- Creates the illusion that content is "inside" the notch
- Background is black, creating contrast with menu bar

---

## 4. Private CGS APIs for Space Management

### NotchSpaceManager (`NotchSpaceManager.swift`)

Uses private Core Graphics Services APIs to manage window spaces:

```swift
class CGSSpace {
    init(level: Int = 0) {
        // Create custom space
        identifier = CGSSpaceCreate(_CGSDefaultConnection(), flag, nil)
        
        // Set to maximum level
        CGSSpaceSetAbsoluteLevel(_CGSDefaultConnection(), identifier, 2147483647)
        
        // Show the space
        CGSShowSpaces(_CGSDefaultConnection(), [identifier])
    }
    
    // Add windows to this space
    windows.insert(panel)
}
```

**Private CGS Functions Used:**
- `CGSSpaceCreate()` - Creates a new window space
- `CGSSpaceSetAbsoluteLevel()` - Sets absolute z-order level (max: 2147483647)
- `CGSAddWindowsToSpaces()` - Adds windows to the custom space
- `CGSShowSpaces()` - Makes the space visible

**Purpose:**
- Ensures the notch window stays above all other content
- Prevents interference from other applications
- Maintains visibility across all desktop spaces

---

## 5. Alternative: SkyLight Framework

### WindowManager (`WindowManager.swift`)

Alternative implementation using SkyLight framework (for lock screen display):

```swift
class WindowManager {
    // Load SkyLight framework
    let bundle = CFBundleCreate(kCFAllocatorDefault, 
        NSURL(fileURLWithPath: "/System/Library/PrivateFrameworks/SkyLight.framework"))
    
    // Get function pointers
    let SLSSpaceCreate = CFBundleGetFunctionPointerForName(bundle, "SLSSpaceCreate")
    let SLSSpaceSetAbsoluteLevel = ...
    
    // Create space at lock screen level
    space = SLSSpaceCreate(connection, 1, 0)
    SLSSpaceSetAbsoluteLevel(connection, space, 
        CGSSpaceLevel.kSLSSpaceAbsoluteLevelNotificationCenterAtScreenLock.rawValue)
}
```

**SkyLight Functions:**
- `SLSMainConnectionID()` - Gets main connection
- `SLSSpaceCreate()` - Creates space
- `SLSSpaceSetAbsoluteLevel()` - Sets level (e.g., lock screen level: 400)
- `SLSSpaceAddWindowsAndRemoveFromSpaces()` - Moves windows to space

**Use Case:**
- Used when displaying notch on lock screen
- Requires higher privilege level than regular CGS APIs

---

## 6. Window Lifecycle Management

### Initialization Flow

1. **App Launch** (`MewAppDelegate.swift`):
   ```swift
   func applicationDidFinishLaunching() {
       // Initial delay to ensure system is ready
       timer = Timer.scheduledTimer(withTimeInterval: 30) { _ in
           NotchManager.shared.refreshNotches(killAllWindows: true)
       }
       
       // Initial creation (without space assignment)
       NotchManager.shared.refreshNotches(addToSeparateSpace: false)
   }
   ```

2. **Window Creation** (`NotchManager.swift`):
   - Detects all screens with notches
   - Creates `MewPanel` for each screen
   - Wraps `NotchView` in `NSHostingView`
   - Sets window frame to full screen
   - Adds to custom space

3. **Screen Change Handling**:
   - Listens for `NSApplication.didChangeScreenParametersNotification`
   - Refreshes windows when displays are added/removed
   - Updates window positions and sizes

---

## 7. Content Rendering

### NotchView Structure

```
NotchView
├── VStack (vertical layout)
│   ├── HStack (horizontal centering)
│   │   ├── Spacer()
│   │   ├── ZStack (notch content)
│   │   │   ├── ExpandedNotchView (expanded state)
│   │   │   └── CollapsedNotchView (collapsed state)
│   │   │       └── HUD Views (brightness, volume, etc.)
│   │   ├── Spacer()
│   └── Spacer() (pushes to top)
```

**Features:**
- **Collapsed State**: Shows minimal HUD (brightness, volume, etc.)
- **Expanded State**: Shows full interface with controls
- **Masking**: `NotchShape` creates rounded rectangle matching notch
- **Animations**: Scale and shadow effects on hover

---

## 8. Key Technical Details

### Window Properties Summary

| Property | Value | Purpose |
|----------|-------|---------|
| `level` | `.mainMenu + 1` | Above menu bar, below system overlays |
| `isOpaque` | `false` | Transparent background |
| `backgroundColor` | `.clear` | Fully transparent |
| `hasShadow` | `false` | No shadow for seamless integration |
| `isMovable` | `false` | Fixed position |
| `canBecomeKey` | `false` | Never receives focus |
| `canBecomeMain` | `false` | Never becomes main window |

### Space Level Hierarchy

```
2147483647 (Max) - NotchSpaceManager custom space
    400 - Lock screen / Notification center (WindowManager)
    300 - Screen lock
    200 - Security agent
    100 - Setup assistant
      0 - Default (normal windows)
```

### Notch Detection Logic

1. Check `screen.safeAreaInsets.top > 0` → Has notch
2. Calculate width: `screen.width - leftAuxArea - rightAuxArea`
3. Calculate height: `safeAreaInsets.top` or `frame.maxY - visibleFrame.maxY`
4. Account for padding: `notchSize.width += 16` (extra padding)

---

## 9. Limitations and Considerations

### Private API Usage

⚠️ **Warning**: This implementation uses private macOS APIs:
- CGS (Core Graphics Services) functions
- SkyLight framework functions
- These APIs are **not officially supported** and may break in future macOS versions

### App Store Compatibility

- Apps using private APIs **cannot** be distributed through the Mac App Store
- Requires direct distribution or alternative app stores
- May require disabling App Sandbox

### System Permissions

- May require **Accessibility** permissions for window management
- May require **Screen Recording** permissions (depending on features)
- `NSApp.setActivationPolicy(.accessory)` prevents Dock icon

### Performance Considerations

- Full-screen transparent windows can impact performance
- Multiple displays multiply window count
- Space management operations are relatively expensive

---

## 10. Alternative Approaches

### Why This Approach Works

1. **Full-screen window** ensures content is always positioned correctly
2. **Centered layout** automatically adapts to different screen sizes
3. **High-level space** prevents other apps from covering the notch
4. **Transparency** allows seamless visual integration

### Why Other Approaches Don't Work

- ❌ **Menu bar extra**: Limited to menu bar icon, can't draw in notch area
- ❌ **Status bar item**: Same limitation, no access to notch space
- ❌ **Normal window**: Would be covered by menu bar or other windows
- ❌ **Overlay window**: Requires constant repositioning and can be blocked

---

## 11. Code Flow Diagram

```
App Launch
    ↓
MewAppDelegate.applicationDidFinishLaunching()
    ↓
NotchManager.refreshNotches()
    ↓
For each NSScreen:
    ├─→ Check if should show notch
    ├─→ Create MewPanel (if needed)
    ├─→ Set frame to screen.frame (full screen)
    ├─→ Create NotchView wrapped in NSHostingView
    ├─→ Set contentView
    ├─→ orderFrontRegardless()
    └─→ Add to NotchSpaceManager.shared.notchSpace
         ↓
         CGSAddWindowsToSpaces() [Private API]
```

---

## 12. File Structure Reference

```
MewNotch/
├── MewNotchApp.swift          # App entry point
├── MewAppDelegate.swift        # App lifecycle, initializes NotchManager
├── View/
│   ├── Common/
│   │   └── MewWindow.swift     # MewPanel class definition
│   └── Notch/
│       └── NotchView.swift     # Main notch content view
├── Utils/
│   ├── NotchManager.swift      # Window creation and management
│   ├── NotchSpaceManager.swift # CGS space management
│   ├── NotchUtils.swift        # Notch detection utilities
│   └── Managers/
│       └── WindowManager.swift # SkyLight space management
└── ViewModel/
    └── Notch/
        └── NotchViewModel.swift # Notch state management
```

---

## Conclusion

MewNotch achieves notch display by:

1. Creating a **full-screen transparent window** at `.mainMenu + 1` level
2. Using **SwiftUI layout** to center content horizontally
3. **Detecting notch dimensions** using NSScreen APIs
4. **Masking content** to notch shape with rounded corners
5. **Managing window spaces** using private CGS/SkyLight APIs to ensure visibility

This approach is elegant but relies on private APIs, making it unsuitable for App Store distribution. The implementation demonstrates deep understanding of macOS window management and creative use of system capabilities.

