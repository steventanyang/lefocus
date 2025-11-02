# System Design: Phase 1 (P1) - UX Enhancement & Dynamic Island

## Overview

Phase 1 (P1) focuses on user experience improvements, introducing a macOS-inspired Dynamic Island interface that provides subtle, non-intrusive feedback during focus sessions. The island serves as both a session control interface and a notification system for attention-related events (e.g., blocked app warnings).

**Key Features:**
- Floating "Dynamic Island" overlay (top-center, always-on-top)
- Real-time audio waveform visualization of system audio output
- Hover-to-expand controls (stop session, settings)
- Blocked app warnings with subtle red notification
- App configuration database for custom logos, colors, and blocked status

---

## Goals

1. **Non-Intrusive Awareness**: Provide ambient feedback without breaking focus
2. **Quick Session Control**: Easy access to stop/pause without opening main window
3. **Attention Warnings**: Subtle alerts when user is on a blocked/distracting app
4. **Visual Polish**: macOS design language with LeFocus branding

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│  Main Tauri Window (existing timer UI)                 │
└─────────────────────────────────────────────────────────┘
                         │
                         │ spawns
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Dynamic Island Window (new, frameless overlay)         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [Collapsed State - small pill]                  │  │
│  │  ┌──────────────────┐                             │  │
│  │  │ ~~~ waveform ~~~ │  (140x38px, peeks out)      │  │
│  │  └──────────────────┘                             │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [Expanded State - hover, bulges downward]        │  │
│  │  ┌────────────────────────────────────────┐       │  │
│  │  │ ~~~ waveform ~~~                       │       │  │
│  │  │                                        │       │  │
│  │  │  [Stop Session] [Settings Icon]       │       │  │
│  │  │  Session: 24:35                        │       │  │
│  │  └────────────────────────────────────────┘       │  │
│  │  (320x120px, expands down from collapsed)         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  [Warning State - blocked app detected]           │  │
│  │  ┌────────────────────────────────────────┐       │  │
│  │  │ 🔴 BLOCKED APP | ~~~ waveform ~~~      │       │  │
│  │  └────────────────────────────────────────┘       │  │
│  │  (red tint, text slides from left, 280x40px)      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ events
                         │
┌─────────────────────────────────────────────────────────┐
│  Rust Backend                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Active Window Monitor (existing)                 │  │
│  │    • Detects window changes via Swift FFI         │  │
│  │    • Checks against app_configs.blocked status    │  │
│  │    • Emits "blocked_app_detected" event           │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Audio Monitor (new)                              │  │
│  │    • Calls Swift FFI for system audio capture     │  │
│  │    • Polls audio level every ~50ms                │  │
│  │    • Emits "audio_level" event to frontend        │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  App Config Repository (new)                      │  │
│  │    • CRUD for app_configs table                   │  │
│  │    • Get blocked status, logo path, color         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ FFI calls
                         │
┌─────────────────────────────────────────────────────────┐
│  Swift Plugin (MacOSSensingPlugin)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Audio Monitoring (new)                           │  │
│  │    • Core Audio tap or SCStream (system audio)    │  │
│  │    • Captures system-wide audio output mix        │  │
│  │    • Processes audio buffers → RMS level          │  │
│  │    • Returns Float (0.0-1.0) to Rust              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### New Table: `app_configs`

Stores per-application configuration for UI customization and blocking rules.

```sql
CREATE TABLE IF NOT EXISTS app_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id TEXT NOT NULL UNIQUE,        -- e.g., "com.spotify.client"
    display_name TEXT NOT NULL,            -- e.g., "Spotify"
    logo_path TEXT,                        -- Path to custom icon (optional)
    color TEXT,                            -- Hex color for UI accents (e.g., "#1DB954")
    is_blocked BOOLEAN NOT NULL DEFAULT 0, -- Whether app is blocked during focus
    created_at INTEGER NOT NULL,           -- Unix timestamp
    updated_at INTEGER NOT NULL            -- Unix timestamp
);

CREATE INDEX idx_app_configs_bundle_id ON app_configs(bundle_id);
CREATE INDEX idx_app_configs_blocked ON app_configs(is_blocked);
```

