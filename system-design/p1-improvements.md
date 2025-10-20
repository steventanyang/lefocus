# LeFocus P1 Improvements Tracker

**Version:** 0.1
**Date:** October 2025
**Purpose:** Track potential improvements for P1 milestone (post-P0)

---

## Document Purpose

This document tracks ideas, optimizations, and features to consider **after P0 is stable and dogfooded**. Each item is a candidate for P1 - not a commitment.

**Review cadence:** After each Pomodoro session during P0 dogfooding, note pain points and add them here.

---

## Performance Optimizations

### 1. Compiled Swift Plugin
**Current (P0):** Swift script spawned via `Command` (~50-100ms overhead per call)

**Improvement:** Compile Swift to `.dylib`, link via FFI (< 1ms overhead)

**Impact:** Lower CPU usage, faster polling loop

**Complexity:** Medium (build.rs, FFI bindings)

**Priority:** Medium (only if P0 CPU usage > 5%)

---

### 2. Screenshot Caching
**Current (P0):** Capture screenshot on every window change

**Improvement:** Cache last screenshot, only re-capture if pHash comparison needed

**Impact:** ~20% fewer captures during stable focus

**Complexity:** Low

**Priority:** Low (screenshots are cheap)

---

### 3. pHash Custom Implementation
**Current (P0):** Use `image-hasher` crate

**Improvement:** Custom pHash optimized for downscaled grayscale screenshots

**Impact:** ~30% faster pHash computation

**Complexity:** High (algorithm implementation + testing)

**Priority:** Low (only if pHash is CPU bottleneck)

---

### 4. Incremental Database Writes
**Current (P0):** Batch write all readings at session end

**Improvement:** Stream readings to SQLite during session (incremental commits)

**Impact:** Session survives app crashes (no data loss)

**Complexity:** Medium (transaction handling, fsync considerations)

**Priority:** High (if users report lost sessions)

---

## Accuracy Improvements

### 5. Accessibility API Integration
**Current (P0):** Use `NSWorkspace.frontmostApplication` + ScreenCaptureKit z-order

**Improvement:** Use AXUIElement to detect truly focused window/element

**Impact:** Better accuracy when multiple windows of same app are visible

**Complexity:** Medium (Accessibility permission + API learning curve)

**Priority:** Medium (if segmentation accuracy < 90%)

**Example:**
```swift
let axApp = AXUIElementCreateApplication(pid)
var focusedWindow: AnyObject?
AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute, &focusedWindow)
```

---

### 6. OCR Accurate Mode
**Current (P0):** Vision.framework `.fast` mode

**Improvement:** Adaptive OCR - use `.accurate` mode when confidence < 0.7

**Impact:** Better OCR results for low-contrast/small text

**Complexity:** Low (just toggle `recognitionLevel`)

**Priority:** Low (only if OCR confidence frequently low)

---

### 7. Visual Change Detection Tuning
**Current (P0):** Fixed thresholds (pHash ≥ 12, SSIM < 0.75)

**Improvement:** Adaptive thresholds based on app type (code editor vs browser vs Figma)

**Impact:** Fewer false positives/negatives

**Complexity:** Medium (need per-app heuristics)

**Priority:** Medium (if segmentation has frequent false switches)

---

## Multi-Display & Spaces

### 8. Multi-Monitor Tracking
**Current (P0):** Track frontmost window (any display)

**Improvement:** Record which display window is on, show in summary

**Impact:** Summary shows "85% on main display, 15% on secondary"

**Complexity:** Low (SCWindow has `.frame`, map to screen)

**Priority:** Low (nice-to-have for multi-monitor users)

**Data model change:**
```rust
struct WindowMetadata {
    window_id: u32,
    display_id: u32,  // NEW
    // ...
}
```

---

### 9. Spaces/Virtual Desktop Tracking
**Current (P0):** Space switch = new window = new segment (implicit)

**Improvement:** Explicitly track Space/Desktop ID, show in summary

**Impact:** "You switched desktops 8 times this session"

**Complexity:** High (no public API for Space ID)

**Priority:** Low (implicit tracking is good enough)

---

### 10. Minimized/Hidden Window Handling
**Current (P0):** Minimized window = context switch to whatever is active

**Improvement:** Detect "minimized" vs "switched away", mark as interruption

**Impact:** Distinguish intentional breaks from window switches

**Complexity:** Medium (track window lifecycle events)

**Priority:** Low (current behavior acceptable)

---

## Context Intelligence (Semantic P1)

### 11. CLIP Embeddings
**Current (P0):** No semantic understanding of screenshots

