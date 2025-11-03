# LeFocus P1 - Phase 5 (Part 1/3): Dynamic Island Foundation

**Goal**: Build the Swift-based window management system and notch detection to create split island windows that position around the MacBook Pro notch.

**Timeline**: Week 1-2 (10-14 days)

**Success Criteria**:
- ✅ Notch detection works on MacBook Pro 14"/16" (2021+)
- ✅ Two NSWindows created: left (80x38px) and right (80x38px)
- ✅ Windows positioned correctly on either side of notch
- ✅ Windows stay on top of fullscreen apps
- ✅ FFI bridge allows Rust to control window visibility
- ✅ No island appears on Macs without notch

---

## Overview

Phase 5 Part 1 focuses on **getting the windows in the right place** with the right properties. This is the foundation for the entire Dynamic Island feature.

**What We're Building:**
- Swift `IslandWindowManager` class
- Notch geometry detection
- Two frameless NSWindows positioned around notch
- Basic FFI bridge (create, destroy, show, hide)
- Rust wrapper calling Swift via FFI

**What We're NOT Building Yet:**
- ❌ Hover detection (Phase 6)
- ❌ Expansion animation (Phase 6)
- ❌ Timer display in windows (Phase 7)
- ❌ Waveform visualization (Phase 7)

This phase is purely about **window positioning and always-on-top behavior**.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Rust Backend (lib.rs)                      │
│  └─ Calls Swift FFI on startup              │
└─────────────────────────────────────────────┘
              ↓ FFI
┌─────────────────────────────────────────────┐
│  Swift Plugin (IslandWindowManager)         │
│  ├─ Detects notch via NSScreen.safeArea    │
│  ├─ Creates leftWindow (80x38)              │
│  ├─ Creates rightWindow (80x38)             │
│  ├─ Positions windows around notch          │
│  └─ Sets window level = .popUpMenu + 1      │
└─────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Swift IslandWindowManager

**File**: `src-tauri/plugins/macos-sensing/Sources/MacOSSensing/IslandWindowManager.swift`

**Core Responsibilities:**
1. Detect if Mac has a notch
2. Calculate notch bounds
3. Create two NSWindows with proper configuration
4. Position windows on either side of notch
5. Handle window lifecycle (show, hide, destroy)

**Implementation:**