**Example Rows:**
```
| bundle_id              | display_name | logo_path            | color   | is_blocked |
|------------------------|--------------|----------------------|---------|------------|
| com.spotify.client     | Spotify      | /icons/spotify.png   | #1DB954 | 1          |
| com.google.Chrome      | Chrome       | NULL                 | #4285F4 | 0          |
| com.slack.Slack        | Slack        | /icons/slack.png     | #E01E5A | 1          |
```

---

## Implementation Details

### 1. Dynamic Island Window (Tauri)

**Window Configuration:**
```rust
// src-tauri/src/window/dynamic_island.rs

pub fn create_dynamic_island_window(app: &tauri::AppHandle) -> Result<Window> {
    let window = tauri::WindowBuilder::new(
        app,
        "dynamic_island",
        tauri::WindowUrl::App("dynamic-island.html".into())
    )
    .title("LeFocus Island")
    .inner_size(140.0, 38.0)  // Collapsed: small pill that peeks below notch
    .decorations(false)       // Frameless
    .transparent(true)        // For rounded corners
    .always_on_top(true)      // Float above all windows
    .skip_taskbar(true)       // Don't show in Cmd+Tab
    .resizable(false)
    .position(center_top_position()) // Calculate based on screen width
    .build()?;

    Ok(window)
}

fn center_top_position() -> (f64, f64) {
    // Get primary monitor dimensions, place at top-center with ~5px from top
    // Positioned so collapsed state sits just below the notch area
    // Implementation uses tauri::Monitor API
}
```

**Frontend Component Structure:**
```typescript
// src/components/DynamicIsland.tsx

interface IslandState {
    mode: 'collapsed' | 'expanded' | 'warning';
    audioLevel: number;        // 0.0 - 1.0
    blockedApp?: {
        name: string;
        color: string;
    };
    sessionTime: number;       // seconds elapsed
}

export function DynamicIsland() {
    const [state, setState] = useState<IslandState>({
        mode: 'collapsed',
        audioLevel: 0,
        sessionTime: 0
    });

    // Listen to Rust events
    useEffect(() => {
        const unlisten = listen<number>('audio_level', (event) => {
            setState(prev => ({ ...prev, audioLevel: event.payload }));
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    useEffect(() => {
        const unlistenDetected = listen<BlockedAppEvent>('blocked_app_detected', (event) => {
            setState(prev => ({
                ...prev,
                mode: 'warning',
                blockedApp: event.payload
            }));
        });

        const unlistenCleared = listen('blocked_app_cleared', () => {
            setState(prev => ({
                ...prev,
                mode: 'collapsed',
                blockedApp: undefined
            }));
        });

        return () => {
            unlistenDetected.then(fn => fn());
            unlistenCleared.then(fn => fn());
        };
    }, []);

    return (
        <div
            className="island-container"
            onMouseEnter={() => setState(prev => ({ ...prev, mode: 'expanded' }))}
            onMouseLeave={() => setState(prev => ({
                ...prev,
                mode: prev.blockedApp ? 'warning' : 'collapsed'
            }))}
        >
            {state.mode === 'collapsed' && <CollapsedView audioLevel={state.audioLevel} />}
            {state.mode === 'expanded' && <ExpandedView {...state} />}
            {state.mode === 'warning' && <WarningView {...state} />}
        </div>
    );
}
```

**Waveform Visualization:**
```typescript
// src/components/Waveform.tsx

interface WaveformProps {
    audioLevel: number;  // 0.0 - 1.0
    barCount?: number;
    color?: string;
}

export function Waveform({ audioLevel, barCount = 5, color = '#ffffff' }: WaveformProps) {
    const bars = useMemo(() => {
        // Generate bar heights based on audio level + slight random variation
        return Array.from({ length: barCount }, (_, i) => {
            const baseHeight = audioLevel * 100;
            const variance = Math.random() * 20 - 10; // ±10%
            return Math.max(10, Math.min(100, baseHeight + variance));
        });
    }, [audioLevel, barCount]);

    return (
        <div className="waveform">
            {bars.map((height, i) => (
                <div
                    key={i}
                    className="waveform-bar"
                    style={{
                        height: `${height}%`,
                        backgroundColor: color,
                        transition: 'height 0.1s ease-out'
                    }}
                />
            ))}
        </div>
    );
}
```

