# LeFocus P1 - Phase 5: Dynamic Island Foundation

**Goal**: Create a macOS-style floating overlay window with smooth animations, hover interactions, and a decorative waveform visualization.

**Timeline**: Week 1 (5-7 days)

**Success Criteria**:

- Floating window appears at top-center of screen, always on top
- Smooth transitions between collapsed (140x38px) and expanded (320x120px) states
- Animated decorative waveform visible in collapsed state
- Expanded state shows timer, Stop Session button, and settings icon
- Zero impact on existing timer functionality

---

## 1. Architecture Overview

### 1.1 Component Structure

```
┌─────────────────────────────────────────────┐
│           React Frontend Layer               │
├─────────────────────────────────────────────┤
│  DynamicIsland.tsx                          │
│  ├─ IslandCollapsed.tsx                     │
│  │  └─ DecorativeWaveform.tsx               │
│  └─ IslandExpanded.tsx                      │
│     ├─ TimerDisplay.tsx (reused)            │
│     ├─ StopButton.tsx                       │
│     └─ SettingsIcon.tsx                     │
└─────────────────────────────────────────────┘
           ↕ Tauri Events (timer-state-changed / timer-heartbeat)
┌─────────────────────────────────────────────┐
│            Tauri Rust Backend               │
├─────────────────────────────────────────────┤
│  Window Manager (new)                       │
│  ├─ create_island_window()                  │
│  ├─ resize_and_center()                     │
│  └─ sync_island_with_timer()                │
│                                             │
│  Timer Controller (existing)                │
│  └─ No changes needed                       │
└─────────────────────────────────────────────┘
```

### 1.2 Window Architecture

**Two-Window System**:

1. **Main Window** (existing): Full app UI for session history, settings, etc.
2. **Island Window** (new): Floating overlay, frameless, always-on-top

**Window Isolation**:

- Island window runs same React app but mounts `<DynamicIsland>` component
- Main window mounts `<App>` component
- Both listen to same Tauri events (timer state shared automatically)

---

## 2. Technical Specifications

### 2.1 Island Window Configuration

**Tauri Window Settings** (Tauri 2.x):

```rust
use tauri::{Manager, Window};
use tauri::window::WindowBuilder;

// Note: Tauri 2.x uses WindowBuilder differently
// Window URL is set via navigate() after creation
pub fn create_island_window(app: &tauri::AppHandle) -> Result<Window, tauri::Error> {
    let window = WindowBuilder::new(
        app,
        "island",
        tauri::window::WindowUrl::App("/island".into())
    )
    .title("LeFocus Island")
    .inner_size(140.0, 38.0)  // Start collapsed
    .resizable(false)
    .decorations(false)       // Frameless
    .transparent(true)        // For rounded corners
    .always_on_top(true)
    .skip_taskbar(true)       // Don't show in Cmd+Tab
    .visible_on_all_workspaces(true)
    .focused(false)           // Don't steal focus on show
    .build()?;

    Ok(window)
}
```

**Positioning Logic**:

```rust
fn resize_and_center(window: &Window, width: f64, height: f64) -> Result<(), tauri::Error> {
    window.set_size(PhysicalSize::new(width, height))?;

    if let Some(monitor) = window.current_monitor()? {
        let monitor_size = monitor.size();
        let x = (monitor_size.width as f64 / 2.0) - (width / 2.0);
        let y = 10.0;
        window.set_position(PhysicalPosition::new(x as i32, y as i32))?;
    }

    Ok(())
}
```

**Window Lifecycle**:

- Created when app launches (alongside main window)
- Always visible when app is open; starts collapsed even when timer is idle
- Expands on hover interaction (click-to-expand deferred)
- Auto-collapses when mouse leaves (returns to collapsed state)
- Timer updates drive displayed time/content but never hide the window
- Note: React handles idle vs running visuals while the backend keeps the window resident

### 2.2 UI State Machine

**States**:

1. **Collapsed**: Default state (140x38px) shown at launch and whenever the pointer is not hovering
2. **Expanded**: Hover state (320x120px) revealing controls

**Transitions**:

```
Collapsed ──[hover]──────> Expanded
Expanded ──[unhover]─────> Collapsed
```

Timer events update content (timer text, session labels) but do not change visibility.

**Native Window Sync**: Each hover transition triggers `invoke('update_island_state', { state })`, which resizes the Tauri window (140×38px ↔ 320×120px) and recenters it so the UI stays aligned with the physical window.

