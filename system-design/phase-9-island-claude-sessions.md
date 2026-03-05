# LeFocus: Island Claude Code Session Indicators

**Version:** 2.1
**Date:** February 2026
**Phase:** 9 (Claude Session Monitoring)
**Status:** Implemented

---

## Overview

Adds colored dots to the Island showing the status of running Claude Code CLI sessions. When multiple Claude terminals are open (e.g. in Warp), each gets a dot: **yellow** (pulsing) = thinking, **orange** = executing tools, **green** = waiting for input, **green** (fading) = done. Sub-agent processes (Claude spawned by Claude) are automatically filtered out — only top-level sessions get dots. This gives at-a-glance awareness of all Claude sessions without switching windows.

## Architecture

```
┌─────────────────┐     ┌──────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Rust            │     │  C Shim  │     │  Swift               │     │  IslandView  │
│  ClaudeMonitor   │────>│  FFI     │────>│  FFIExports          │────>│  draw()      │
│  (poll every 2s) │     │  bridge  │     │  → IslandController  │     │  dot grid    │
└─────────────────┘     └──────────┘     └─────────────────────┘     └──────────────┘
     sysinfo                repr(C)           DispatchQueue.main         CGContext
```

### Data Flow

1. **Rust** (`claude_monitor.rs`): Background tokio task polls `sysinfo` every 2s, scanning all processes for Claude Code CLI instances
2. **Rust** (`macos_bridge.rs`): Converts `Vec<ClaudeSession>` → `Vec<ClaudeSessionFFI>` (repr(C) struct) and calls through FFI
3. **C** (`MacOSSensingFFI.c`): Passthrough from Rust extern to Swift `@_cdecl` entry point
4. **Swift** (`FFIExports.swift`): Parses C struct array into `[ClaudeSessionInfo]`, dispatches to main queue
5. **Swift** (`IslandController.swift`): Stores sessions, forwards to `IslandView`, updates window width via `IslandWindowManager`
6. **Swift** (`IslandView.swift`): Stores sessions, starts/stops thinking pulse timer, marks `needsDisplay`
7. **Swift** (`IslandClaudeDrawing.swift`): Renders colored dot grid in `draw()` — left-aligned in compact, centered in expanded

## Components

### Rust: ClaudeMonitor (`src-tauri/src/claude_monitor.rs`)

Process scanner that detects Claude Code CLI sessions and classifies their state using a 4-state model.

```rust
pub enum SessionState { Thinking, Executing, Waiting, Done }
pub struct ClaudeSession { pid: u32, state: SessionState, age_secs: f32 }
pub struct ClaudeMonitor { system, cpu_history, previous_pids, done_sessions, own_pid, poll_count }
```

**Process Detection** (`is_claude_process`):
- Checks `process.name()` for `"claude"` or `"claude-*"` prefix
- Falls back to checking `process.exe()` path contains `"claude"` (excludes `"lefocus"`)
- Catches both Homebrew installs (`/opt/homebrew/Caskroom/claude-code/...`) and Cursor extension installs (`~/.cursor/extensions/.../claude`)

**State Classification** (4-state, CPU + child-process based):
- `Executing` (orange): Has child processes — Claude is running tools/commands
- `Thinking` (yellow): No children, average CPU > 2% over last 3 samples — Claude is actively generating
- `Waiting` (green): No children, average CPU ≤ 2% — idle at prompt, waiting for user input
- `Done` (green, fading): Process exited — immediate fade over 3s, then removed

**Sub-agent filtering**: In Pass 2, any Claude process whose parent is also a Claude process is marked as a sub-agent and excluded from the output. This prevents Task tool sub-agents from inflating the dot count.