```swift
import Cocoa
import Foundation

@available(macOS 12.0, *)
public class IslandWindowManager {
    private var leftWindow: NSWindow?
    private var rightWindow: NSWindow?
    private var notchBounds: NSRect?
    private let hasNotch: Bool

    public init() {
        // Detect notch on initialization
        self.hasNotch = Self.detectNotch()
        if hasNotch {
            self.notchBounds = Self.calculateNotchBounds()
        }
    }

    // MARK: - Notch Detection

    private static func detectNotch() -> Bool {
        guard let screen = NSScreen.main else { return false }
        let safeArea = screen.safeAreaInsets
        return safeArea.top > 0
    }

    private static func calculateNotchBounds() -> NSRect? {
        guard let screen = NSScreen.main else { return nil }

        let safeArea = screen.safeAreaInsets
        let screenFrame = screen.frame

        guard safeArea.top > 0 else { return nil }

        let notchHeight = safeArea.top

        // Try calibration table first
        if let calibratedWidth = getNotchWidthForResolution(screenFrame: screenFrame) {
            let notchX = (screenFrame.width - calibratedWidth) / 2
            let notchY = screenFrame.height - notchHeight
            return NSRect(x: notchX, y: notchY, width: calibratedWidth, height: notchHeight)
        }

        // Fallback: Proportional scaling
        let baseNotchWidth: CGFloat = 200.0
        let baseScreenWidth: CGFloat = 3024.0
        let scaleFactor = screenFrame.width / baseScreenWidth
        let estimatedWidth = baseNotchWidth * scaleFactor
        let notchWidth = max(180, min(250, estimatedWidth))

        let notchX = (screenFrame.width - notchWidth) / 2
        let notchY = screenFrame.height - notchHeight

        let bounds = NSRect(x: notchX, y: notchY, width: notchWidth, height: notchHeight)

        NSLog("[Island] Detected notch: width=%.1f, height=%.1f, screen=%.0fx%.0f",
              notchWidth, notchHeight, screenFrame.width, screenFrame.height)

        return bounds
    }

    private static func getNotchWidthForResolution(screenFrame: NSRect) -> CGFloat? {
        let width = Int(screenFrame.width)
        let height = Int(screenFrame.height)

        let calibrationTable: [String: CGFloat] = [
            "3024x1964": 200.0,   // MacBook Pro 14" native
            "3456x2234": 220.0,   // MacBook Pro 16" native
            "1512x982": 100.0,    // MacBook Pro 14" scaled 50%
            "1728x1117": 110.0,   // MacBook Pro 16" scaled 50%
        ]

        let key = "\(width)x\(height)"
        return calibrationTable[key]
    }

    // MARK: - Window Creation

    public func createWindows() -> Bool {
        guard hasNotch, let notchBounds = notchBounds else {
            NSLog("[Island] No notch detected, skipping window creation")
            return false
        }

        guard let screen = NSScreen.main else {
            NSLog("[Island] No main screen found")
            return false
        }

        let screenFrame = screen.frame

        // Window dimensions
        let windowWidth: CGFloat = 80
        let windowHeight: CGFloat = 38
        let gap: CGFloat = 10  // Space between window and notch
        let topMargin: CGFloat = 5  // Distance from top of screen

        // Left window position (timer)
        let leftX = notchBounds.minX - windowWidth - gap
        let leftY = screenFrame.height - windowHeight - topMargin
        let leftFrame = NSRect(x: leftX, y: leftY, width: windowWidth, height: windowHeight)

        // Right window position (waveform)
        let rightX = notchBounds.maxX + gap
        let rightY = screenFrame.height - windowHeight - topMargin
        let rightFrame = NSRect(x: rightX, y: rightY, width: windowWidth, height: windowHeight)

        // Create left window
        leftWindow = createIslandWindow(frame: leftFrame, name: "island-left")

        // Create right window
        rightWindow = createIslandWindow(frame: rightFrame, name: "island-right")

        NSLog("[Island] Windows created: left=(%.0f,%.0f), right=(%.0f,%.0f)",
              leftX, leftY, rightX, rightY)

        return true
    }

    private func createIslandWindow(frame: NSRect, name: String) -> NSWindow {
        let window = NSWindow(
            contentRect: frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )

        // Window appearance
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true

        // Always on top configuration
        window.level = .popUpMenu + 1  // Level 102 - above fullscreen apps
        window.collectionBehavior = [
            .canJoinAllSpaces,       // Visible on all desktops
            .fullScreenAuxiliary,    // Stay visible in fullscreen
            .ignoresCycle,           // Don't show in Cmd+Tab
            .stationary              // Don't move when desktop changes
        ]

        // Interaction
        window.ignoresMouseEvents = false
        window.acceptsMouseMovedEvents = true

        // Identification
        window.title = name

        return window
    }

    // MARK: - Window Control

    public func showWindows() {
        leftWindow?.orderFrontRegardless()
        rightWindow?.orderFrontRegardless()
        NSLog("[Island] Windows shown")
    }

    public func hideWindows() {
        leftWindow?.orderOut(nil)
        rightWindow?.orderOut(nil)
        NSLog("[Island] Windows hidden")
    }

    public func destroyWindows() {
        leftWindow?.close()
        rightWindow?.close()
        leftWindow = nil
        rightWindow = nil
        NSLog("[Island] Windows destroyed")
    }

    public func repositionWindows() {
        guard hasNotch, let notchBounds = notchBounds else { return }
        guard let screen = NSScreen.main else { return }

        let screenFrame = screen.frame
        let windowWidth: CGFloat = 80
        let windowHeight: CGFloat = 38
        let gap: CGFloat = 10
        let topMargin: CGFloat = 5

        let leftX = notchBounds.minX - windowWidth - gap
        let leftY = screenFrame.height - windowHeight - topMargin
        leftWindow?.setFrame(NSRect(x: leftX, y: leftY, width: windowWidth, height: windowHeight), display: true)

        let rightX = notchBounds.maxX + gap
        let rightY = screenFrame.height - windowHeight - topMargin
        rightWindow?.setFrame(NSRect(x: rightX, y: rightY, width: windowWidth, height: windowHeight), display: true)
    }

    // MARK: - Utility

    public func getHasNotch() -> Bool {
        return hasNotch
    }
}
```

---

### 2. Swift FFI Bridge

**File**: `src-tauri/plugins/macos-sensing/Sources/MacOSSensing/MacOSSensing.swift`

