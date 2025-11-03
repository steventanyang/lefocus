# System Design: Phase 1 New - True Dynamic Island UX

## Overview

Phase 1 introduces an **Apple-style Dynamic Island interface** that integrates with the MacBook Pro notch area. The island provides persistent, always-visible session feedback that stays on top of all applications, including fullscreen apps.

**Key Features:**
- **Notch-integrated UI**: Splits around the notch (timer on left, waveform on right)
- **Persistent overlay**: Always visible across all apps and workspaces
- **Hover-to-expand**: Smooth animation reveals controls when hovering
- **MacBook Pro exclusive**: Only appears on Macs with a notch

---

## Goals

1. **Ambient Awareness**: Provide constant, non-intrusive timer visibility
2. **Quick Controls**: Access stop/settings without switching apps
3. **Native Feel**: Match macOS Dynamic Island design language
4. **Zero Distraction**: Minimal footprint when collapsed

---

## Visual Design

### Collapsed State (Split Around Notch)

```
        ┌─────────────┐ NOTCH ┌─────────────┐
        │  ⚫ 24:35    │ ████  │  ▁▃▂▅▃▁▄▂   │
        └─────────────┘ ████  └─────────────┘
           80px wide    AREA     80px wide
           38px tall             38px tall
```

**Left Side (80x38px):**
- Timer display: "MM:SS" format
- White text, 14px font
- Semi-transparent dark background
- Rounded corners (left side)

**Right Side (80x38px):**
- Decorative waveform (8 bars)
- Blue gradient bars
- Animated independently
- Rounded corners (right side)

**Gap:**
- Natural notch area separates the two sides
- No rendering in notch exclusion zone

---

### Expanded State (Hover)

```
┌───────────────────────────────────────────────────────┐
│  ╭─────────────────────────────────────────────────╮  │
│  │                                              ⚙️  │  │
│  │                   24:35                         │  │
│  │              Focus Session                      │  │
│  │                                                 │  │
│  │     🎵 ▁▃▂▅▃▁▄▂▃▁▅▂▄▁▃▂▅▃▁▄▂ 🎵              │  │
│  │                                                 │  │
│  │          [  Stop Session  ]                     │  │
│  ╰─────────────────────────────────────────────────╯  │
└───────────────────────────────────────────────────────┘
                    320px width × 140px height
```

**Expansion Animation:**
- Left and right sides **merge together** and **expand downward**
- Forms a single rounded rectangle that covers the notch area
- 300ms smooth ease-in-out transition
- Maintains position at top-center

**Content:**
- Settings icon (⚙️): Top-right corner
- Timer: Large 32px font, centered
- Session label: "Focus Session" or "00:00" when idle
- Waveform: Full-width, 24 bars
- Stop button: Red-themed, centered at bottom

---

## Technical Architecture

### Window Management Strategy

**Challenge:** Tauri's standard window APIs cannot:
1. Position windows inside the notch exclusion zone
2. Set window levels high enough to appear over fullscreen apps
3. Handle notch geometry and safe area insets

**Solution:** Swift-based window management with FFI bridge

```
┌─────────────────────────────────────────────────────┐
│  React Frontend (Island UI Components)              │
└─────────────────────────────────────────────────────┘
                    ↕ Tauri Events
┌─────────────────────────────────────────────────────┐
│  Rust Backend (Timer, State Management)             │
│  ├─ Calls Swift FFI for window operations           │
│  └─ Emits timer-state-changed events                │
└─────────────────────────────────────────────────────┘
                    ↕ FFI Bridge
┌─────────────────────────────────────────────────────┐
│  Swift Plugin (IslandWindowManager)                 │
│  ├─ Creates NSWindow at notch-level                 │
│  ├─ Positions left (80px) and right (80px) sides    │
│  ├─ Handles expansion animation (merges to 320px)   │
│  ├─ Sets window level = .popUpMenu + 1              │
│  └─ Detects notch presence on startup               │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Swift Window Manager

**File:** `src-tauri/plugins/macos-sensing/Sources/MacOSSensing/IslandWindowManager.swift`

**Responsibilities:**
1. **Detect notch presence** - Check if running on MacBook Pro 14"/16" (2021+)
2. **Create two windows** - Left side (timer) and right side (waveform)
3. **Position around notch** - Calculate notch bounds and place windows adjacent
4. **Handle expansion** - Merge windows into single expanded view on hover
5. **Window level management** - Set level to appear above fullscreen apps

**Key APIs:**
- `NSScreen.safeAreaInsets` - Detect notch bounds
- `NSWindow.level = .popUpMenu + 1` - Float above fullscreen
- `NSWindow.collectionBehavior = .canJoinAllSpaces` - Visible on all desktops
- `NSAnimationContext` - Smooth window resize animations

**FFI Functions:**
```swift
@_cdecl("island_create_windows")
public func createIslandWindows() -> Int32