**Styling:**
- Uses Tailwind utility classes throughout
- Custom `slide-in-left` animation added to tailwind.config.js for blocked app label

---

### 2. Swift Audio Monitoring

**Architecture Decision:**

ScreenCaptureKit cannot capture audio when filtering by individual windows (`desktopIndependentWindow`). Instead, we capture system-wide audio:

1. **Primary approach (macOS 14.2+)**: Use Core Audio `AudioHardwareCreateProcessTap` to capture system-wide output mix
   - Captures all system audio (Spotify, YouTube, Safari, etc.)
   - Reflects ambient "activity" during focus session
   - Simpler implementation than per-app isolation

2. **Fallback (macOS <14.2)**: Use ScreenCaptureKit with system-level audio capture
   - Still captures all system audio, not per-app
   - More compatible with older macOS versions

3. **UX Implication**: Waveform shows "what you're hearing" (system mix) rather than isolating the active app
   - Provides ambient awareness of audio activity
   - Future enhancement could attempt per-app isolation via audio routing inspection

4. **FFI Synchronization**: `startAudioMonitoring()` now blocks until first audio buffer arrives or times out (2s)
   - Prevents false "success" returns when capture actually fails
   - Enables graceful fallback to decorative waveform if audio unavailable

**Extension to MacOSSensingPlugin:**

```swift
// swift-plugin/Sources/MacOSSensingPlugin/AudioMonitor.swift

import ScreenCaptureKit
import AVFoundation
import CoreAudio

@available(macOS 13.0, *)
class AudioMonitor: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private var processTap: AudioDeviceIOProcID?
    private var currentAudioLevel: Float = 0.0
    private let audioLevelQueue = DispatchQueue(label: "com.lefocus.audiolevel")
    private var isMonitoring = false
    private var firstBufferReceived = false

    func startMonitoring() async throws {
        // Reset state from previous sessions
        firstBufferReceived = false
        currentAudioLevel = 0.0
        isMonitoring = false

        // Try Core Audio process tap first (macOS 14.2+)
        if #available(macOS 14.2, *) {
            try await startSystemAudioTap()
        } else {
            // Fallback to ScreenCaptureKit system audio
            try await startScreenCaptureKitAudio()
        }

        // Wait for first audio buffer or timeout
        let startTime = Date()
        while !firstBufferReceived && Date().timeIntervalSince(startTime) < 2.0 {
            try await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }

        if !firstBufferReceived {
            throw NSError(domain: "AudioMonitor", code: -3, userInfo: [NSLocalizedDescriptionKey: "Audio capture timeout"])
        }

        isMonitoring = true
    }

    @available(macOS 14.2, *)
    private func startSystemAudioTap() async throws {
        // Use Core Audio process tap to capture system output mix
        var defaultOutputDeviceID = AudioDeviceID()
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var propertySize = UInt32(MemoryLayout<AudioDeviceID>.size)

        let status = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &propertyAddress,
            0,
            nil,
            &propertySize,
            &defaultOutputDeviceID
        )

        guard status == noErr else {
            throw NSError(domain: "AudioMonitor", code: Int(status), userInfo: nil)
        }

        // Create process tap for system output
        let tapStatus = AudioHardwareCreateProcessTap(
            &processTap,
            defaultOutputDeviceID,
            { [weak self] audioBuffer, numFrames in
                self?.processAudioBuffer(audioBuffer, frameCount: numFrames)
            },
            nil
        )

        guard tapStatus == noErr else {
            throw NSError(domain: "AudioMonitor", code: Int(tapStatus), userInfo: nil)
        }
    }

    private func startScreenCaptureKitAudio() async throws {
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.sampleRate = 44100
        config.channelCount = 2

        // Capture system audio (all applications)
        let content = try await SCShareableContent.current
        let filter = SCContentFilter(display: content.displays.first!, excludingApplications: [], exceptingWindows: [])

        stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream?.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioLevelQueue)
        try await stream?.startCapture()
    }

    func stopMonitoring() async {
        isMonitoring = false
        firstBufferReceived = false
        currentAudioLevel = 0.0

        if let tap = processTap {
            AudioHardwareDestroyProcessTap(tap)
            processTap = nil
        }

        try? await stream?.stopCapture()
        stream = nil
    }

    func getAudioLevel() -> Float {
        return currentAudioLevel
    }

    // Process audio buffer (used by both Core Audio tap and ScreenCaptureKit)
    private func processAudioBuffer(_ buffer: UnsafePointer<AudioBuffer>, frameCount: UInt32) {
        let samples = buffer.pointee.mData?.assumingMemoryBound(to: Float.self)
        guard let samples = samples else { return }

        var sumOfSquares: Float = 0.0
        for i in 0..<Int(frameCount) {
            let sample = samples[i]
            sumOfSquares += sample * sample
        }

        let rms = sqrt(sumOfSquares / Float(frameCount))
        let level = min(1.0, rms * 5.0)

        audioLevelQueue.async {
            self.currentAudioLevel = level
            self.firstBufferReceived = true
        }
    }

    // SCStreamOutput protocol (for ScreenCaptureKit fallback)
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }

        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var length: Int = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &length, totalLengthOut: nil, dataPointerOut: &dataPointer)

        guard let data = dataPointer else { return }

        let samples = data.withMemoryRebound(to: Float.self, capacity: length / MemoryLayout<Float>.size) { ptr in
            Array(UnsafeBufferPointer(start: ptr, count: length / MemoryLayout<Float>.size))
        }

        let sumOfSquares = samples.reduce(0.0) { $0 + ($1 * $1) }
        let rms = sqrt(sumOfSquares / Float(samples.count))
        let level = min(1.0, rms * 5.0)

        audioLevelQueue.async {
            self.currentAudioLevel = level
            self.firstBufferReceived = true
        }
    }
}
```