Add island window management functions to the existing plugin:

```swift
// Global instance
private var islandManager: IslandWindowManager?

// MARK: - Island Window Management

@_cdecl("island_has_notch")
public func islandHasNotch() -> Bool {
    if #available(macOS 12.0, *) {
        if islandManager == nil {
            islandManager = IslandWindowManager()
        }
        return islandManager!.getHasNotch()
    }
    return false
}

@_cdecl("island_create_windows")
public func islandCreateWindows() -> Int32 {
    if #available(macOS 12.0, *) {
        if islandManager == nil {
            islandManager = IslandWindowManager()
        }

        let success = islandManager!.createWindows()
        if success {
            islandManager!.showWindows()
            return 0  // Success
        }
        return -1  // Failed to create
    }
    return -2  // macOS version too old
}

@_cdecl("island_show_windows")
public func islandShowWindows() {
    if #available(macOS 12.0, *) {
        islandManager?.showWindows()
    }
}

@_cdecl("island_hide_windows")
public func islandHideWindows() {
    if #available(macOS 12.0, *) {
        islandManager?.hideWindows()
    }
}

@_cdecl("island_destroy_windows")
public func islandDestroyWindows() {
    if #available(macOS 12.0, *) {
        islandManager?.destroyWindows()
        islandManager = nil
    }
}

@_cdecl("island_reposition_windows")
public func islandRepositionWindows() {
    if #available(macOS 12.0, *) {
        islandManager?.repositionWindows()
    }
}
```

---

### 3. Rust FFI Wrapper

**File**: `src-tauri/src/window/island/mod.rs`

```rust
use libloading::{Library, Symbol};
use std::sync::Arc;

pub struct IslandWindowManager {
    lib: Arc<Library>,
    has_notch: bool,
}

impl IslandWindowManager {
    pub fn new(lib: Arc<Library>) -> Result<Self, String> {
        let has_notch = unsafe {
            let check_fn: Symbol<unsafe extern "C" fn() -> bool> =
                lib.get(b"island_has_notch")
                    .map_err(|e| format!("Failed to load island_has_notch: {}", e))?;
            check_fn()
        };

        log::info!("Island manager initialized: has_notch={}", has_notch);

        Ok(Self { lib, has_notch })
    }

    pub fn has_notch(&self) -> bool {
        self.has_notch
    }

    pub fn create_windows(&self) -> Result<(), String> {
        if !self.has_notch {
            log::info!("No notch detected, skipping island window creation");
            return Ok(());
        }

        unsafe {
            let create_fn: Symbol<unsafe extern "C" fn() -> i32> =
                self.lib.get(b"island_create_windows")
                    .map_err(|e| format!("Failed to load island_create_windows: {}", e))?;

            let result = create_fn();

            match result {
                0 => {
                    log::info!("Island windows created successfully");
                    Ok(())
                }
                -1 => Err("Failed to create island windows".to_string()),
                -2 => Err("macOS version too old (requires 12.0+)".to_string()),
                _ => Err(format!("Unknown error code: {}", result)),
            }
        }
    }

    pub fn show_windows(&self) {
        if !self.has_notch {
            return;
        }

        unsafe {
            if let Ok(show_fn) = self.lib.get::<Symbol<unsafe extern "C" fn()>>(b"island_show_windows") {
                show_fn();
            }
        }
    }

    pub fn hide_windows(&self) {
        if !self.has_notch {
            return;
        }

        unsafe {
            if let Ok(hide_fn) = self.lib.get::<Symbol<unsafe extern "C" fn()>>(b"island_hide_windows") {
                hide_fn();
            }
        }
    }

    pub fn destroy_windows(&self) {
        if !self.has_notch {
            return;
        }

        unsafe {
            if let Ok(destroy_fn) = self.lib.get::<Symbol<unsafe extern "C" fn()>>(b"island_destroy_windows") {
                destroy_fn();
            }
        }
    }

    pub fn reposition_windows(&self) {
        if !self.has_notch {
            return;
        }

        unsafe {
            if let Ok(reposition_fn) = self.lib.get::<Symbol<unsafe extern "C" fn()>>(b"island_reposition_windows") {
                reposition_fn();
            }
        }
    }
}

impl Drop for IslandWindowManager {
    fn drop(&mut self) {
        self.destroy_windows();
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

    let manager = IslandWindowManager::new(lib)?;

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
```