**No Warning State**: Phase 5 only implements collapsed/expanded. Warning state comes in Phase 6 (App Awareness).

### 2.3 Visual Specifications

#### Collapsed State (140x38px)

```
┌──────────────────────────────────────┐
│  ╭──────────────────────────────╮   │
│  │  🎵 ▁▃▂▅▃▁▄▂  25:00  ▁▂▃▁▄▂ │   │
│  ╰──────────────────────────────╯   │
└──────────────────────────────────────┘
   140px width × 38px height

   Elements:
   - Background: Semi-transparent dark (rgba(28, 28, 30, 0.85))
   - Border radius: 19px (perfect pill shape)
   - Backdrop blur: 20px
   - Waveform: 8-12 animated bars (both sides)
   - Timer: Center, white text, 14px font
```

#### Expanded State (320x120px)

```
┌──────────────────────────────────────────────┐
│  ╭──────────────────────────────────────╮   │
│  │                                      │   │
│  │          ⚙️                          │   │
│  │                                      │   │
│  │            25:00                     │   │
│  │        Focus Session                 │   │
│  │                                      │   │
│  │   🎵 ▁▃▂▅▃▁▄▂▃▁▅▂▄▁▃▂▅▃▁▄▂ 🎵      │   │
│  │                                      │   │
│  │        [  Stop Session  ]            │   │
│  │                                      │   │
│  ╰──────────────────────────────────────╯   │
└──────────────────────────────────────────────┘
   320px width × 120px height

   Elements:
   - Settings icon: Top-right (16px)
   - Timer: 32px font, centered
   - Session type: 12px font, gray
   - Waveform: Full width, 20-24 bars
   - Stop button: 120x36px, red on hover
```

**Animation Specs**:

- State transition: 300ms ease-in-out
- Window resize: Invoke Rust command to resize window (140x38 → 320x120) and re-center so the island stays anchored
- Waveform bars: Random height animation, 1-2s per cycle, staggered

### 2.4 Decorative Waveform Algorithm

**Purpose**: Visual feedback that makes the Island feel "alive" without real audio data.

**Implementation**:

```typescript
interface WaveformBar {
  id: number;
  height: number; // 0-100 (percentage)
  animationDelay: number; // 0-2000ms
  animationDuration: number; // 1000-2000ms
}

// Generate 8 bars for collapsed, 24 for expanded
function generateWaveform(barCount: number): WaveformBar[] {
  return Array.from({ length: barCount }, (_, i) => ({
    id: i,
    height: Math.random() * 70 + 20, // 20-90% range
    animationDelay: Math.random() * 2000,
    animationDuration: 1000 + Math.random() * 1000,
  }));
}
```

**CSS Animation**:

```css
@keyframes pulse {
  0%,
  100% {
    height: var(--min-height);
  }
  50% {
    height: var(--max-height);
  }
}

.waveform-bar {
  animation: pulse var(--duration) ease-in-out infinite;
  animation-delay: var(--delay);
}
```

**Randomization**: Each bar independently cycles between random min/max heights, creating organic wave-like motion.

---

## 3. Implementation Plan

### 3.1 Rust Backend (Tauri)

**New Files**:

- `src-tauri/src/window/island.rs` - Island window management

**Code Structure**:

```rust
// src-tauri/src/window/island.rs

use serde::Deserialize;
use tauri::{AppHandle, Manager, Window};
use tauri::window::{WindowBuilder, WindowUrl};
use tauri::PhysicalPosition;
use tauri::PhysicalSize;

const ENABLE_LOGS: bool = true;
use crate::{log_error, log_info, log_warn};

pub fn create_island_window(app: &tauri::AppHandle) -> Result<Window, tauri::Error> {
    let window = WindowBuilder::new(
        app,
        "island",
        WindowUrl::App("/island".into())
    )
    .title("LeFocus Island")
    .inner_size(140.0, 38.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible_on_all_workspaces(true)
    .focused(false)
    .build()?;

    resize_and_center(&window, 140.0, 38.0)?;

    // Window stays visible; frontend handles idle presentation

    Ok(window)
}

fn resize_and_center(window: &Window, width: f64, height: f64) -> Result<(), tauri::Error> {
    if let Err(e) = window.set_size(PhysicalSize::new(width, height)) {
        log_error!("Failed to set island window size: {}", e);
        return Err(e);
    }

    if let Some(monitor) = window.current_monitor()? {
        let size = monitor.size();
        let x = (size.width as f64 / 2.0) - (width / 2.0);
        let y = 10.0;  // 10px from top
        if let Err(e) = window.set_position(PhysicalPosition::new(x as i32, y as i32)) {
            log_error!("Failed to set island window position: {}", e);
            return Err(e);
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IslandState {
    Collapsed,
    Expanded,
}

#[tauri::command]
pub fn update_island_state(app: AppHandle, state: IslandState) -> Result<(), String> {
    if let Some(window) = app.get_window("island") {
        let result = match state {
            IslandState::Collapsed => resize_and_center(&window, 140.0, 38.0),
            IslandState::Expanded => resize_and_center(&window, 320.0, 120.0),
        };

        result.map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[derive(Deserialize)]
struct TimerStateChangedPayload {
    state: crate::timer::TimerState,
    remaining_ms: i64,
}

// Event listeners for timer state
pub fn sync_island_with_timer(app: &tauri::AppHandle) {
    let Some(window) = app.get_window("island") else {
        log_warn!("Island window not found when setting up timer sync");
        return;
    };

    let window = window.clone();

    app.listen("timer-state-changed", move |event| {
        if let Some(payload) = event.payload() {
            match serde_json::from_str::<TimerStateChangedPayload>(payload) {
                Ok(payload) => {
                    if let Err(e) = window.show() {
                        log_error!("Failed to show island window: {}", e);
                    }

                    if !matches!(payload.state.status, crate::timer::TimerStatus::Running) {
                        if let Err(e) = resize_and_center(&window, 140.0, 38.0) {
                            log_error!("Failed to reset island window size: {}", e);
                        }
                    }
                }
                Err(err) => {
                    log_error!("Failed to parse timer-state-changed payload: {}", err);
                }
            }
        }
    });
}
```

**Integration**:

```rust
// src-tauri/src/lib.rs

mod window;

// In the run() function, add to setup closure:
.setup(|app| {
    // ... existing setup code ...

    // Create island window (new)
    if let Err(e) = window::island::create_island_window(&app.handle()) {
        log_error!("Failed to create island window: {}", e);
        // Don't fail app startup if island window fails
    } else {
        window::island::sync_island_with_timer(&app.handle());
    }

    Ok(())
})
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    window::island::update_island_state,
])
```

**Note**: Ensure `window` module is declared in `lib.rs`:

```rust
mod window;
```

### 3.2 React Frontend

**New Files**:

- `src/components/DynamicIsland/DynamicIsland.tsx` - Main container
- `src/components/DynamicIsland/IslandCollapsed.tsx` - Collapsed UI
- `src/components/DynamicIsland/IslandExpanded.tsx` - Expanded UI
- `src/components/DynamicIsland/DecorativeWaveform.tsx` - Animated waveform
- `src/components/DynamicIsland/types.ts` - Type definitions
- `src/pages/Island.tsx` - Island window entry point

**Routing**:

```tsx
// src/App.tsx or router config

function App() {
  const isIslandWindow = window.location.pathname === "/island";

  if (isIslandWindow) {
    return <IslandPage />;
  }

  return <MainApp />; // Existing app
}
```

**Component Structure**:

```tsx
// src/pages/Island.tsx

import { DynamicIsland } from "../components/DynamicIsland/DynamicIsland";

export function IslandPage() {
  return (
    <div className="island-container">
      <DynamicIsland />
    </div>
  );
}
```

```tsx
// src/components/DynamicIsland/DynamicIsland.tsx

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IslandCollapsed } from "./IslandCollapsed";
import { IslandExpanded } from "./IslandExpanded";
import { useTimerSnapshot } from "../../hooks/useTimerSnapshot";

type IslandState = "collapsed" | "expanded";

export function DynamicIsland() {
  const [state, setState] = useState<IslandState>("collapsed");
  const { timerState } = useTimerSnapshot(); // Uses actual hook implementation

  if (!timerState) {
    return null; // Wait for initial snapshot
  }

  const setIslandState = async (next: IslandState) => {
    if (next === state) return;

    setState(next);
    try {
      await invoke("update_island_state", { state: next });
    } catch (error) {
      console.error("Failed to update island state:", error);
    }
  };

  const handleMouseEnter = () => setIslandState("expanded");
  const handleMouseLeave = () => setIslandState("collapsed");

  const isRunning = timerState.state.status === "running";

  return (
    <div
      className={`bg-[rgba(28,28,30,0.85)] backdrop-blur-[20px] rounded-[19px] transition-all duration-300 ease-in-out shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${
        state === "collapsed" ? "w-[140px] h-[38px]" : "w-[320px] h-[120px]"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {state === "collapsed" ? (
        <IslandCollapsed remainingMs={timerState.remaining_ms} />
      ) : (
        <IslandExpanded remainingMs={timerState.remaining_ms} isRunning={isRunning} />
      )}
    </div>
  );
}
```

```tsx
// src/components/DynamicIsland/IslandCollapsed.tsx