**FFI Bridge Extensions:**

```swift
// swift-plugin/Sources/MacOSSensingPlugin/MacOSSensingPlugin.swift

private let audioMonitor = AudioMonitor()
private var audioMonitorTask: Task<Int32, Never>?

@_cdecl("start_audio_monitoring")
public func startAudioMonitoring() -> Int32 {
    // Create synchronous wrapper using semaphore
    let semaphore = DispatchSemaphore(value: 0)
    var result: Int32 = -2 // Default to error

    audioMonitorTask = Task {
        do {
            try await audioMonitor.startMonitoring()
            result = 0 // Success
        } catch let error as NSError {
            print("Audio monitoring failed: \(error)")
            result = Int32(error.code)
        } catch {
            print("Audio monitoring failed: \(error)")
            result = -2 // Generic error
        }
        semaphore.signal()
        return result
    }

    // Wait for completion (max 3 seconds)
    let timeoutResult = semaphore.wait(timeout: .now() + 3.0)

    if timeoutResult == .timedOut {
        print("Audio monitoring timed out waiting for semaphore")
        audioMonitorTask?.cancel()
        return -4 // Timeout error code
    }

    return result
}

@_cdecl("stop_audio_monitoring")
public func stopAudioMonitoring() {
    audioMonitorTask?.cancel()
    Task {
        await audioMonitor.stopMonitoring()
    }
}

@_cdecl("get_audio_level")
public func getAudioLevel() -> Float {
    return audioMonitor.getAudioLevel()
}
```

**Rust FFI Wrapper:**