**Improvement:** Run CLIP on screenshots, cluster by visual similarity

**Impact:** "You spent 40% on 'coding interfaces', 30% on 'documentation'"

**Complexity:** High (CLIP model + inference, ~200 MB model)

**Priority:** Medium (high value, but requires ML integration)

**Dependencies:** Need local CLIP inference (e.g., `tract` or `candle`)

---

### 12. App Category Detection
**Current (P0):** Show app name (e.g., "Chrome", "VS Code")

**Improvement:** Map apps to categories ("Development", "Communication", "Entertainment")

**Impact:** Summary shows category breakdown, not just app list

**Complexity:** Low (hardcoded mapping + bundle ID heuristics)

**Priority:** Medium (nice visualization improvement)

**Example:**
```rust
fn get_app_category(bundle_id: &str) -> &str {
    match bundle_id {
        "com.microsoft.VSCode" => "Development",
        "com.google.Chrome" => "Web", // Could sub-categorize by URL
        "com.slack" => "Communication",
        _ => "Other"
    }
}
```

---

### 13. Local LLM Summarization
**Current (P0):** Hardcoded caption ("You spent most time in VS Code")

**Improvement:** Use local LLM (e.g., llama.cpp) to generate natural summary

**Impact:** "You focused on refactoring the sensing pipeline, with brief checks on Slack"

**Complexity:** Very High (LLM integration, 2-4 GB model, inference time)

**Priority:** Low (cool, but heavy for P1)

---

## UI & UX Enhancements

### 14. Timeline Scrubber
**Current (P0):** Static stacked bar chart

**Improvement:** Interactive timeline - scrub to see screenshot thumbnails at each timestamp

**Impact:** Visual playback of session

**Complexity:** High (UI work + thumbnail storage)

**Priority:** Medium (mentioned in PRD, high UX value)

**Note:** Would need to persist screenshot thumbnails (privacy concern - encrypted?)

---

### 15. Real-Time Focus Indicator
**Current (P0):** Silent during session, summary at end

**Improvement:** Optional subtle indicator (e.g., menu bar icon color changes on context switch)

**Impact:** Gentle awareness of switching behavior

**Complexity:** Low (Tauri system tray API)

**Priority:** Low (contradicts "invisible during session" principle)

**Requires:** User preference toggle

---

### 16. Session History View
**Current (P0):** No way to view past sessions

**Improvement:** List past sessions, click to view summary

**Impact:** Track focus patterns over time

**Complexity:** Low (UI + SQLite queries)

**Priority:** Medium (natural next step after P0)

---

### 17. Export Summary
**Current (P0):** Summary only in app

**Improvement:** Export summary as PNG/PDF/Markdown

**Impact:** Share focus reports, journal integration

**Complexity:** Medium (rendering to image/file)

**Priority:** Low (nice-to-have)

---

## Audio Integration

### 18. Ambient Sound During Session
**Current (P0):** Audio code exists but not integrated

**Improvement:** Optional ambient sound (binaural, rain, brown noise) during Pomodoro

**Impact:** Enhanced focus environment

**Complexity:** Low (already implemented, just wire up)

**Priority:** High (easy win, code already exists)

---

### 19. Sound Cues for Timer Events
**Current (P0):** No audio feedback

**Improvement:** Subtle chime on timer start/end

**Impact:** Better awareness of session boundaries

**Complexity:** Low (use existing audio engine)

**Priority:** Low (nice-to-have)

---

## Data & Privacy

### 20. Encrypted Screenshot Storage
**Current (P0):** Screenshots dropped after pHash/OCR

**Improvement:** Option to save encrypted screenshots for timeline scrubbing

**Impact:** Enables timeline replay while preserving privacy

**Complexity:** High (encryption, key management, storage)

**Priority:** Medium (required for timeline scrubber)

---

### 21. Session Retention Policy
**Current (P0):** Keep all sessions forever

**Improvement:** Auto-delete sessions older than N days (user configurable)

**Impact:** Bounded database growth

**Complexity:** Low (SQLite DELETE + VACUUM)

**Priority:** Low (P0 DB stays small)

---

### 22. Sensitive Window Detection
**Current (P0):** Capture all windows equally

**Improvement:** Blacklist apps (e.g., Password Manager, Banking), auto-blur screenshots

**Impact:** Enhanced privacy for sensitive workflows

**Complexity:** Medium (detect + skip/blur)

**Priority:** Medium (important for trust)

**Example:**
```rust
const SENSITIVE_BUNDLES: &[&str] = &[
    "com.1password.1password",
    "com.lastpass.LastPass",
    // ...
];
```

