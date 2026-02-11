# LeFocus: Island Claude Code Session Indicators

**Version:** 1.0
**Date:** February 2026
**Phase:** 9 (Claude Session Monitoring)
**Status:** Implemented

---

## Overview

Adds a row of colored dots to the Island showing the status of running Claude Code CLI sessions. When multiple Claude terminals are open (e.g. in Warp), each gets a dot: **yellow** = actively working, **orange** = waiting for input, **green** = done (fades out). This gives at-a-glance awareness of all Claude sessions without switching windows.

## Architecture

```
┌─────────────────┐     ┌──────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Rust            │     │  C Shim  │     │  Swift               │     │  IslandView  │
│  ClaudeMonitor   │────>│  FFI     │────>│  FFIExports          │────>│  draw()      │
│  (poll every 2s) │     │  bridge  │     │  → IslandController  │     │  dots row    │
└─────────────────┘     └──────────┘     └─────────────────────┘     └──────────────┘
     sysinfo                repr(C)           DispatchQueue.main         CGContext
```

### Data Flow

1. **Rust** (`claude_monitor.rs`): Background tokio task polls `sysinfo` every 2s, scanning all processes for Claude Code CLI instances
2. **Rust** (`macos_bridge.rs`): Converts `Vec<ClaudeSession>` → `Vec<ClaudeSessionFFI>` (repr(C) struct) and calls through FFI
3. **C** (`MacOSSensingFFI.c`): Passthrough from Rust extern to Swift `@_cdecl` entry point
4. **Swift** (`FFIExports.swift`): Parses C struct array into `[ClaudeSessionInfo]`, dispatches to main queue
5. **Swift** (`IslandController.swift`): Stores sessions, forwards to `IslandView`
6. **Swift** (`IslandView.swift`): Stores sessions, marks `needsDisplay`
7. **Swift** (`IslandClaudeDrawing.swift`): Renders colored dots in `draw()` at the bottom of the island

## Components

### Rust: ClaudeMonitor (`src-tauri/src/claude_monitor.rs`)

Process scanner that detects Claude Code CLI sessions and classifies their state.

```rust
pub enum SessionState { Working, NeedsAttention, Done }
pub struct ClaudeSession { pid: u32, state: SessionState, age_secs: f32 }
pub struct ClaudeMonitor { system, cpu_history, previous_pids, done_sessions, ... }
```

**Process Detection** (`is_claude_process`):
- Checks `process.name()` for `"claude"` or `"claude-*"` prefix
- Falls back to checking `process.exe()` path contains `"claude"` (excludes `"lefocus"`)
- Catches both Homebrew installs (`/opt/homebrew/Caskroom/claude-code/...`) and Cursor extension installs (`~/.cursor/extensions/.../claude`)

**State Classification** (CPU-based):
- `Working` (yellow): Average CPU > 5% over last 3 samples — Claude is actively generating/executing
- `NeedsAttention` (orange): Average CPU < 5%, process alive — idle at prompt, waiting for user input
- `Done` (green): Process exited — kept for 8s with fade-out, then removed

**Polling**: Uses `sysinfo::ProcessRefreshKind::everything()` to ensure process names and exe paths are populated on macOS.

### Rust: Background Task (`src-tauri/src/lib.rs`)

Spawned via `tauri::async_runtime::spawn` after `island_init()` in the app setup closure:

```rust
tauri::async_runtime::spawn(async {
    let mut monitor = claude_monitor::ClaudeMonitor::new();
    loop {
        let sessions = monitor.poll();
        macos_bridge::island_update_claude_sessions(&sessions);
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
});
```

### FFI Bridge

**Rust → C struct** (`macos_bridge.rs`):
```rust
#[repr(C)]
pub struct ClaudeSessionFFI {
    pub pid: u32,
    pub state: u8,      // 0=Working, 1=NeedsAttention, 2=Done
    pub age_secs: f32,
}
```
Total size: 12 bytes (4 + 1 + 3 padding + 4). Identical layout in C and Rust.

**C header** (`MacOSSensingFFI.h`):
```c
typedef struct {
    uint32_t pid;
    uint8_t state;
    float age_secs;
} CMacOSSensing_ClaudeSessionFFI;

void macos_sensing_island_update_claude_sessions(
    const CMacOSSensing_ClaudeSessionFFI *sessions, size_t count);
```

**C implementation** (`MacOSSensingFFI.c`): Simple passthrough to Swift `@_cdecl` entry point.

**Swift types** (`IslandFFITypes.swift`):
```swift
public enum ClaudeSessionState: UInt8 { case working = 0, needsAttention = 1, done = 2 }
public struct ClaudeSessionInfo { pid: UInt32, state: ClaudeSessionState, ageSeconds: Float }
```