```rust
// src-tauri/src/macos/audio.rs

use libloading::{Library, Symbol};
use std::sync::Arc;

pub struct AudioMonitor {
    lib: Arc<Library>,
}

impl AudioMonitor {
    pub fn new(lib: Arc<Library>) -> Self {
        Self { lib }
    }

    pub fn start_monitoring(&self) -> Result<(), String> {
        unsafe {
            let start_fn: Symbol<unsafe extern "C" fn() -> i32> =
                self.lib.get(b"start_audio_monitoring")
                    .map_err(|e| e.to_string())?;

            let result = start_fn();

            match result {
                0 => Ok(()),
                -3 => Err("Audio capture timeout - no audio detected".to_string()),
                -4 => Err("Audio monitoring timed out waiting for initialization".to_string()),
                _ => Err(format!("Audio monitoring failed with code: {}", result)),
            }
        }
    }

    pub fn stop_monitoring(&self) {
        unsafe {
            let stop_fn: Symbol<unsafe extern "C" fn()> =
                self.lib.get(b"stop_audio_monitoring").unwrap();
            stop_fn();
        }
    }

    pub fn get_audio_level(&self) -> f32 {
        unsafe {
            let get_fn: Symbol<unsafe extern "C" fn() -> f32> =
                self.lib.get(b"get_audio_level").unwrap();
            get_fn()
        }
    }
}
```

---

### 3. Backend Integration

**Audio Level Polling Task:**

```rust
// src-tauri/src/timer/audio_monitor.rs

use tauri::{AppHandle, Manager};
use tokio::time::{interval, Duration};
use std::sync::Arc;

pub async fn start_audio_level_emitter(
    app: AppHandle,
    audio_monitor: Arc<crate::macos::audio::AudioMonitor>
) {
    let mut ticker = interval(Duration::from_millis(50)); // 20 FPS

    loop {
        ticker.tick().await;

        let level = audio_monitor.get_audio_level();

        // Emit to Dynamic Island window
        if let Some(window) = app.get_window("dynamic_island") {
            let _ = window.emit("audio_level", level);
        }
    }
}
```

**Blocked App Detection Integration:**

```rust
// src-tauri/src/sensing/window_monitor.rs

use crate::db::repositories::app_configs::AppConfigRepository;
use tauri::{AppHandle, Manager};

pub async fn check_and_emit_blocked_app(
    app: &AppHandle,
    bundle_id: &str,
    app_config_repo: &AppConfigRepository
) -> Result<(), Box<dyn std::error::Error>> {
    let is_blocked = if let Some(config) = app_config_repo.get_by_bundle_id(bundle_id)? {
        if config.is_blocked {
            // Emit warning event to Dynamic Island
            if let Some(window) = app.get_window("dynamic_island") {
                window.emit("blocked_app_detected", serde_json::json!({
                    "name": config.display_name,
                    "color": config.color
                }))?;
            }
            true
        } else {
            false
        }
    } else {
        false
    };

    // If not blocked, emit cleared event
    if !is_blocked {
        if let Some(window) = app.get_window("dynamic_island") {
            window.emit("blocked_app_cleared", ())?;
        }
    }

    Ok(())
}
```

**App Config Repository:**

```rust
// src-tauri/src/db/repositories/app_configs.rs

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub id: i64,
    pub bundle_id: String,
    pub display_name: String,
    pub logo_path: Option<String>,
    pub color: Option<String>,
    pub is_blocked: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct AppConfigRepository<'a> {
    conn: &'a Connection,
}

impl<'a> AppConfigRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn create(&self, config: &AppConfig) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO app_configs (bundle_id, display_name, logo_path, color, is_blocked, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                config.bundle_id,
                config.display_name,
                config.logo_path,
                config.color,
                config.is_blocked,
                config.created_at,
                config.updated_at,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_by_bundle_id(&self, bundle_id: &str) -> Result<Option<AppConfig>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, bundle_id, display_name, logo_path, color, is_blocked, created_at, updated_at
             FROM app_configs WHERE bundle_id = ?1"
        )?;

        let mut rows = stmt.query(params![bundle_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(AppConfig {
                id: row.get(0)?,
                bundle_id: row.get(1)?,
                display_name: row.get(2)?,
                logo_path: row.get(3)?,
                color: row.get(4)?,
                is_blocked: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_blocked(&self) -> Result<Vec<AppConfig>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, bundle_id, display_name, logo_path, color, is_blocked, created_at, updated_at
             FROM app_configs WHERE is_blocked = 1"
        )?;

        let configs = stmt.query_map([], |row| {
            Ok(AppConfig {
                id: row.get(0)?,
                bundle_id: row.get(1)?,
                display_name: row.get(2)?,
                logo_path: row.get(3)?,
                color: row.get(4)?,
                is_blocked: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        configs.collect()
    }

    pub fn update(&self, config: &AppConfig) -> Result<()> {
        self.conn.execute(
            "UPDATE app_configs
             SET display_name = ?1, logo_path = ?2, color = ?3, is_blocked = ?4, updated_at = ?5
             WHERE bundle_id = ?6",
            params![
                config.display_name,
                config.logo_path,
                config.color,
                config.is_blocked,
                chrono::Utc::now().timestamp(),
                config.bundle_id,
            ],
        )?;
        Ok(())
    }

    pub fn delete(&self, bundle_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM app_configs WHERE bundle_id = ?1",
            params![bundle_id],
        )?;
        Ok(())
    }
}
```