**Stable ordering**: PIDs are sorted before iteration so dots maintain consistent positions across polls (PIDs are monotonically assigned by the OS).

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
    pub state: u8,      // 0=Thinking, 1=Executing, 2=Waiting, 3=Done
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
public enum ClaudeSessionState: UInt8 { case thinking = 0, executing = 1, waiting = 2, done = 3 }
public struct ClaudeSessionInfo { pid: UInt32, state: ClaudeSessionState, ageSeconds: Float }
```

### Swift: Drawing (`IslandClaudeDrawing.swift`)

Extension on `IslandView` that renders dots in `draw()`.

**Compact mode** — left-aligned grid:
- Left margin: 22px (matches right-side waveform padding)
- 1–3 sessions: single row, 8px dots, 3px spacing
- 4 sessions: 2×2 square grid, 8px dots, 3px spacing
- 5–8 sessions: two rows, 6px dots, 3px spacing (both dot and row)
- Vertically centered at `notchCenterY`
- Max 8 dots

**Expanded mode** — centered row near bottom:
- 6px dots, 5px spacing, horizontally centered
- Positioned at y=12px from bottom

**Colors**:
| State | Color | RGB | Effect |
|-------|-------|-----|--------|
| Thinking | Yellow | `(1.0, 0.8, 0.0)` | 6px glow blur, pulsing alpha (0.5–0.9 sine wave, 1.5s period) |
| Executing | Orange | `(1.0, 0.55, 0.0)` | 6px glow blur, 0.9 alpha |
| Waiting | Green | `(52/255, 218/255, 79/255)` | 6px glow blur, 0.9 alpha |
| Done | Green | `(52/255, 218/255, 79/255)` | No glow, fading alpha |

**Thinking pulse**: A 15 Hz timer (`thinkingAnimationTimer`) drives `needsDisplay` when any session is in `.thinking` state. The timer is started/stopped dynamically to avoid unnecessary redraws.

**Done fade**: Green dots start fading immediately from 0.9 alpha to 0 over 3s. Removed after 3s total.

### Island Width — Dynamic Sizing

The island widens dynamically when Claude sessions are present to ensure dots aren't clipped by the notch.

**`compactDotsZoneWidth(for:)`** (`IslandView.swift`):
```swift
// leftMargin + dotsContent + rightPadding
return 22.0 + dotsContent + 4.0
```

**`currentIslandSize()`** (`IslandWindowManager.swift`):
When `claudeSessionCount > 0`, the dots zone width is added to the base compact width. The island is centered over the notch, so widening extends both ears equally. The `updateSessionCount(_:animated:)` method triggers an animated resize (0.15s ease-in-out).

| Sessions | Dot zone width | Compact idle width |
|----------|---------------|--------------------|
| 0 | 0px | 280px |
| 1–3 | ~48–67px | ~328–347px |
| 4 | ~48px | ~328px |
| 5–8 | ~44–59px | ~324–339px |

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src-tauri/src/claude_monitor.rs` | **NEW** | Process scanning + 4-state classification |
| `src-tauri/src/lib.rs` | MODIFY | Add `mod claude_monitor`, spawn polling task |
| `src-tauri/src/macos_bridge.rs` | MODIFY | Add `ClaudeSessionFFI` struct + bridge function |
| `CMacOSSensing/include/MacOSSensingFFI.h` | MODIFY | Add C struct + function declaration |
| `CMacOSSensing/MacOSSensingFFI.c` | MODIFY | Add passthrough to Swift |
| `MacOSSensing/FFIExports.swift` | MODIFY | Add `@_cdecl` entry point |
| `MacOSSensing/FFITypes.swift` | MODIFY | Add `ClaudeSessionFFI` typealias |
| `MacOSSensing/Island/IslandFFITypes.swift` | MODIFY | Add `ClaudeSessionState` (4-state) + `ClaudeSessionInfo` |
| `MacOSSensing/Island/IslandController.swift` | MODIFY | Add session state + update method, call `updateSessionCount` |
| `MacOSSensing/Island/IslandView.swift` | MODIFY | Add property, update method, `compactDotsZoneWidth`, thinking timer |
| `MacOSSensing/Island/IslandWindowManager.swift` | MODIFY | Dynamic width based on session count |
| `MacOSSensing/Island/Drawing/IslandClaudeDrawing.swift` | **NEW** | Dot grid rendering (compact + expanded) |
| `MacOSSensing/Island/Drawing/IslandAudioDrawing.swift` | MODIFY | Compact waveform-on-right when dots present |

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **4-state model** | Distinguishes "thinking" (LLM generating) from "executing" (running tools) via child-process detection. More informative than 2-state CPU-only. |
| **CPU threshold 2%** | Claude thinking uses 10-80% CPU; idle readline is <1%. 2% threshold cleanly separates with 3-sample smoothing. |
| **Child process = executing** | When Claude spawns subprocesses (bash, npm, etc.), it's running tools. Parent process check is cheap and reliable. |
| **Sub-agent filtering** | Claude sub-agents (spawned via Task tool) are also `claude` processes. Any Claude PID whose parent is another Claude PID is excluded from the dot display. |
| **Sorted PID iteration** | `HashSet` iteration order is non-deterministic. Sorting PIDs ensures dots maintain stable positions across polls. |
| **2s poll interval** | Responsive enough for status awareness. `sysinfo` refresh is ~0.1ms — negligible overhead. |
| **3-sample rolling average** | Smooths transient CPU spikes (e.g. GC, brief I/O). Prevents flickering between Thinking/Waiting. |
| **Max 8 dots** | Practical limit — more sessions are rare and the grid becomes hard to read. |
| **Left-aligned compact dots** | Placed in the left ear of the island, opposite the right-side waveform. Avoids collision with timer text. |
| **Dynamic island width** | Island widens when sessions are present so the left ear has room for the dot grid. Animated transition via `updateSessionCount`. |
| **22px left margin** | Matches the 22px right margin used by the waveform, giving symmetric padding. |
| **Orange for executing** | Visually distinct from yellow (thinking) while conveying active work. Blue was initially used but orange felt more natural. |
| **Green for waiting** | User preference. Green = "all good, waiting for you." Matches the `completionHighlightColor` used elsewhere. |
| **Process name check first** | `process.name()` is always available on macOS via `proc_name()`. Exe path requires additional syscall and may be nil. |
| **Dots in both modes** | Shown in compact (left-aligned grid) and expanded (centered row). Provides persistent awareness regardless of island state. |
| **3s immediate fade for Done** | Starts fading immediately on exit. Quick enough to not linger, visible enough to notice. |
| **15 Hz thinking timer** | Drives smooth sine-wave pulse animation only when needed. Timer is nil when no sessions are thinking. |

## Performance

- **CPU cost**: ~0.1ms per poll (sysinfo process enumeration on macOS)
- **Memory**: ~50KB for sysinfo System struct + process table
- **Render cost**: Negligible — 8 circle fills with optional shadow per frame
- **No allocations in hot path**: FFI structs are stack-allocated, Vec is reused across polls
- **Thinking timer**: 15 Hz redraw only active when ≥1 session is in thinking state; nil otherwise