@_cdecl("island_set_state")
public func setIslandState(state: Int32) -> Int32  // 0 = collapsed, 1 = expanded

@_cdecl("island_update_timer")
public func updateIslandTimer(minutes: Int32, seconds: Int32)

@_cdecl("island_destroy_windows")
public func destroyIslandWindows()

@_cdecl("island_set_visible")
public func setIslandVisible(visible: Bool)

@_cdecl("island_has_notch")
public func hasNotch() -> Bool
```

---

### 2. Rust Integration

**File:** `src-tauri/src/window/island.rs`

**Updated Architecture:**
```rust
use libloading::{Library, Symbol};
use std::sync::Arc;

pub struct IslandWindowManager {
    lib: Arc<Library>,
    has_notch: bool,
}

impl IslandWindowManager {
    fn new(lib: Arc<Library>) -> Self {
        let has_notch = unsafe {
            let check_fn: Symbol<unsafe extern "C" fn() -> bool> =
                lib.get(b"island_has_notch").unwrap();
            check_fn()
        };

        Self { lib, has_notch }
    }

    pub fn has_notch(&self) -> bool {
        self.has_notch
    }

    pub fn create_windows(&self) -> Result<(), String> {
        if !self.has_notch {
            log::warn!("No notch detected, island will not be created");
            return Ok(());
        }

        unsafe {
            let create_fn: Symbol<unsafe extern "C" fn() -> i32> =
                self.lib.get(b"island_create_windows")
                    .map_err(|e| e.to_string())?;

            let result = create_fn();
            if result != 0 {
                return Err(format!("Failed to create island windows: {}", result));
            }
        }
        Ok(())
    }

    pub fn set_state(&self, expanded: bool) -> Result<(), String> {
        if !self.has_notch {
            return Ok(());
        }

        unsafe {
            let set_fn: Symbol<unsafe extern "C" fn(i32) -> i32> =
                self.lib.get(b"island_set_state")
                    .map_err(|e| e.to_string())?;

            let state = if expanded { 1 } else { 0 };
            let result = set_fn(state);

            if result != 0 {
                return Err(format!("Failed to set island state: {}", result));
            }
        }
        Ok(())
    }

    pub fn update_timer(&self, minutes: i32, seconds: i32) {
        if !self.has_notch {
            return;
        }

        unsafe {
            let update_fn: Symbol<unsafe extern "C" fn(i32, i32)> =
                self.lib.get(b"island_update_timer").unwrap();
            update_fn(minutes, seconds);
        }
    }

    pub fn set_visible(&self, visible: bool) {
        if !self.has_notch {
            return;
        }

        unsafe {
            let set_fn: Symbol<unsafe extern "C" fn(bool)> =
                self.lib.get(b"island_set_visible").unwrap();
            set_fn(visible);
        }
    }
}

// MARK: - Module-level Functions

/// Initialize island manager (factory function)
pub fn init() -> Result<Arc<IslandWindowManager>, String> {
    // Load Swift plugin library
    let lib_path = get_plugin_library_path()
        .map_err(|e| format!("Failed to locate plugin library: {}", e))?;

    let lib = Arc::new(unsafe {
        Library::new(&lib_path)
            .map_err(|e| format!("Failed to load plugin library: {}", e))?
    });

    let manager = IslandWindowManager::new(lib);

    if !manager.has_notch() {
        return Err("No notch detected on this Mac".to_string());
    }

    Ok(Arc::new(manager))
}