**Migration:**

```rust
// src-tauri/src/db/migrations.rs

pub fn create_app_configs_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bundle_id TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            logo_path TEXT,
            color TEXT,
            is_blocked BOOLEAN NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_configs_bundle_id ON app_configs(bundle_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_app_configs_blocked ON app_configs(is_blocked)",
        [],
    )?;

    Ok(())
}
```

---

### 4. Tauri Commands (API for Frontend)

```rust
// src-tauri/src/commands/app_config.rs

use crate::db::repositories::app_configs::{AppConfig, AppConfigRepository};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_app_config(
    bundle_id: String,
    state: State<'_, AppState>
) -> Result<Option<AppConfig>, String> {
    let db = state.db.lock().await;
    let repo = AppConfigRepository::new(&db);

    repo.get_by_bundle_id(&bundle_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_blocked_apps(
    state: State<'_, AppState>
) -> Result<Vec<AppConfig>, String> {
    let db = state.db.lock().await;
    let repo = AppConfigRepository::new(&db);

    repo.get_all_blocked()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_or_update_app_config(
    config: AppConfig,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    let repo = AppConfigRepository::new(&db);

    // Check if exists
    if repo.get_by_bundle_id(&config.bundle_id).map_err(|e| e.to_string())?.is_some() {
        repo.update(&config).map_err(|e| e.to_string())
    } else {
        repo.create(&config).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub async fn delete_app_config(
    bundle_id: String,
    state: State<'_, AppState>
) -> Result<(), String> {
    let db = state.db.lock().await;
    let repo = AppConfigRepository::new(&db);

    repo.delete(&bundle_id)
        .map_err(|e| e.to_string())
}
```

---

## Event Flow Diagrams

### Audio Level Updates

```
Timer Start
    │
    └─> Rust: Start audio monitoring
            │
            └─> Swift FFI: start_audio_monitoring() [BLOCKS until first buffer or timeout]
                    │
                    ├─> macOS 14.2+: AudioHardwareCreateProcessTap (system audio)
                    │       │
                    │       └─> Wait for first audio buffer (max 2s)
                    │               │
                    │               ├─> Success: Return 0 to Rust
                    │               └─> Timeout: Return -3 to Rust
                    │
                    └─> macOS <14.2: ScreenCaptureKit system audio
                            │
                            └─> Wait for first audio buffer (max 2s)
                                    │
                                    ├─> Success: Return 0 to Rust
                                    └─> Timeout/Error: Return error code

    ├─> If start_monitoring() succeeds:
    │       │
    │       └─> Rust: Spawn audio_level_emitter task
    │               │
    │               └─> Every 50ms:
    │                       │
    │                       ├─> Swift FFI: get_audio_level()
    │                       │       │
    │                       │       └─> Returns Float (0.0-1.0)
    │                       │
    │                       └─> Tauri: emit("audio_level", level)
    │                               │
    │                               └─> Frontend: Waveform component updates
    │
    └─> If start_monitoring() fails:
            │
            └─> Log warning, use decorative waveform fallback
```

### Blocked App Warning