import { DecorativeWaveform } from "./DecorativeWaveform";

interface Props {
  remainingMs: number; // milliseconds
}

export function IslandCollapsed({ remainingMs }: Props) {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center justify-center gap-2 h-full px-2">
      <DecorativeWaveform barCount={8} />
      <div className="text-white text-sm font-medium tabular-nums">
        {formatTime(remainingMs)}
      </div>
      <DecorativeWaveform barCount={8} />
    </div>
  );
}
```

```tsx
// src/components/DynamicIsland/IslandExpanded.tsx

import { DecorativeWaveform } from "./DecorativeWaveform";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  remainingMs: number; // milliseconds
  isRunning: boolean;
}

export function IslandExpanded({ remainingMs, isRunning }: Props) {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const handleStopSession = async () => {
    if (!isRunning) {
      return;
    }

    try {
      await invoke("end_timer"); // Correct command name
    } catch (error) {
      console.error("Failed to stop session:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full px-4 relative">
      <div className="absolute top-2 right-4 text-gray-400 text-sm">⚙️</div>

      <div className="flex flex-col items-center gap-1">
        <div className="text-white text-[32px] font-semibold tabular-nums">
          {formatTime(remainingMs)}
        </div>
        <div className="text-gray-400 text-xs">Focus Session</div>
      </div>

      <DecorativeWaveform barCount={24} />

      <button
        className="bg-[rgba(239,68,68,0.1)] text-red-500 border border-[rgba(239,68,68,0.3)] px-6 py-2 rounded-lg transition-all duration-200 hover:bg-[rgba(239,68,68,0.2)] hover:border-[rgba(239,68,68,0.5)] text-sm font-medium"
        onClick={handleStopSession}
        disabled={!isRunning}
        aria-disabled={!isRunning}
      >
        Stop Session
      </button>
    </div>
  );
}
```

```tsx
// src/components/DynamicIsland/DecorativeWaveform.tsx

import { useMemo } from "react";

interface WaveformBar {
  id: number;
  minHeight: number;
  maxHeight: number;
  duration: number;
  delay: number;
}

interface Props {
  barCount: number;
}

export function DecorativeWaveform({ barCount }: Props) {
  const bars = useMemo(() => {
    return Array.from({ length: barCount }, (_, i) => ({
      id: i,
      minHeight: 20 + Math.random() * 20, // 20-40%
      maxHeight: 60 + Math.random() * 30, // 60-90%
      duration: 1000 + Math.random() * 1000, // 1-2s
      delay: Math.random() * 2000, // 0-2s
    }));
  }, [barCount]);

  return (
    <div className="flex items-center gap-0.5 h-5">
      {bars.map((bar) => (
        <div
          key={bar.id}
          className="w-[3px] bg-gradient-to-b from-blue-500 to-blue-700 rounded-sm"
          style={
            {
              minHeight: `${bar.minHeight}%`,
              maxHeight: `${bar.maxHeight}%`,
              animation: `waveform-pulse ${bar.duration}ms ease-in-out infinite`,
              animationDelay: `${bar.delay}ms`,
              height: `${bar.minHeight}%`,
              "--min-height": `${bar.minHeight}%`,
              "--max-height": `${bar.maxHeight}%`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
```

**Styling** (Tailwind CSS):

All styling is done with Tailwind utility classes. No separate CSS file needed.

**Tailwind Configuration** (if needed in `tailwind.config.js`):

For the custom pulse animation with variable heights, add the keyframes to your Tailwind config (see Animation Note below).

**Key Tailwind Classes Used**:

- Container: `bg-[rgba(28,28,30,0.85)] backdrop-blur-[20px] rounded-[19px]` - Semi-transparent dark background with blur
- Transitions: `transition-all duration-300 ease-in-out` - Smooth state transitions
- Collapsed state: `w-[140px] h-[38px]` - Fixed small pill size
- Expanded state: `w-[320px] h-[120px]` - Fixed expanded size
- Waveform container: `flex items-center gap-0.5 h-5` - Flexbox layout for bars
- Waveform bars: `w-[3px] bg-gradient-to-b from-blue-500 to-blue-700 rounded-sm` - Gradient bars
- Timer text: `text-white text-sm font-medium tabular-nums` - White text with monospace numbers
- Timer large: `text-[32px] font-semibold tabular-nums` - Large timer display
- Stop button: `bg-[rgba(239,68,68,0.1)] text-red-500 border border-[rgba(239,68,68,0.3)]` - Red-themed button

**Animation Note**:

The waveform bars use inline styles for custom animation timing (dynamic duration/delay per bar). Since Tailwind's built-in `animate-pulse` doesn't support custom height ranges, we define a custom CSS keyframe animation. Add this to your global CSS file (e.g., `src/index.css` or `src/App.css`):

```css
@keyframes waveform-pulse {
  0%,
  100% {
    height: var(--min-height, 20%);
  }
  50% {
    height: var(--max-height, 80%);
  }
}
```

Then update the DecorativeWaveform component to use this keyframe:

```tsx
// In DecorativeWaveform.tsx, update the style prop:
style={{
  minHeight: `${bar.minHeight}%`,
  maxHeight: `${bar.maxHeight}%`,
  animation: `waveform-pulse ${bar.duration}ms ease-in-out infinite`,
  animationDelay: `${bar.delay}ms`,
  height: `${bar.minHeight}%`,
  '--min-height': `${bar.minHeight}%`,
  '--max-height': `${bar.maxHeight}%`,
} as React.CSSProperties}
```

Alternatively, if you want to keep everything in Tailwind, you can add the keyframes to `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      keyframes: {
        "waveform-pulse": {
          "0%, 100%": { height: "var(--min-height)" },
          "50%": { height: "var(--max-height)" },
        },
      },
      animation: {
        "waveform-pulse": "waveform-pulse var(--duration) ease-in-out infinite",
      },
    },
  },
};
```

The `motion-safe:` prefix ensures animations are disabled when `prefers-reduced-motion` is set. However, since we're using inline styles for the animation, we need to handle this differently. Use a hook to check:

```tsx
// In DecorativeWaveform.tsx
import { useEffect, useState } from 'react';

export function DecorativeWaveform({ barCount }: Props) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // ... rest of component

  // Then conditionally apply animation in style prop:
  style={{
    ...(prefersReducedMotion ? {} : {
      animation: `waveform-pulse ${bar.duration}ms ease-in-out infinite`,
      animationDelay: `${bar.delay}ms`,
    }),
    minHeight: `${bar.minHeight}%`,
    maxHeight: `${bar.maxHeight}%`,
    height: `${bar.minHeight}%`,
    '--min-height': `${bar.minHeight}%`,
    '--max-height': `${bar.maxHeight}%`,
  } as React.CSSProperties}
}
```

Alternatively, add a global CSS rule: `@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }` to disable all animations.

### 3.3 Shared State Management

**Timer Hook** (update to match actual implementation):

```tsx
// src/hooks/useTimerSnapshot.ts (reuse existing hook)

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerSnapshot } from "../types/timer";

export function useTimerSnapshot() {
  const [timerState, setTimerState] = useState<TimerSnapshot | null>(null);
  const [error, setError] = useState<string>("");

  const applySnapshot = useCallback((snapshot: TimerSnapshot) => {
    setTimerState((prev) => {
      // Equality check to avoid unnecessary re-renders
      if (
        prev?.remaining_ms === snapshot.remaining_ms &&
        prev?.state.status === snapshot.state.status &&
        prev?.state.session_id === snapshot.state.session_id
      ) {
        return prev;
      }
      return snapshot;
    });
  }, []);

  // Fetch initial state on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchInitialState() {
      try {
        const snapshot = await invoke<TimerSnapshot>("get_timer_state");
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to get timer state: ${err}`);
        }
      }
    }

    fetchInitialState();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  // Listen to timer-state-changed events
  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>(
      "timer-state-changed",
      (event) => {
        applySnapshot(event.payload);
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [applySnapshot]);

  // Listen to timer-heartbeat events
  useEffect(() => {
    const unlistenPromise = listen<TimerSnapshot>(
      "timer-heartbeat",
      (event) => {
        applySnapshot(event.payload);
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [applySnapshot]);

  return { timerState, error, setError };
}
```

**Note**: Island window uses the same `useTimerSnapshot` hook as main window. Timer state automatically syncs via events. `TimerSnapshot` contains `state: TimerState` and `remaining_ms: i64` (milliseconds).

---

## 4. Testing Plan

### 4.1 Visual Testing Checklist

- [ ] Window appears at correct position (top-center, 10px from top)
- [ ] Window stays on top of all other windows
- [ ] Rounded corners render correctly with transparency
- [ ] Backdrop blur works on macOS
- [ ] Collapsed state: 140x38px with centered timer
- [ ] Expanded state: 320x120px with all elements visible
- [ ] Hover transition is smooth (300ms)
- [ ] Waveform bars animate independently
- [ ] Timer updates every second
- [ ] Stop button works and stops timer
- [ ] Window remains visible (collapsed) when timer stops
- [ ] Window persists across workspace changes

### 4.2 Edge Cases

1. **Multi-Monitor Setup**: Island appears on active monitor
2. **Monitor Disconnect**: Island repositions to new primary monitor
3. **Notch Detection**: On MacBook Pro 14"/16", island sits below notch (10px from top is safe)
4. **Window Manager Conflicts**: Island stays on top of other always-on-top apps (test with Spotlight, etc.)
5. **Rapid Hover**: No animation jank when quickly moving mouse in/out

### 4.3 Performance Testing

**Metrics**:

- CPU usage with island visible: <2% (decorative animation only)
- Memory: <50MB for island window
- Animation frame rate: 60fps (smooth waveform)

**Tools**:

- macOS Activity Monitor
- Chrome DevTools (React DevTools for component re-renders)

---

## 5. Dependencies & Prerequisites

### 5.1 Dependencies

**New npm packages**: None (use existing React, Tailwind, Tauri APIs)

**Tauri Configuration**:

```json
// src-tauri/tauri.conf.json

{
  "tauri": {
    "windows": [
      {
        "title": "LeFocus",
        "width": 800,
        "height": 600
      }
      // Island window created programmatically in Rust
    ],
    "allowlist": {
      "window": {
        "all": true, // Allow window manipulation
        "setPosition": true,
        "setSize": true
      }
    }
  }
}
```

**Rust crates**: Ensure `serde` and `serde_json` are included (they're already used elsewhere; otherwise add them) so timer payloads can be deserialized safely.

### 5.2 Prerequisites

- **macOS 12+**: Transparent windows work best on newer macOS versions
- **Tauri 2.x**: Project uses Tauri 2.x (confirmed in Cargo.toml)
- **Existing timer system**: Must emit `timer-state-changed` and `timer-heartbeat` events
- **Window module**: Create `src-tauri/src/window/mod.rs` to export island module

---

## 6. Risks & Mitigations

### 6.1 Technical Risks

| Risk                                      | Impact | Mitigation                                  |
| ----------------------------------------- | ------ | ------------------------------------------- |
| Window positioning fails on multi-monitor | Medium | Fallback to primary monitor center          |
| Backdrop blur unsupported (older macOS)   | Low    | Falls back to solid background              |
| Animation performance issues              | Medium | Reduce bar count if FPS drops below 30      |
| Window not always on top                  | High   | Test with common apps, adjust z-index logic |
| Hover state flickers                      | Low    | Add 100ms debounce on mouse leave           |

### 6.2 UX Risks

| Risk                                   | Impact | Mitigation                                    |
| -------------------------------------- | ------ | --------------------------------------------- |
| Island feels "dead" without real audio | Medium | Make decorative waveform visually interesting |
| Users don't discover hover interaction | Medium | Add subtle glow/shadow on hover approach      |
| Island blocks important UI             | High   | Allow dragging to reposition (future)         |

---

## 7. Future Considerations (Post-Phase 5)

**Phase 6 Integration Points**:

- Warning state UI (red tint, blocked app message)
- Settings icon opens app config panel
- Island color customization per app

**Phase 7 Integration Points**:

- Real audio data replaces decorative waveform
- `audio_level` events update waveform heights
- Audio permission handling UI

**Potential Enhancements**:

- Drag to reposition island
- Click timer to expand (in addition to hover)
- Animations when transitioning focus→break
- Progress ring around island edge

---

## 8. Success Metrics

**Functional**:

- ✅ Island window stays visible and reflects timer state
- ✅ Hover expands, unhover collapses
- ✅ Stop button successfully ends session
- ✅ Timer display updates in real-time

**Performance**:

- ✅ <2% CPU usage during idle animation
- ✅ 60fps animation frame rate
- ✅ <50MB memory footprint

**Polish**:

- ✅ Smooth 300ms transitions
- ✅ Visually appealing waveform animation
- ✅ Matches macOS design language (rounded, blurred, minimal)

---

## 9. Development Timeline

**Day 1-2**: Rust window creation + positioning

- Create `island.rs` module
- Implement window builder with correct config
- Test positioning on single/multi-monitor setups
- Wire up timer event listener to keep island collapsed when idle

**Day 3-4**: React components + basic styling

- Create component structure (DynamicIsland, Collapsed, Expanded)
- Implement routing for `/island` path
- Add Tailwind styles for collapsed/expanded states
- Test hover transitions

**Day 5-6**: Waveform animation + polish

- Build `DecorativeWaveform` component
- Implement CSS animations with randomization
- Fine-tune timing, colors, shadows
- Performance testing

**Day 7**: Testing + bug fixes

- Multi-monitor testing
- Edge case testing (rapid hover, workspace switching)
- Visual polish (alignment, spacing, colors)
- Documentation

---

## 10. Open Questions

1. **Settings Icon Behavior**: Should it open main window? Show inline menu? (Defer to Phase 6)
2. **Draggable Island**: Should users be able to reposition? (Not in Phase 5, consider for future)
3. **Click to Expand**: Should clicking also expand, or only hover? (Only hover for now)
4. **Animation Accessibility**: Should we respect `prefers-reduced-motion`? (Yes, disable waveform animation if set - implemented in CSS)

---

## 11. Gap 9 Research: Tauri 2.x Event Listening in Rust

**Research Findings**:

After reviewing the codebase and Tauri 2.x documentation:

1. **Event Emission**: The timer controller emits events using `app_handle.emit()` or `app.emit_all()`. This pattern is consistent across Tauri versions.

2. **Event Listening in Rust**: In Tauri 2.x, event listeners in Rust can be set up using:

   - `app.listen(event_name, handler)` - Sets up a listener for the current app instance
   - `app.listen_global(event_name, handler)` - Listens to events from all windows
   - The handler receives an `Event` object with `payload()` method

3. **Async Considerations**: The `sync_island_with_timer()` function uses `app.listen()` synchronously. Window operations (`show()`, `set_size()`, `set_position()`) return `Result<()>`, so this pattern works.

4. **Closure Capturing**: The current implementation clones the window reference into the closure. This is necessary because the closure needs to outlive the function scope. However, there's a potential issue: if the window is closed before the listener is set up, `window_handle` will be `None`.

5. **Recommended Pattern**:
   - Use `app.listen()` (not `listen_global`) since we only want to handle events for this app instance
   - Clone the window reference before setting up the listener
   - Handle the case where window might not exist yet
   - Use proper error logging with the logging macros

**Implementation Note**: The code example in section 3.1 shows the correct pattern for Tauri 2.x, but note that window cloning and lifetime management may need adjustment based on actual runtime behavior. Consider testing window lifecycle scenarios.

---

## Appendix: Code References

**Key Files to Modify**:

- `src-tauri/src/lib.rs` - Add island window setup in setup() closure
- `src-tauri/src/window/mod.rs` - Create module file to export island module
- `src/App.tsx` - Add routing for island window (check window label or pathname)
- `src/hooks/useTimerSnapshot.ts` - Already exists and works correctly, no changes needed

**Key Files to Create**:

- `src-tauri/src/window/mod.rs` - Module declaration
- `src-tauri/src/window/island.rs` - Island window management
- `src/components/DynamicIsland/DynamicIsland.tsx`
- `src/components/DynamicIsland/IslandCollapsed.tsx`
- `src/components/DynamicIsland/IslandExpanded.tsx`
- `src/components/DynamicIsland/DecorativeWaveform.tsx`
- `src/pages/Island.tsx`

**Note**: No CSS file needed - all styling uses Tailwind utility classes.

**No Changes Required**:

- Timer controller logic
- Database layer
- Sensing pipeline
- Swift plugin (not used in Phase 5)