fn get_plugin_library_path() -> Result<std::path::PathBuf, std::io::Error> {
    #[cfg(target_os = "macos")]
    {
        // Development path
        let dev_path = std::path::PathBuf::from("src-tauri/plugins/macos-sensing/.build/release/libMacOSSensing.dylib");
        if dev_path.exists() {
            return Ok(dev_path);
        }

        // Production path (in bundle Resources)
        let prod_path = std::path::PathBuf::from("libMacOSSensing.dylib");
        if prod_path.exists() {
            return Ok(prod_path);
        }

        Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Plugin library not found"
        ))
    }

    #[cfg(not(target_os = "macos"))]
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "Island feature only supported on macOS"
    ))
}

/// Toggle island visibility command
#[tauri::command]
pub fn toggle_island_visibility(
    visible: bool,
    state: State<crate::AppState>
) -> Result<(), String> {
    if let Some(manager) = &state.island_manager {
        manager.set_visible(visible);
        Ok(())
    } else {
        Err("Island not available (no notch detected)".to_string())
    }
}
```

**Event Handling:**
```rust
pub fn sync_island_with_timer(app: &AppHandle, island_manager: Arc<IslandWindowManager>) {
    // Listen to timer-state-changed for state transitions (start/stop/cancel)
    {
        let manager = island_manager.clone();
        app.listen("timer-state-changed", move |event| {
            let payload_str = event.payload();
            match serde_json::from_str::<TimerStateChangedPayload>(payload_str) {
                Ok(payload) => {
                    // Handle state transitions
                    if !matches!(payload.state.status, TimerStatus::Running) {
                        // Timer stopped/cancelled - reset to collapsed state
                        manager.set_state(false).ok();
                    }

                    // Update display immediately on state change
                    let total_seconds = payload.remaining_ms / 1000;
                    let minutes = (total_seconds / 60) as i32;
                    let seconds = (total_seconds % 60) as i32;
                    manager.update_timer(minutes, seconds);
                }
                Err(err) => {
                    log::error!("Failed to parse timer-state-changed payload: {err}");
                }
            }
        });
    }

    // Listen to timer-heartbeat for 1-second updates
    {
        let manager = island_manager.clone();
        app.listen("timer-heartbeat", move |event| {
            let payload_str = event.payload();
            match serde_json::from_str::<TimerStateChangedPayload>(payload_str) {
                Ok(payload) => {
                    // Update timer display every second
                    let total_seconds = payload.remaining_ms / 1000;
                    let minutes = (total_seconds / 60) as i32;
                    let seconds = (total_seconds % 60) as i32;
                    manager.update_timer(minutes, seconds);
                }
                Err(err) => {
                    log::error!("Failed to parse timer-heartbeat payload: {err}");
                }
            }
        });
    }
}
```

---

### 3. Frontend Components

**File Structure:**
```
src/components/DynamicIsland/
├── IslandContainer.tsx       (Root component, manages state)
├── IslandLeft.tsx            (Timer display - left side)
├── IslandRight.tsx           (Waveform - right side)
├── IslandExpanded.tsx        (Full expanded view)
└── DecorativeWaveform.tsx    (Reusable waveform component)
```

**Key Change:** Frontend now **only renders content**, not the window itself.

The Swift plugin creates the actual NSWindow containers and embeds webviews. React components render inside those webviews.

**Example - IslandLeft.tsx:**
```tsx
interface Props {
  remainingMs: number;
}

export function IslandLeft({ remainingMs }: Props) {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-center h-full px-3">
      <div className="text-white text-sm font-medium tabular-nums">
        {formatTime(remainingMs)}
      </div>
    </div>
  );
}
```

---

### 4. Hover Detection & FFI Callback Bridge

**Challenge:** Detect hover across **two separate windows** (left and right) and notify Rust via FFI

**Solution:** Complete bidirectional FFI bridge (Swift ↔ C ↔ Rust ↔ Tauri)

---

#### 4.1 Swift → C Bridge

**C Header** (`src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/include/IslandBridge.h`):
```c
#pragma once
#include <stdbool.h>

// Callback type for hover state changes
typedef void (*IslandHoverCallback)(bool is_hovering);

// Register callback from Rust
void island_register_hover_callback(IslandHoverCallback callback);

// Swift calls this when hover state changes
void island_notify_hover_state(bool is_hovering);
```

**C Implementation** (`src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/IslandBridge.c`):
```c
#include "IslandBridge.h"
#include <stddef.h>