### Swift: Drawing (`IslandClaudeDrawing.swift`)

Extension on `IslandView` that renders the dots row in `draw()`.

**Layout**:
- Dots are drawn at the bottom of the island, inside the black pill
- The island is 8px taller than before (`dotsBottomPadding`) to accommodate the dots row
- Dots are centered horizontally: `baseX = bounds.midX - totalDotsWidth / 2`
- Vertical center: `dotsBottomPadding / 2` (center of the 8px padding area)
- Each dot: 6px diameter circle, 5px spacing, max 8 dots
- Total width for 8 dots: 8 × 6 + 7 × 5 = 83px

**Colors**:
| State | Color | RGB | Glow |
|-------|-------|-----|------|
| Working | Yellow | `(1.0, 0.8, 0.0)` | 6px blur, 0.45 alpha |
| NeedsAttention | Orange | `(1.0, 0.6, 0.0)` | 6px blur, 0.45 alpha |
| Done | Green | `(52/255, 218/255, 79/255)` | None (fading) |

**Done fade**: Green dots at full alpha for 5s, then linear fade to 0 over 3s. Removed after 8s total.

### Island Height Adjustment

The `dotsBottomPadding` (8px) is added to all island window heights:

| Mode | Old Height | New Height |
|------|-----------|------------|
| Compact | 38px | 46px |
| Compact (hover) | 43px | 51px |
| Expanded (idle) | 170px | 178px |
| Expanded (timer) | 150px | 158px |

All existing content is offset upward by `dotsBottomPadding` via `notchCenterY` (for vertically-centered content) and explicit `+ Self.dotsBottomPadding` offsets (for bottom-positioned content like playback buttons and progress bars).

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src-tauri/src/claude_monitor.rs` | **NEW** | Process scanning + CPU-based state classification |
| `src-tauri/src/lib.rs` | MODIFY | Add `mod claude_monitor`, spawn polling task |
| `src-tauri/src/macos_bridge.rs` | MODIFY | Add `ClaudeSessionFFI` struct + bridge function |
| `CMacOSSensing/include/MacOSSensingFFI.h` | MODIFY | Add C struct + function declaration |
| `CMacOSSensing/MacOSSensingFFI.c` | MODIFY | Add passthrough to Swift |
| `MacOSSensing/FFIExports.swift` | MODIFY | Add `@_cdecl` entry point |
| `MacOSSensing/FFITypes.swift` | MODIFY | Add `ClaudeSessionFFI` typealias |
| `MacOSSensing/Island/IslandFFITypes.swift` | MODIFY | Add `ClaudeSessionState` + `ClaudeSessionInfo` |
| `MacOSSensing/Island/IslandController.swift` | MODIFY | Add session state + update method, adjust heights |
| `MacOSSensing/Island/IslandView.swift` | MODIFY | Add property, update method, `dotsBottomPadding`, `notchCenterY` |
| `MacOSSensing/Island/Drawing/IslandClaudeDrawing.swift` | **NEW** | Dot rendering extension |
| `MacOSSensing/Island/Drawing/IslandAudioDrawing.swift` | MODIFY | Offset content for dots padding |
| `MacOSSensing/Island/Drawing/IslandTimerDrawing.swift` | MODIFY | Offset content for dots padding |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **CPU threshold 5%** | Claude actively generating uses 10-80% CPU; idle readline is <1%. 5% threshold cleanly separates the two. |
| **2s poll interval** | Responsive enough for status awareness. `sysinfo` refresh is ~0.1ms — negligible overhead. |
| **3-sample rolling average** | Smooths transient CPU spikes (e.g. GC, brief I/O). Prevents flickering between Working/NeedsAttention. |
| **Max 8 dots** | Fits within compact island width (83px for 8 dots) with room for timer and waveform. |
| **8px bottom padding** | Fits 6px dots + 1px margin top/bottom. Applied to all island heights uniformly. |
| **Process name check first** | `process.name()` is always available on macOS via `proc_name()`. Exe path requires additional syscall and may be nil. |
| **Dots in both modes** | Shown in compact and expanded. Provides persistent awareness regardless of island state. |
| **8s retention for Done** | 5s visible + 3s fade gives clear "session ended" signal without lingering too long. |
| **Center-aligned dots** | Horizontally centered for visual balance. Avoids collision with left-side waveform and right-side timer. |

## Performance

- **CPU cost**: ~0.1ms per poll (sysinfo process enumeration on macOS)
- **Memory**: ~50KB for sysinfo System struct + process table
- **Render cost**: Negligible — 8 circle fills with optional shadow per frame
- **No allocations in hot path**: FFI structs are stack-allocated, Vec is reused across polls