**File**: `src-tauri/src/window/mod.rs`

```rust
pub mod island;
```

---

### 4. Integration in Main App

**File**: `src-tauri/src/lib.rs`

```rust
mod window;

use window::island;
use std::sync::Arc;

pub(crate) struct AppState {
    audio: AudioEngineHandle,
    pub(crate) db: Database,
    pub(crate) timer: TimerController,
    pub(crate) island_manager: Option<Arc<island::IslandWindowManager>>,  // New field
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

                // Finalize incomplete sessions
                {
                    let db_for_recovery = database.clone();
                    tauri::async_runtime::block_on(async move {
                        if let Some(session) = db_for_recovery.get_incomplete_session().await? {
                            let now = Utc::now();
                            warn!(
                                "Recovered incomplete session {}; marking as Interrupted",
                                session.id
                            );
                            db_for_recovery
                                .mark_session_interrupted(&session.id, now)
                                .await?;
                        }
                        Ok::<(), anyhow::Error>(())
                    })?;
                }

                let timer_controller = TimerController::new(app.handle().clone(), database.clone());

                // Initialize island manager
                let island_manager = match island::init() {
                    Ok(manager) => {
                        log::info!("Island manager initialized successfully");

                        // Create windows
                        if let Err(e) = manager.create_windows() {
                            log::error!("Failed to create island windows: {}", e);
                            None
                        } else {
                            Some(manager)
                        }
                    }
                    Err(e) => {
                        log::info!("Island not available: {}", e);
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

**Command Implementation** (`src-tauri/src/window/island/mod.rs`):

```rust
#[tauri::command]
pub fn toggle_island_visibility(
    visible: bool,
    state: State<crate::AppState>
) -> Result<(), String> {
    if let Some(manager) = &state.island_manager {
        if visible {
            manager.show_windows();
        } else {
            manager.hide_windows();
        }
        Ok(())
    } else {
        Err("Island not available (no notch detected)".to_string())
    }
}
```

---

## Testing Plan

### Phase 5.1 Testing Checklist

**Notch Detection:**
- [ ] Run on MacBook Pro 14" (2021+) → Island appears
- [ ] Run on MacBook Pro 16" (2021+) → Island appears
- [ ] Run on MacBook Air (no notch) → No island, no errors
- [ ] Check logs for notch dimensions (width, height, position)

**Window Positioning:**
- [ ] Left window appears left of notch (with ~10px gap)
- [ ] Right window appears right of notch (with ~10px gap)
- [ ] Windows are horizontally aligned with notch
- [ ] Windows are 80x38px each
- [ ] Windows have 5px margin from top of screen

**Always-On-Top:**
- [ ] Open Chrome in fullscreen → Windows still visible
- [ ] Open Slack in fullscreen → Windows still visible
- [ ] Play fullscreen YouTube video → Windows still visible
- [ ] Switch between macOS Spaces → Windows stay visible
- [ ] Windows do NOT appear in Cmd+Tab switcher

**Display Scaling:**
- [ ] Change display scaling to "More Space" → Windows reposition
- [ ] Change display scaling to "Larger Text" → Windows reposition
- [ ] Notch width adjusts correctly for scaling

**Multi-Monitor:**
- [ ] Connect external monitor → Island stays on built-in display
- [ ] Disconnect external monitor → Island remains visible

**Window Properties:**
- [ ] Windows are frameless (no title bar)
- [ ] Windows are transparent (can see through)
- [ ] Windows have subtle shadow
- [ ] Windows don't steal focus when shown

**Commands:**
- [ ] `toggle_island_visibility(true)` → Windows appear
- [ ] `toggle_island_visibility(false)` → Windows disappear
- [ ] Restarting app preserves visibility state

---

## Success Metrics

**Functional:**
- ✅ Notch detection works on all MBP 14"/16" variants
- ✅ Windows position correctly with <5px alignment error
- ✅ Always-on-top works in all fullscreen modes
- ✅ No crashes, no memory leaks

**Performance:**
- ✅ Window creation takes <100ms
- ✅ <5MB memory overhead for windows
- ✅ No CPU usage when idle

**UX:**
- ✅ Windows appear in correct position on first launch
- ✅ No flashing or repositioning after initial placement
- ✅ Smooth, invisible to user unless they look for it

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Notch detection fails on some models | High | Add calibration table, log dimensions for bug reports |
| Window doesn't stay above fullscreen | Critical | Test .popUpMenu level, try higher levels if needed |
| Display scaling breaks positioning | Medium | Listen to screen parameter changes, recalculate bounds |
| Swift library not found in prod | High | Document bundling process, add error handling |

---

## Implementation Order

### Day 1-3: Swift Foundation
1. Create `IslandWindowManager.swift`
2. Implement notch detection
3. Implement window creation with proper NSWindow configuration
4. Test on MBP 14" and 16"

### Day 4-6: FFI Bridge
1. Add FFI functions to `MacOSSensingPlugin.swift`
2. Build Swift plugin
3. Test FFI calls from Swift REPL
4. Verify library loading

### Day 7-9: Rust Integration
1. Create `island/mod.rs` with wrapper
2. Update `lib.rs` to initialize island on startup
3. Add `toggle_island_visibility` command
4. Test end-to-end: Rust → Swift → NSWindow

### Day 10-12: Testing & Polish
1. Multi-monitor testing
2. Fullscreen app testing (Chrome, Slack, YouTube)
3. Display scaling testing
4. Edge case handling (screen disconnect, etc.)

### Day 13-14: Documentation & Handoff
1. Document calibration process for new models
2. Add logging for debugging
3. Create testing guide for Phase 6
4. Tag release: `phase-5-foundation`

---

## Next Phases Preview

**Phase 6 (Part 2/3): Hover & Expansion**
- C callback bridge for hover events
- NSTrackingArea for mouse detection
- Expanded window (320x140px)
- Smooth merge animation

**Phase 7 (Part 3/3): Content & Timer**
- WebView embedding in NSWindows
- Timer display rendering
- Decorative waveform component
- Timer state synchronization

---

## File Structure

```
src-tauri/plugins/macos-sensing/
├── Package.swift                         (Existing)
└── Sources/
    ├── MacOSSensing/
    │   ├── MacOSSensing.swift            (Existing + new FFI exports)
    │   ├── FFIExports.swift              (Existing)
    │   ├── FFITypes.swift                (Existing)
    │   └── IslandWindowManager.swift     (New)
    └── CMacOSSensing/
        └── include/
            └── ... (No changes for Phase 5)