```
Active Window Change
    │
    └─> Rust: window_monitor detects new bundle_id
            │
            └─> Query app_configs.is_blocked for bundle_id
                    │
                    ├─> If blocked = true:
                    │       │
                    │       └─> Tauri: emit("blocked_app_detected", {name, color})
                    │               │
                    │               └─> Frontend: DynamicIsland switches to warning mode
                    │                       │
                    │                       └─> Red tint + "BLOCKED APP" label slides in
                    │
                    └─> If blocked = false (or not found):
                            │
                            └─> Tauri: emit("blocked_app_cleared")
                                    │
                                    └─> Frontend: DynamicIsland clears warning, returns to collapsed
                                            │
                                            └─> blockedApp state reset to undefined
```

---

## UI States & Transitions

### State Machine

```
┌─────────────────────────────────────────────────────────┐
│                    COLLAPSED                            │
│  • 140x38px (small pill, peeks below notch)             │
│  • Shows waveform only                                  │
│  • Semi-transparent black background                    │
│  • Window sits just below notch area                    │
└─────────────────────────────────────────────────────────┘
         │                                      ▲
         │ onMouseEnter                         │ onMouseLeave
         │                                      │
         ▼                                      │
┌─────────────────────────────────────────────────────────┐
│                    EXPANDED                             │
│  • 320x120px (bulges downward from collapsed)           │
│  • Shows waveform + controls + session time             │
│  • Stop Session button, settings icon                   │
│  • Session elapsed time display                         │
│  • Expands with smooth animation                        │
└─────────────────────────────────────────────────────────┘
         │                                      ▲
         │ blocked_app_detected event           │ blocked_app_cleared event
         │                                      │
         ▼                                      │
┌─────────────────────────────────────────────────────────┐
│                    WARNING                              │
│  • 280x40px (wider for warning text)                    │
│  • Red tinted background                                │
│  • "🔴 BLOCKED APP" text slides from left               │
│  • Waveform still visible (but red tinted)              │
│  • Hover still expands to show controls                 │
│  • Clears on blocked_app_cleared event                  │
└─────────────────────────────────────────────────────────┘
```

---

## Future Enhancements (Post-P1)

### Phase 5 (Detailed Audio + Advanced Notifications)
- **Audio history visualization**: Show audio level graph over time
- **Multiple notification types**: Break reminders, posture alerts, hydration reminders
- **Custom notification rules**: User-defined triggers based on session metrics
- **App-specific audio profiles**: Different waveform styles per app type

### Phase 6 (Settings UI in Island)
- **Quick settings dropdown**: Toggle blocked apps, adjust timer duration
- **In-island statistics**: Mini charts for session history
- **Keyboard shortcuts**: Global hotkeys to show/hide island
- **Multi-monitor support**: Island follows active monitor

---

## Development Phases Breakdown

### Phase 5.1: Core UI (Week 1)
**Goal:** Get Dynamic Island rendering and responding to hover

- [ ] Create Tauri frameless window with proper positioning
- [ ] Build React components (collapsed, expanded, warning states)
- [ ] Implement hover transitions with smooth animations
- [ ] Add "Stop Session" button functionality
- [ ] Style with macOS glassmorphism design

### Phase 5.2: Database & Blocked Apps (Week 2)
**Goal:** Implement app config storage and blocking detection

- [ ] Create `app_configs` table migration
- [ ] Implement `AppConfigRepository` with CRUD operations
- [ ] Add Tauri commands for managing app configs
- [ ] Integrate blocked app detection in window monitor
- [ ] Test warning state triggering when switching to blocked app

### Phase 5.3: Static Waveform (Week 2)
**Goal:** Add decorative waveform animation (no real audio yet)

- [ ] Build `Waveform` component with animated bars
- [ ] Implement smooth random variation algorithm
- [ ] Add color customization based on app config
- [ ] Test performance of animations

### Phase 6.1: Swift Audio Monitoring (Week 3)
**Goal:** Capture system audio output

- [ ] Extend Swift plugin with `AudioMonitor` class
- [ ] Implement Core Audio process tap (macOS 14.2+) or ScreenCaptureKit system audio fallback
- [ ] Add RMS level calculation from audio buffers
- [ ] Create FFI bridge functions for audio monitoring
- [ ] Implement proper timeout and error handling

### Phase 6.2: Audio Integration (Week 4)
**Goal:** Connect real audio levels to waveform