static IslandHoverCallback hover_callback = NULL;

void island_register_hover_callback(IslandHoverCallback callback) {
    hover_callback = callback;
}

void island_notify_hover_state(bool is_hovering) {
    if (hover_callback != NULL) {
        hover_callback(is_hovering);
    }
}
```

---

#### 4.2 Swift Window Tracking

**Swift Implementation** (`src-tauri/plugins/macos-sensing/Sources/MacOSSensing/IslandWindowManager.swift`):
```swift
import Cocoa

// Import C bridge
import CMacOSSensing

class IslandWindow: NSWindow {
    override func awakeFromNib() {
        super.awakeFromNib()

        let trackingArea = NSTrackingArea(
            rect: self.bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        self.contentView?.addTrackingArea(trackingArea)
    }

    override func mouseEntered(with event: NSEvent) {
        // Call C bridge function
        island_notify_hover_state(true)
    }

    override func mouseExited(with event: NSEvent) {
        // Collapse after 200ms delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            island_notify_hover_state(false)
        }
    }
}
```

---

#### 4.3 Rust FFI Layer

**App Handle Storage** (`src-tauri/src/window/island/ffi.rs`):
```rust
use std::sync::{Arc, Mutex, Weak};
use tauri::AppHandle;
use once_cell::sync::Lazy;

// Thread-safe weak reference to app handle
static APP_HANDLE: Lazy<Mutex<Weak<AppHandle>>> = Lazy::new(|| Mutex::new(Weak::new()));

/// Initialize the app handle storage (called once during setup)
pub fn init(app_handle: &AppHandle) {
    let mut handle = APP_HANDLE.lock().unwrap();
    *handle = Arc::downgrade(&Arc::new(app_handle.clone()));
}

/// C callback type matching IslandBridge.h
type IslandHoverCallback = extern "C" fn(bool);

/// External C functions from Swift plugin
extern "C" {
    fn island_register_hover_callback(callback: IslandHoverCallback);
}

/// Register our Rust callback with the Swift plugin
pub fn setup_hover_callback() {
    unsafe {
        island_register_hover_callback(on_hover_changed);
    }
}

/// Rust callback invoked by Swift when hover state changes
extern "C" fn on_hover_changed(is_hovering: bool) {
    let handle_weak = APP_HANDLE.lock().unwrap().clone();

    if let Some(handle) = handle_weak.upgrade() {
        // Emit Tauri event to frontend
        if let Err(e) = handle.emit("island-hover-changed", is_hovering) {
            log::error!("Failed to emit island-hover-changed event: {e}");
        }
    } else {
        log::warn!("App handle is no longer valid, cannot emit hover event");
    }
}
```

---

#### 4.4 Integration in Main App

**Initialization** (`src-tauri/src/lib.rs`):
```rust
mod window;

use window::island::{self, IslandWindowManager};
use std::sync::Arc;