src-tauri/
├── src/
│   ├── lib.rs                            (Updated: island initialization)
│   └── window/
│       ├── mod.rs                        (New)
│       └── island/
│           └── mod.rs                    (New: FFI wrapper)
└── plugins/                              (Plugin builds to target/)
```

---

## Dependencies

**Swift:**
- `Cocoa` framework (built-in)
- macOS 12.0+ (for `NSScreen.safeAreaInsets`)

**Rust:**
- `libloading` (existing)
- `log` (existing)

**Build Process:**
The Swift plugin is built separately and produces `libMacOSSensing.dylib`:
- **Development:** Plugin builds to `src-tauri/plugins/macos-sensing/.build/release/libMacOSSensing.dylib`
- **Production:** Bundle the dylib in app Resources
- The Rust code loads the library dynamically via `libloading`

**Building the Swift Plugin:**
```bash
cd src-tauri/plugins/macos-sensing
swift build -c release
# Output: .build/release/libMacOSSensing.dylib
```

**No new npm dependencies needed for Phase 5.**

---

## Acceptance Criteria

Before moving to Phase 6, ensure:

1. ✅ Island windows appear on all supported MacBook Pro models
2. ✅ Windows position correctly relative to notch (visual inspection)
3. ✅ Always-on-top works in fullscreen Chrome, Slack, YouTube
4. ✅ No errors when running on Macs without notch
5. ✅ `toggle_island_visibility` command works from Rust
6. ✅ Logs show correct notch dimensions
7. ✅ No memory leaks after creating/destroying windows 10 times
8. ✅ Windows reposition correctly after display scaling change

---

## Summary

Phase 5 Part 1 delivers the **foundation** for the Dynamic Island:

- ✅ Swift-based window management with notch detection
- ✅ Two NSWindows positioned around notch (80x38px each)
- ✅ Always-on-top configuration for fullscreen compatibility
- ✅ Basic FFI bridge (create, show, hide, destroy)
- ✅ Rust wrapper with graceful fallback for non-notch Macs

This sets up **all the hard parts** (window positioning, notch detection, always-on-top) so that Phase 6 can focus purely on hover interaction and animation, and Phase 7 can focus purely on content rendering.