---

## System Integration

### 23. Notion Integration
**Current (P0):** No external integration

**Improvement:** Auto-create Notion page with session summary

**Impact:** Seamless journaling workflow

**Complexity:** High (Notion API, OAuth, task inference)

**Priority:** Low (mentioned in PRD, but complex)

---

### 24. Calendar Integration
**Current (P0):** Manual timer start

**Improvement:** Auto-start timer based on calendar events (e.g., "Deep Work" blocks)

**Impact:** Fully automated focus tracking

**Complexity:** High (macOS Calendar API, event matching)

**Priority:** Low (nice-to-have automation)

---

### 25. Shortcut Key Binding
**Current (P0):** Click to start timer

**Improvement:** Global hotkey to start/stop (e.g., Cmd+Shift+F)

**Impact:** Faster timer control

**Complexity:** Low (Tauri global shortcut API)

**Priority:** Medium (quality of life improvement)

---

## Reliability & Error Handling

### 26. Permission Pre-Check
**Current (P0):** Fail on first screenshot attempt

**Improvement:** Check permissions on app launch, guide user proactively

**Impact:** Better onboarding

**Complexity:** Low (query permissions, show modal)

**Priority:** High (better UX)

---

### 27. Graceful Degradation Modes
**Current (P0):** OCR fails → silent, confidence = 0

**Improvement:** Explicit degraded mode indicators ("Running without OCR")

**Impact:** User awareness of reduced functionality

**Complexity:** Low (UI indicator)

**Priority:** Low (current behavior acceptable)

---

### 28. Session Recovery
**Current (P0):** App crash = session lost

**Improvement:** Auto-save session state every 60s, recover on restart

**Impact:** No data loss on crashes

**Complexity:** Medium (state serialization)

**Priority:** High (if crashes occur during dogfooding)

---

## Performance Monitoring

### 29. Built-in Telemetry
**Current (P0):** Manual CPU/RAM monitoring (Activity Monitor)

**Improvement:** Built-in performance dashboard (CPU, RAM, battery per session)

**Impact:** Easier performance validation

**Complexity:** Low (sysinfo crate)

**Priority:** Low (dev tool, not user-facing)

---

### 30. Adaptive Polling
**Current (P0):** Fixed 5s polling interval

**Improvement:** Slow down polling when on battery or low resources detected

**Impact:** Better battery life

**Complexity:** Low (detect battery state, adjust interval)

**Priority:** Medium (if battery impact > 3%)

---

## Testing & Quality

### 31. Synthetic Testing Framework
**Current (P0):** Manual testing only

**Improvement:** Automated tests with fake window switches, screenshots

**Impact:** Faster iteration, fewer regressions

**Complexity:** High (need to mock macOS APIs)

**Priority:** Low (manual testing sufficient for P0)

---

### 32. Segmentation Algorithm Visualization
**Current (P0):** Manual review of segment boundaries

**Improvement:** Dev tool to visualize segmentation decisions (timeline with thresholds)

**Impact:** Easier algorithm tuning

**Complexity:** Medium (visualization UI)

**Priority:** Low (dev tool)

---

## Miscellaneous

### 33. Dark Mode UI
**Current (P0):** Basic UI, no theme

**Improvement:** Proper dark/light mode support

**Complexity:** Low (CSS + system theme detection)

**Priority:** Low (polish)

---

### 34. Custom Session Durations
**Current (P0):** 25 min Pomodoro only

**Improvement:** User-configurable durations (15m, 25m, 50m, custom)

**Impact:** Flexibility for different workflows

**Complexity:** Low (UI + state)

**Priority:** Medium (easy, high user value)

---

### 35. Pause/Resume Session
**Current (P0):** Can pause timer, but sensing stops

**Improvement:** Keep sensing during paused timer (track "break time" separately)

**Impact:** Capture entire work session including breaks

**Complexity:** Medium (separate break segments)

**Priority:** Low (current behavior is simpler)

---

## Decision Framework

When evaluating P1 ideas:
1. **Impact:** Does this solve a real pain point from dogfooding?
2. **Complexity:** Can we ship it in < 2 weeks?
3. **Dependencies:** Does it require heavy dependencies (LLM, ML models)?
4. **Philosophy:** Does it align with "invisible, deterministic, local" principles?

**Prioritization:**
- **High:** Fixes user pain, low complexity, aligns with vision
- **Medium:** Nice-to-have, moderate complexity
- **Low:** Cool but not essential, or very high complexity

---

**End of P1 Improvements Tracker**

Total items: 35
Next review: After 1 week of P0 dogfooding