- [ ] Implement Rust audio monitor wrapper
- [ ] Create audio level polling task (50ms interval)
- [ ] Emit `audio_level` events to frontend
- [ ] Wire up real audio data to `Waveform` component
- [ ] Performance tuning and smoothing

---

## Testing Strategy

### Unit Tests
- `AppConfigRepository`: CRUD operations, constraint handling
- `AudioMonitor` (Swift): RMS calculation accuracy
- `Waveform` component: Bar height calculations

### Integration Tests
- Event flow: Rust → Frontend audio level updates
- Blocked app detection: Window change → Warning display
- Window lifecycle: Island window creation, positioning, always-on-top

### Manual QA
- [ ] Island stays centered on screen resize
- [ ] Hover expansion is smooth and responsive (bulges downward)
- [ ] Warning state activates within 100ms of app switch
- [ ] Audio waveform updates at ~20 FPS without lag
- [ ] Collapsed state is small enough to not obstruct content (140x38px pill)
- [ ] Expanded state is easily accessible via hover
- [ ] Works correctly across multiple monitors
- [ ] Persists across macOS Spaces/Desktops

---

## Performance Considerations

1. **Audio Polling Rate**: 50ms (20 FPS) is sufficient for smooth visualization without excessive CPU
2. **Event Batching**: Consider throttling `audio_level` events if CPU usage is high
3. **Window Rendering**: Use Tailwind transitions for animations (GPU-accelerated)
4. **Memory**: Audio buffers are processed immediately, no long-term storage
5. **Battery Impact**: Monitor background audio capture; consider disabling if not focused

---

## Security & Permissions

### macOS Permissions Required
- **Screen Recording**: Already granted for Phase 1 (window tracking)
- **Audio Capture**: May prompt user on first audio monitoring attempt
- **Accessibility**: Not required for audio, but helpful for global hotkeys (future)

### User Consent Flow
1. First time audio monitoring starts → macOS prompt for audio/screen recording
2. User grants permission → Swift starts Core Audio tap or SCStream
3. If denied or fails → Graceful fallback to decorative waveform, log warning

---

## Open Questions / Design Decisions

1. **Island Persistence**: Should island remain visible when no session is active? (Proposed: No, only during active sessions)
2. **Warning Dismissal**: Can user dismiss blocked app warning manually, or only by switching apps? (Proposed: Only by switching)
3. **Multi-monitor**: Should we create one island per monitor? (Proposed: Single island on primary monitor for MVP)
4. **Focus Loss**: What happens when LeFocus app loses focus entirely? (Proposed: Island remains visible as long as session is active)

---

## Success Metrics

- **User Engagement**: 80%+ of sessions use island for stopping (vs. main window)
- **Performance**: Island renders at 60 FPS during animations, <2% CPU overhead
- **Accuracy**: Blocked app warnings trigger within 100ms of app switch
- **Polish**: User feedback rates island as "non-intrusive" and "helpful"

---

## Dependencies

- Tauri 1.x window management APIs
- ScreenCaptureKit (macOS 13.0+)
- Existing Swift FFI bridge from Phase 1
- React, TypeScript, Tailwind CSS (existing stack)
- SQLite (existing database)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| System audio capture fails or times out | High | Fallback to decorative waveform, clear error logging |
| Collapsed island is too intrusive | Medium | Keep size minimal (140x38px), positioned below notch |
| Excessive CPU from audio polling | Medium | Implement adaptive polling rate based on battery state |
| Permission denial for audio capture | Low | Graceful degradation, clear user messaging |

---

## Summary

Phase 1 (P1) introduces the **Dynamic Island** as a central UX element for LeFocus, providing:
- Real-time audio visualization of system audio output (ambient activity awareness)
- Subtle, hover-activated session controls
- Non-intrusive blocked app warnings
- Extensible app configuration system for future customization

This sets the foundation for a polished, macOS-native user experience that keeps the user in flow while maintaining awareness of their focus state.

**Note on Audio Visualization**: The waveform reflects system-wide audio (all apps) rather than per-app isolation due to macOS API limitations. This provides ambient awareness of "what you're hearing" during focus sessions.