pub(crate) struct AppState {
    audio: AudioEngineHandle,
    pub(crate) db: Database,
    pub(crate) timer: TimerController,
    pub(crate) island_manager: Option<Arc<IslandWindowManager>>,  // New field
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    log::info!("LeFocus starting up...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let result = (|| -> anyhow::Result<()> {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|err| anyhow::anyhow!(err))?;
                std::fs::create_dir_all(&app_data_dir)?;

                let db_path = app_data_dir.join("lefocus.sqlite3");
                let database = Database::new(db_path)?;

                // ... existing session recovery code ...

                let timer_controller = TimerController::new(app.handle().clone(), database.clone());

                // Initialize FFI app handle storage for hover callbacks
                island::ffi::init(&app.handle());

                // Initialize island manager
                let island_manager = match island::init() {
                    Ok(manager) => {
                        log::info!("Island manager initialized successfully");

                        // Create windows
                        if let Err(e) = manager.create_windows() {
                            log::error!("Failed to create island windows: {e}");
                            None
                        } else {
                            // Register hover callback
                            island::ffi::setup_hover_callback();

                            // Sync timer state
                            island::sync_island_with_timer(&app.handle(), manager.clone());

                            Some(manager)
                        }
                    }
                    Err(e) => {
                        log::warn!("Island not available: {e}");
                        None
                    }
                };

                app.manage(AppState {
                    audio: AudioEngineHandle::new(),
                    db: database,
                    timer: timer_controller,
                    island_manager,
                });

                Ok(())
            })();

            result.map_err(|err| err.into())
        })
        .invoke_handler(tauri::generate_handler![
            // ... existing commands ...
            island::toggle_island_visibility,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

#### 4.5 Frontend Listener

**React Hook** (`src/hooks/useIslandHover.ts`):
```tsx
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export function useIslandHover() {
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const unlistenPromise = listen<boolean>("island-hover-changed", (event) => {
      setIsHovering(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return isHovering;
}
```

**Usage in Component:**
```tsx
export function DynamicIsland() {
  const isHovering = useIslandHover();
  const isExpanded = isHovering; // Could add debouncing here if needed

  return (
    <div className={isExpanded ? "expanded" : "collapsed"}>
      {/* ... island content ... */}
    </div>
  );
}
```

---

#### 4.6 Flow Summary

```
[Swift] IslandWindow.mouseEntered()
    ↓
[Swift] island_notify_hover_state(true)  ← calls C function
    ↓
[C] island_notify_hover_state() ← C shim
    ↓
[C] hover_callback(true) ← stored Rust function pointer
    ↓
[Rust] on_hover_changed(true) ← extern "C" fn
    ↓
[Rust] APP_HANDLE.upgrade() → emit("island-hover-changed")
    ↓
[Tauri] Event system broadcasts to all windows
    ↓
[React] listen() receives event → setIsHovering(true)
    ↓
[React] Component re-renders with expanded state
```

This complete bridge ensures:
- ✅ **Type safety** - No undefined functions
- ✅ **Memory safety** - Weak references prevent dangling pointers
- ✅ **Thread safety** - Mutex protects shared state
- ✅ **Initialization order** - App handle stored before callbacks registered
- ✅ **Error handling** - Graceful degradation if app handle is gone

---

## Window Positioning Details

### Notch Detection

**Challenge:** Notch dimensions vary by model and display scaling:
- **MacBook Pro 14"** (2021+): ~200px notch width at native resolution
- **MacBook Pro 16"** (2021+): ~220px notch width at native resolution
- Display scaling changes effective pixel dimensions

**Solution:** Derive notch bounds from screen geometry and safe area insets

```swift
func detectNotchBounds() -> NSRect? {
    guard let screen = NSScreen.main else { return nil }

    let safeArea = screen.safeAreaInsets
    let screenFrame = screen.frame

    // If top inset > 0, there's a notch
    guard safeArea.top > 0 else {
        return nil
    }

    let notchHeight = safeArea.top

    // Method 1: Query menu bar thickness area (most accurate)
    // The notch creates a "thick" menu bar area
    let menuBarHeight = NSStatusBar.system.thickness
    let notchBottomY = screenFrame.height - menuBarHeight

    // Method 2: Derive width from safe area geometry
    // The notch is centered horizontally
    // We can infer its width by checking when safe area starts/ends
    // However, NSScreen.safeAreaInsets only gives us top/bottom/left/right totals,
    // not the actual notch cutout shape.

    // Fallback: Use heuristic based on screen size
    // MacBook Pro 14" native: 3024x1964 → notch ~200pt
    // MacBook Pro 16" native: 3456x2234 → notch ~220pt
    // Scale proportionally
    let baseNotchWidth: CGFloat = 200.0
    let baseScreenWidth: CGFloat = 3024.0
    let scaleFactor = screenFrame.width / baseScreenWidth
    let estimatedNotchWidth = baseNotchWidth * scaleFactor

    // Clamp to reasonable bounds (180-250pt range)
    let notchWidth = max(180, min(250, estimatedNotchWidth))

    // Center the notch horizontally
    let notchX = (screenFrame.width - notchWidth) / 2
    let notchY = screenFrame.height - notchHeight

    let notchBounds = NSRect(
        x: notchX,
        y: notchY,
        width: notchWidth,
        height: notchHeight
    )

    // Log for debugging/calibration
    NSLog("Detected notch: width=%.1f, height=%.1f, screen=%.0fx%.0f, scale=%.2f",
          notchWidth, notchHeight, screenFrame.width, screenFrame.height, scaleFactor)

    return notchBounds
}

// Optional: Per-model calibration table (more accurate)
func getNotchWidthForModel() -> CGFloat? {
    guard let screen = NSScreen.main else { return nil }

    let screenWidth = Int(screen.frame.width)
    let screenHeight = Int(screen.frame.height)

    // Known native resolutions and their notch widths (measured)
    let calibrationTable: [String: CGFloat] = [
        "3024x1964": 200.0,  // MacBook Pro 14" (2021) native
        "3456x2234": 220.0,  // MacBook Pro 16" (2021) native
        "1512x982": 100.0,   // MacBook Pro 14" scaled (50%)
        "1728x1117": 110.0,  // MacBook Pro 16" scaled (50%)
    ]

    let key = "\(screenWidth)x\(screenHeight)"
    return calibrationTable[key]
}
```

**Recommended Approach:**
1. Try per-model calibration table first (if available)
2. Fall back to proportional scaling heuristic
3. Add 10-20px padding on each side to ensure no overlap
4. Log detected values for user bug reports

**Why not use menu bar item spacing?**
- Menu bar items shift dynamically based on notch
- NSMenuExtra doesn't expose notch boundaries directly
- Safe area insets only give totals, not cutout shape

### Window Placement

```swift
func positionIslandWindows(notchBounds: NSRect, screenFrame: NSRect) {
    let windowHeight: CGFloat = 38
    let windowWidth: CGFloat = 80
    let gap: CGFloat = 10  // Space between window and notch

    // Left window (timer)
    let leftX = notchBounds.minX - windowWidth - gap
    let leftY = screenFrame.height - windowHeight - 5  // 5px from top
    leftWindow.setFrame(NSRect(x: leftX, y: leftY, width: windowWidth, height: windowHeight), display: true)

    // Right window (waveform)
    let rightX = notchBounds.maxX + gap
    let rightY = screenFrame.height - windowHeight - 5
    rightWindow.setFrame(NSRect(x: rightX, y: rightY, width: windowWidth, height: windowHeight), display: true)
}
```

### Expansion Animation

```swift
func expandIsland() {
    let expandedWidth: CGFloat = 320
    let expandedHeight: CGFloat = 140

    guard let screen = NSScreen.main else { return }
    let screenFrame = screen.frame

    // Center the expanded window
    let centerX = (screenFrame.width - expandedWidth) / 2
    let topY = screenFrame.height - expandedHeight - 5

    NSAnimationContext.runAnimationGroup({ context in
        context.duration = 0.3
        context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        // Hide split windows
        leftWindow.animator().alphaValue = 0
        rightWindow.animator().alphaValue = 0

        // Show and position expanded window
        expandedWindow.setFrame(NSRect(x: centerX, y: topY, width: expandedWidth, height: expandedHeight), display: true, animate: true)
        expandedWindow.animator().alphaValue = 1
    })
}

func collapseIsland() {
    NSAnimationContext.runAnimationGroup({ context in
        context.duration = 0.3
        context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

        // Hide expanded window
        expandedWindow.animator().alphaValue = 0

        // Show split windows
        leftWindow.animator().alphaValue = 1
        rightWindow.animator().alphaValue = 1
    })
}
```

---

## Always-On-Top Configuration

### Window Level Hierarchy

```swift
// Window levels in macOS (low to high):
// - .normal (0)              → Regular app windows
// - .floating (3)            → Utility windows
// - .modalPanel (8)          → Modal dialogs
// - .popUpMenu (101)         → Popup menus
// - .screenSaver (1000)      → Screen savers
// - .statusBar (2147483631)  → Menu bar items

// Island windows need to be above fullscreen apps but below screen savers
let islandWindowLevel: NSWindow.Level = .popUpMenu + 1  // Level 102
```

### Collection Behavior

```swift
leftWindow.collectionBehavior = [
    .canJoinAllSpaces,           // Visible on all desktops/spaces
    .fullScreenAuxiliary,        // Stay visible in fullscreen
    .ignoresCycle,               // Don't appear in Cmd+Tab
    .stationary                  // Don't move when desktop changes
]

leftWindow.level = islandWindowLevel
leftWindow.isOpaque = false
leftWindow.backgroundColor = .clear
leftWindow.hasShadow = true
leftWindow.styleMask = .borderless
```

---

## User Settings Integration

### Toggle Visibility Command

**Frontend (Settings UI):**
```tsx
// In main app settings view
const [islandVisible, setIslandVisible] = useState(true);

const toggleIslandVisibility = async () => {
  try {
    await invoke("toggle_island_visibility", { visible: !islandVisible });
    setIslandVisible(!islandVisible);
  } catch (error) {
    console.error("Failed to toggle island:", error);
  }
};

return (
  <div>
    <label>
      <input
        type="checkbox"
        checked={islandVisible}
        onChange={toggleIslandVisibility}
      />
      Show Dynamic Island
    </label>
  </div>
);
```

**Backend Command:**
```rust
#[tauri::command]
pub fn toggle_island_visibility(
    visible: bool,
    state: State<AppState>
) -> Result<(), String> {
    state.island_manager.set_visible(visible);

    // Persist setting to config
    let config_path = get_config_path()?;
    let mut config = load_config(&config_path)?;
    config.island_visible = visible;
    save_config(&config_path, &config)?;

    Ok(())
}
```

---

## Styling Specifications

### Colors & Effects

```css
/* Collapsed state background */
background: rgba(28, 28, 30, 0.85);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);

/* Expanded state background */
background: rgba(28, 28, 30, 0.90);
backdrop-filter: blur(30px);

/* Timer text */
color: #FFFFFF;
font-size: 14px;
font-weight: 500;

/* Waveform bars */
background: linear-gradient(180deg, #3B82F6 0%, #1D4ED8 100%);
width: 3px;
border-radius: 1px;

/* Stop button */
background: rgba(239, 68, 68, 0.1);
border: 1px solid rgba(239, 68, 68, 0.3);
color: #EF4444;

/* Stop button hover */
background: rgba(239, 68, 68, 0.2);
border-color: rgba(239, 68, 68, 0.5);
```

### Shadows

```css
/* Collapsed windows */
box-shadow:
  0 4px 12px rgba(0, 0, 0, 0.3),
  0 0 1px rgba(255, 255, 255, 0.1) inset;

/* Expanded window */
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.4),
  0 0 1px rgba(255, 255, 255, 0.15) inset;
```

---

## Edge Cases & Error Handling

### 1. No Notch Detected
```rust
if !island_manager.has_notch {
    log::info!("Mac does not have a notch, island feature disabled");
    return Ok(());
}
```

### 2. Multi-Monitor Setup
- Island only appears on **primary display**
- If user drags window to secondary monitor, island stays on primary
- Future: Follow active monitor

### 3. Screen Resolution Changes
```swift
NotificationCenter.default.addObserver(
    forName: NSApplication.didChangeScreenParametersNotification,
    object: nil,
    queue: .main
) { _ in
    repositionIslandWindows()
}
```

### 4. Permissions
- Requires **Screen Recording** permission (already granted for Phase 0)
- Island windows don't require additional permissions

### 5. macOS Versions
- **macOS 12.0+** required (NSScreen.safeAreaInsets)
- Graceful degradation on older versions (no island)

---

## Performance Considerations

### CPU Usage
- **Target:** <1% CPU when collapsed, <2% when expanded
- Waveform animations run at 30fps (sufficient for smooth motion)
- Use Core Animation for window transitions (GPU-accelerated)

### Memory
- **Target:** <30MB for island windows
- Each window has minimal DOM (< 50 elements)
- Reuse waveform bars instead of recreating

### Battery Impact
- Minimal - static rendering when collapsed
- Animations pause when battery < 20% (future enhancement)

---

## Testing Strategy

### Manual Testing Checklist

**Notch Detection:**
- [ ] Island appears on MacBook Pro 14"/16" (2021+)
- [ ] Island does NOT appear on Macs without notch
- [ ] Correct positioning on left/right of notch

**Hover Interaction:**
- [ ] Hovering over left side triggers expansion
- [ ] Hovering over right side triggers expansion
- [ ] Expanded view appears smoothly (300ms)
- [ ] Mouse leaving collapses after 200ms delay
- [ ] No flickering during rapid hover on/off

**Always-On-Top:**
- [ ] Visible when Chrome is fullscreen
- [ ] Visible when Slack is fullscreen
- [ ] Visible when watching fullscreen video
- [ ] Visible across all macOS Spaces/Desktops
- [ ] Does NOT appear in Cmd+Tab switcher

**Timer Updates:**
- [ ] Timer updates every second
- [ ] Shows 00:00 when no timer running
- [ ] Stop button ends session correctly

**Settings:**
- [ ] Toggle visibility checkbox works
- [ ] Island hides immediately when disabled
- [ ] Island reappears when re-enabled
- [ ] Setting persists across app restarts

**Multi-Monitor:**
- [ ] Island stays on primary monitor
- [ ] Moving app to secondary monitor doesn't move island

**Screen Changes:**
- [ ] Island repositions on resolution change
- [ ] Island repositions on monitor disconnect

---

## Development Phases

### Phase 5.1: Swift Window Manager (Week 1)
- [ ] Implement notch detection
- [ ] Create split window system (left + right)
- [ ] Position windows adjacent to notch
- [ ] Set window levels for always-on-top
- [ ] Create FFI bridge functions

### Phase 5.2: Expansion Animation (Week 1)
- [ ] Implement hover tracking with NSTrackingArea
- [ ] Create expanded window
- [ ] Smooth merge animation (split → expanded)
- [ ] Smooth collapse animation (expanded → split)
- [ ] Test animation performance

### Phase 5.3: Rust Integration (Week 2)
- [ ] Create IslandWindowManager wrapper
- [ ] Wire up timer-state-changed events
- [ ] Update timer display via FFI
- [ ] Implement visibility toggle command
- [ ] Add settings persistence

### Phase 5.4: Frontend Components (Week 2)
- [ ] Build IslandLeft (timer)
- [ ] Build IslandRight (waveform)
- [ ] Build IslandExpanded (full controls)
- [ ] Add settings UI toggle
- [ ] Polish animations and styling

### Phase 5.5: Testing & Polish (Week 3)
- [ ] Multi-monitor testing
- [ ] Fullscreen app testing
- [ ] Performance profiling
- [ ] Edge case handling
- [ ] Documentation

---

## Success Metrics

**Functional:**
- ✅ Island appears on Macs with notch
- ✅ Splits correctly around notch (80px each side)
- ✅ Expands on hover to 320x140px
- ✅ Stays visible over fullscreen apps
- ✅ Timer updates in real-time
- ✅ Settings toggle works
- ✅ No crashes or memory leaks

**Performance:**
- ✅ <1% CPU when idle
- ✅ <30MB memory footprint
- ✅ 60fps animations
- ✅ <50ms hover response time

**UX:**
- ✅ Feels like native macOS Dynamic Island
- ✅ Non-intrusive and ambient
- ✅ Smooth, polished animations
- ✅ Quick access to controls

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notch detection fails on some models | High | Test on all MBP 14"/16" variants, add manual override |
| Window doesn't stay above fullscreen | Critical | Use highest safe window level, test all fullscreen modes |
| Animation lag/jank | Medium | Use Core Animation, reduce bar count if needed |
| Swift FFI complexity | Medium | Start with minimal FFI surface, add functions incrementally |
| Permission issues | Low | Reuse existing Screen Recording permission |

---

## Open Questions

1. **Click-to-expand:** Should clicking also expand (in addition to hover)?
   - **Proposed:** Hover only for now, consider click for Phase 2

2. **Drag-to-reposition:** Should users be able to drag the island?
   - **Proposed:** Fixed position for now, may add dragging later

3. **Fullscreen priority:** If user toggles "Hide Island", should it stay hidden in fullscreen?
   - **Proposed:** Yes, user preference overrides all

4. **Notch gap size:** Is 10px gap between window and notch sufficient?
   - **Proposed:** Start with 10px, adjust based on visual testing

---

## Summary

Phase 1 New delivers a **true macOS Dynamic Island experience** for LeFocus:

- **Notch-integrated split design** (timer left, waveform right)
- **Swift-powered window management** for proper notch positioning
- **Always-on-top overlay** visible across all apps and workspaces
- **Smooth hover-to-expand** animation revealing full controls
- **MacBook Pro exclusive** feature with graceful fallback

This sets the foundation for a premium, native-feeling UX that keeps users in flow while maintaining ambient awareness of their focus sessions.
