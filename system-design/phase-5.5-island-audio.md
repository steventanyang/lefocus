# LeFocus: Dynamic Island Audio Controls

**Version:** 2.0
**Date:** January 2025
**Phase:** 5.5 (Audio Enhancement)
**Status:** ✅ Implemented
**Approach:** AppleScript Probes + CVDisplayLink Waveform + CGS Space Management

---

## ⚠️ IMPORTANT: Implementation vs Original Design

This document has been **updated to reflect the actual implementation**. Key differences from the original design:

### Architectural Changes
1. **File Organization**: Audio components live in `Island/Audio/` subfolder
2. **New Components**: `IslandWindowManager`, `IslandAudioController`, `IslandSpaceManager`, `IslandTimerPresenter`
3. **Media Detection**: AppleScript probes (not ScriptingBridge) with MPNowPlayingInfoCenter fallback
4. **Animation**: CVDisplayLink (not CADisplayLink) for display-synced waveform rendering
5. **Space Management**: Private CGS APIs to persist island across Mission Control transitions
6. **Delegation Pattern**: Extensive use of protocols for clean separation of concerns

### Component Hierarchy
```
IslandController (top-level coordinator)
├── IslandWindowManager (frame & sizing)
├── IslandTimerPresenter (timer logic)
├── IslandAudioController (audio bridge)
│   ├── MediaMonitor (detection)
│   │   └── MediaControlCoordinator (playback control)
│   └── WaveformAnimator (CVDisplayLink-driven animation)
└── IslandSpaceManager (CGS space persistence)
```

### Why These Changes?
- **Simpler**: AppleScript is lighter than ScriptingBridge, no framework imports needed
- **More Performant**: CVDisplayLink provides better display synchronization
- **Better Architecture**: Clear separation of concerns with dedicated managers
- **Persistent**: CGS space manager keeps island visible across Mission Control gestures

---

## Document Purpose

This document specifies the design and implementation of **audio playback controls and visualization** for the LeFocus Dynamic Island. This enhancement adds system-wide media control capabilities with an animated (synthetic) audio waveform visualization.

**Goal:** Extend the existing Dynamic Island to:
1. Detect and control any playing audio (Spotify, Apple Music, Chrome, Safari, etc.)
2. Display play/pause, previous/next track controls
3. Show an animated audio waveform on the right side when expanded (visual flair, not true spectrum analysis)
4. Combine timer + audio in a unified view when both are active
5. Click to expand, hover for visual feedback, auto-collapse when mouse leaves

**Success Criteria:** The island detects playing audio within 500ms, controls respond instantly, the synthetic waveform animates smoothly at 30+ FPS, CPU overhead stays ≤2%, and the combined timer+audio view is intuitive and uncluttered.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Media Detection & Control](#3-media-detection--control)
4. [Audio Waveform Visualization](#4-audio-waveform-visualization)
5. [UI States & Layouts](#5-ui-states--layouts)
6. [Interaction System](#6-interaction-system)
7. [Combined Timer + Audio View](#7-combined-timer--audio-view)
8. [Swift Implementation](#8-swift-implementation)
9. [FFI Bridge Layer](#9-ffi-bridge-layer)
10. [Performance & Optimization](#10-performance--optimization)
11. [Testing Strategy](#11-testing-strategy)
12. [Future Enhancements](#12-future-enhancements)

---

## 1. Overview

### 1.1 What We Are Building

An **audio control interface** integrated into the existing Dynamic Island that provides:

- **Compact state**: Small audio indicator icon when audio is playing (combined with timer if active)
- **Expanded state** (on click): Full media controls + animated waveform visualization
  - Album artwork thumbnail (left)
  - Track title and artist (center-left)
  - Play/pause, previous, next buttons (center)
  - Animated waveform (right side; synthetic visualization)
  - Timer display (top-right if timer is active)
- **Hover state**: Island grows slightly to indicate it's clickable
- **Auto-collapse**: Returns to compact state when mouse moves away

### 1.2 Visual Reference

Based on the provided screenshots:

**Compact state with audio:**
```
┌────────────────────────────────────┐
│  🎵  24:38                         │  ← Timer on left, audio icon
└────────────────────────────────────┘
```

**Expanded state:**
```
┌──────────────────────────────────────────────────────────────────┐
│  🖼️  One Dance                    ⏮  ⏸  ⏭       ▓▒░▓▒░▓   24:38 │
│     Drake                                         ░▓▒▓▒░▓        │
└──────────────────────────────────────────────────────────────────┘
```

### 1.3 Technical Approach

**Media Detection:**
- Use `MPNowPlayingInfoCenter` for metadata when available
- Poll/AppleScript Spotify & Music for richer data when necessary
- Fall back to checking running apps (Spotify, Apple Music, etc.) if needed

**Audio Visualization:**
- Use a procedural animation driven by timers/CADisplayLink to simulate waveform motion
- Vary animation parameters based on playback state (paused vs playing) and track energy metadata when available
- Render frequency bars as an animated waveform visualization (30-60 FPS)

**State Management:**
- Swift maintains audio playback state (playing/paused, track info)
- Coordinates with existing timer state from Phase 5
- Handles expansion/collapse animations and user interactions

### 1.4 Integration with Existing Island

This builds on **Phase 5: Island Timer** (phase-5-island-timer.md):
- Reuses `IslandController` and `IslandView` as base classes
- Extends view layout to accommodate audio controls
- Adds new state: `isExpanded`, `hasAudio`, `audioInfo`
- Preserves all existing timer functionality

### 1.5 Out of Scope (v1)

- Multiple audio sources displayed simultaneously
- Playlist/queue visualization
- Volume control (future enhancement)
- Lyrics display
- Opening Spotify when play is pressed with no audio (documented in Future section)
- Scrubbing/seeking through tracks
- Custom EQ or audio effects

---

## 2. Architecture

### 2.1 Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        IslandView                            │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Timer Display│  │ Audio Controls  │  │   Waveform     │ │
│  │              │  │                 │  │   Visualizer   │ │
│  └──────────────┘  └─────────────────┘  └────────────────┘ │
│                                                              │
└────────────────────────┬───────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                     IslandController                         │
│                                                              │
│  - Coordinates all island components                         │
│  - Delegates to specialized managers                         │
│  - Handles expansion/collapse state                          │
└───┬────────────┬─────────────┬──────────────────┬──────────┘
    │            │             │                  │
    ↓            ↓             ↓                  ↓
┌────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────────┐
│ Island │ │ Island   │ │ IslandAudio  │ │ IslandSpace      │
│ Window │ │ Timer    │ │ Controller   │ │ Manager          │
│ Manager│ │ Presenter│ │              │ │                  │
│        │ │          │ │              │ │ - CGS space      │
│ - Size │ │ - Clock  │ │ - Waveform   │ │ - Mission Ctrl   │
│ - Frame│ │ - Render │ │ - Media      │ │   persistence    │
└────────┘ └──────────┘ └──────┬───────┘ └──────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ↓                       ↓
           ┌──────────────────┐    ┌──────────────────────┐
           │  MediaMonitor    │    │  WaveformAnimator    │
           │                  │    │                      │
           │  - Track changes │    │  - CVDisplayLink    │
           │  - AppleScript   │    │  - Procedural bars  │
           │  - MPNowPlaying  │    │  - Playback states  │
           └──────────────────┘    └──────────────────────┘
                    │
                    ↓
           ┌──────────────────────┐
           │ MediaControl         │
           │ Coordinator          │
           │                      │
           │  - AppleScript cmds  │
           │  - Media key fallbck │
           └──────────────────────┘
```

### 2.2 Data Flow

**Media Detection:**
1. `MediaMonitor` polls every 1 second on background queue
2. Probes Spotify via AppleScript (highest priority)
3. Falls back to Apple Music via AppleScript
4. Falls back to `MPNowPlayingInfoCenter` for generic apps
5. Snapshot captured on background queue, applied on main queue
6. `IslandAudioController` receives track updates via delegate
7. Controller forwards to `IslandController` which updates view

**User Interaction:**
1. User hovers over island → `IslandView` mouseEntered fires
2. View notifies `IslandController` via `IslandViewInteractionDelegate`
3. Controller updates hover state, triggers `IslandWindowManager` to animate size
4. User clicks → `islandViewDidRequestToggleExpansion` delegate method called
5. Controller toggles expansion state, animates window via `IslandWindowManager`
6. Waveform starts animating when expanded
7. User moves mouse away → `mouseExited` fires
8. View requests collapse with 0.3s delay via delegate
9. Controller schedules collapse work item, auto-collapses after delay

**Audio Control:**
1. User clicks play/pause button in expanded IslandView
2. View detects hit test on button rect, calls `islandViewDidRequestPlayPause` delegate
3. Controller forwards to `IslandAudioController.togglePlayback()`
4. Audio controller calls `MediaMonitor.togglePlayback()`
5. Monitor calls `MediaControlCoordinator` with current bundle ID
6. Coordinator tries AppleScript command for Spotify/Music
7. Falls back to media key simulation if AppleScript fails
8. Monitor refreshes metadata on next 1-second poll cycle

**Waveform Rendering:**
1. `IslandAudioController` starts `WaveformAnimator` when track detected
2. Animator creates `CVDisplayLink` (not CADisplayLink) for display-synced updates
3. Display link callback dispatches to main queue for each frame
4. Animator updates procedural bar values with noise + sine waves
5. Animator calls `onFrame` callback with new bar array
6. `IslandAudioController` receives bars, forwards to `IslandController`
7. Controller updates `IslandView` which renders bars on next draw cycle

### 2.3 State Management

**IslandController coordinates state across components:**

```swift
// IslandController holds references to:
private let windowManager: IslandWindowManager
private let timerPresenter: IslandTimerPresenter
private let audioController: IslandAudioController

// And maintains local state:
private var latestTimerUpdate: IslandTimerPresenter.DisplayUpdate?
private var currentTrack: TrackInfo?
private var waveformBars: [CGFloat] = []
private var isExpanded: Bool = false
private var isHovering: Bool = false
private var collapseWorkItem: DispatchWorkItem?
```

**IslandView maintains:**
```swift
private var displayMs: Int64 = 0
private var mode: IslandMode = .countdown
private var isIdle: Bool = true
private var trackInfo: TrackInfo?
private var isAudioPlaying: Bool = false
private var waveformBars: [CGFloat] = []
private var isExpanded: Bool = false
private var isHovered: Bool = false
```

**TrackInfo model:**
```swift
public struct TrackInfo: Equatable {
    public let title: String
    public let artist: String
    public let artwork: NSImage?
    public let isPlaying: Bool
    public let timestamp: Date
    public let sourceBundleID: String?
}
```

### 2.4 Priority System for Multiple Audio Sources

The implementation uses a **simple priority waterfall** in `MediaMonitor.captureSnapshot()`:

**Priority order:**
1. **Spotify** (checked first via AppleScript probe)
2. **Apple Music** (checked second via AppleScript probe)
3. **Generic sources** (MPNowPlayingInfoCenter fallback)

**Implementation:**
```swift
private func captureSnapshot() -> MediaSnapshot? {
    // Priority 1: Spotify
    if let spotify = spotifyProbe.snapshot() {
        return MediaSnapshot(track: spotify, bundleID: spotify.sourceBundleID)
    }

    // Priority 2: Apple Music
    if let music = musicProbe.snapshot() {
        return MediaSnapshot(track: music, bundleID: music.sourceBundleID)
    }

    // Priority 3: Generic (Chrome, Safari, etc.)
    if let generic = nowPlayingSnapshot() {
        return MediaSnapshot(track: generic, bundleID: generic.sourceBundleID)
    }

    return nil
}
```

**Note:** The system always prefers Spotify over Apple Music, regardless of which started more recently. This is intentional for consistent UX.

---

## 3. Media Detection & Control

### 3.1 System-Wide Media Detection

The implementation uses **AppleScript-based probes** for Spotify and Apple Music, with MPNowPlayingInfoCenter as a fallback for other apps. This approach is simpler than ScriptingBridge and doesn't require additional frameworks.

**Architecture:**
1. Poll every 1 second via `Timer` scheduled on main run loop
2. Execute snapshot capture on background queue (`pollingQueue`)
3. Probe Spotify → Apple Music → MPNowPlayingInfoCenter in priority order
4. Apply snapshot on main queue to update UI

**Key implementation details:**
```swift
public final class MediaMonitor {
    public static let shared = MediaMonitor()

    private let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    private let controlCoordinator = MediaControlCoordinator()
    private let spotifyProbe = SpotifyMetadataProbe()
    private let musicProbe = MusicMetadataProbe()
    private let pollingQueue = DispatchQueue(label: "MacOSSensing.MediaMonitor.polling", qos: .userInitiated)

    private var metadataTimer: Timer?
    private var currentTrack: TrackInfo?
    public private(set) var activeBundleID: String?
    public var onTrackChange: ((TrackInfo?) -> Void)?

    public func startMonitoring() {
        guard metadataTimer == nil else { return }
        startMetadataTimer()
        refreshMetadata()
    }

    private func startMetadataTimer() {
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshMetadata()
        }
        RunLoop.main.add(timer, forMode: .common)
        metadataTimer = timer
    }

    private func refreshMetadata() {
        pollingQueue.async { [weak self] in
            guard let self else { return }
            let snapshot = self.captureSnapshot()
            DispatchQueue.main.async {
                self.apply(snapshot: snapshot)
            }
        }
    }

    private func apply(snapshot: MediaSnapshot?) {
        activeBundleID = snapshot?.bundleID
        guard snapshot?.track != currentTrack else { return }
        currentTrack = snapshot?.track
        onTrackChange?(currentTrack)
    }
}
```

**AppleScript Probes:**
```swift
private struct SpotifyMetadataProbe: MediaAppProbe {
    private static let separator = "||LEFOCUS_SPOTIFY||"

    func snapshot() -> TrackInfo? {
        guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
        guard !response.isEmpty else { return nil }
        let components = response.components(separatedBy: Self.separator)
        guard components.count >= 3 else { return nil }

        let isPlaying = components[2].lowercased() == "playing"
        guard components[0].isEmpty == false || components[1].isEmpty == false else {
            return nil
        }

        return TrackInfo(
            title: components[0].isEmpty ? "Unknown" : components[0],
            artist: components[1].isEmpty ? "Unknown" : components[1],
            artwork: nil,
            isPlaying: isPlaying,
            sourceBundleID: "com.spotify.client"
        )
    }

    private static let script = """
    set separator to "\(SpotifyMetadataProbe.separator)"
    if application "Spotify" is not running then
        return ""
    end if
    tell application "Spotify"
        if player state is stopped then
            return ""
        end if
        set trackName to name of current track
        set trackArtist to artist of current track
        set trackState to player state as string
        return trackName & separator & trackArtist & separator & trackState
    end tell
    """
}
```

### 3.2 Hybrid Media Control

The implementation uses **system-defined media key events** as the fallback instead of CGEvent key injection. This approach is more reliable and doesn't require accessibility permissions.

**Two-tier strategy:**
1. **AppleScript for Spotify/Music** – direct app control with `playpause`, `next track`, `previous track`
2. **NSEvent.systemDefined media keys** – universal fallback for all other apps

```swift
final class MediaControlCoordinator {
    private let appleScriptController = AppleScriptMediaController()
    private let mediaKeyController = MediaKeyController()

    func togglePlayback(for bundleID: String?) {
        if appleScriptController.perform(.toggle, bundleID: bundleID) { return }
        mediaKeyController.playPause()
    }

    func skipToNext(for bundleID: String?) {
        if appleScriptController.perform(.next, bundleID: bundleID) { return }
        mediaKeyController.nextTrack()
    }

    func skipToPrevious(for bundleID: String?) {
        if appleScriptController.perform(.previous, bundleID: bundleID) { return }
        mediaKeyController.previousTrack()
    }
}
```

**AppleScript Controller:**
```swift
private final class AppleScriptMediaController {
    func perform(_ command: MediaCommand, bundleID: String?) -> Bool {
        guard let bundleID, let source = script(for: command, bundleID: bundleID) else {
            return false
        }
        return AppleScriptRunner.execute(source)
    }

    private func script(for command: MediaCommand, bundleID: String) -> String? {
        switch (bundleID, command) {
        case ("com.spotify.client", .toggle):
            return #"tell application "Spotify" to playpause"#
        case ("com.spotify.client", .next):
            return #"tell application "Spotify" to next track"#
        case ("com.spotify.client", .previous):
            return #"tell application "Spotify" to previous track"#
        case ("com.apple.Music", .toggle):
            return #"tell application "Music" to playpause"#
        case ("com.apple.Music", .next):
            return #"tell application "Music" to next track"#
        case ("com.apple.Music", .previous):
            return #"tell application "Music" to previous track"#
        default:
            return nil
        }
    }
}
```

**Media Key Controller (NSEvent-based):**
```swift
private final class MediaKeyController {
    private enum MediaKey: Int32 {
        case playPause = 16   // NX_KEYTYPE_PLAY
        case next = 17        // NX_KEYTYPE_NEXT
        case previous = 18    // NX_KEYTYPE_PREVIOUS
    }

    func playPause() { send(.playPause) }
    func nextTrack() { send(.next) }
    func previousTrack() { send(.previous) }

    private func send(_ key: MediaKey) {
        let flags = NSEvent.ModifierFlags(rawValue: 0xA00)
        let dataDown = Int((key.rawValue << 16) | (0xA << 8))
        let dataUp = Int((key.rawValue << 16) | (0xB << 8))

        guard let downEvent = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: flags,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: dataDown,
            data2: -1
        ), let upEvent = NSEvent.otherEvent(
            with: .systemDefined,
            location: .zero,
            modifierFlags: flags,
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            subtype: 8,
            data1: dataUp,
            data2: -1
        ) else {
            return
        }

        downEvent.cgEvent?.post(tap: .cghidEventTap)
        upEvent.cgEvent?.post(tap: .cghidEventTap)
    }
}
```

**AppleScript Helper:**
```swift
enum AppleScriptRunner {
    static func execute(_ source: String) -> Bool {
        guard let script = NSAppleScript(source: source) else {
            return false
        }
        var error: NSDictionary?
        script.executeAndReturnError(&error)
        return error == nil
    }

    static func evaluateString(_ source: String) -> String? {
        guard let script = NSAppleScript(source: source) else {
            return nil
        }
        var error: NSDictionary?
        let descriptor = script.executeAndReturnError(&error)
        guard error == nil else { return nil }
        return descriptor.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
```

**Permissions:** Add `NSAppleEventsUsageDescription` to Info.plist. Users will be prompted to grant automation permission on first use.

---

## 4. Audio Waveform Visualization

### 4.1 Animated Waveform Strategy

Because macOS does not expose system-wide audio samples to sandboxed apps, the waveform will be **purely decorative**. The animation should reinforce that audio is playing without implying scientific accuracy.

Key principles:
- When audio is playing, render an energetic looping animation that feels loosely synced to track tempo.
- When paused, dramatically reduce bar movement (e.g., slow pulse) so users can tell playback halted.
- When no audio is detected, fade the waveform area out entirely.

### 4.2 Procedural Waveform Animator

We drive the animation with `CADisplayLink` (preferred) or a 60 FPS timer. The animator maintains a small buffer of bar values and updates them each frame using simple noise plus easing toward target amplitudes.

```swift
import QuartzCore

final class WaveformAnimator {
    static let shared = WaveformAnimator()

    private let barCount: Int = 20
    private var displayLink: CADisplayLink?

    private var currentBars: [CGFloat] = Array(repeating: 0.1, count: 20)
    private var targetBars: [CGFloat] = Array(repeating: 0.1, count: 20)
    private var phase: CGFloat = 0

    var state: PlaybackVisualState = .stopped {
        didSet { updateTargetsForState() }
    }

    var onFrame: (([CGFloat]) -> Void)?

    private init() {}

    func start() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(step))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    func stop() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func step() {
        phase += 0.12

        for index in 0..<barCount {
            let noise = CGFloat.random(in: -0.15...0.15)
            let wave = sin(phase + CGFloat(index) * 0.4)
            let base = targetBars[index]
            let next = base + wave * 0.1 + noise
            currentBars[index] = currentBars[index] * 0.7 + max(0.05, next) * 0.3
        }

        onFrame?(currentBars)
    }

    private func updateTargetsForState() {
        switch state {
        case .playing:
            targetBars = (0..<barCount).map { index in
                0.4 + 0.25 * sin(CGFloat(index) * 0.3)
            }
        case .paused:
            targetBars = Array(repeating: 0.15, count: barCount)
        case .stopped:
            targetBars = Array(repeating: 0.05, count: barCount)
        }
    }
}

enum PlaybackVisualState {
    case playing
    case paused
    case stopped
}
```

### 4.3 Rendering Waveform Bars

Rendering stays the same; we simply feed the view the animated amplitudes:

```swift
class IslandView: NSView {
    private var waveformBars: [CGFloat] = Array(repeating: 0.05, count: 20)

    func updateWaveform(_ bars: [CGFloat]) {
        waveformBars = bars
        setNeedsDisplay(calculateWaveformRect())
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        // ... existing timer/audio drawing ...
        if isExpanded {
            drawWaveform()
        }
    }

    private func drawWaveform() {
        let waveformRect = calculateWaveformRect()
        let barWidth: CGFloat = 3
        let barSpacing: CGFloat = 2
        let maxBarHeight = waveformRect.height - 8

        for (index, magnitude) in waveformBars.enumerated() {
            let x = waveformRect.minX + CGFloat(index) * (barWidth + barSpacing)
            let height = max(4, magnitude * maxBarHeight)
            let y = waveformRect.midY - height / 2

            let barRect = NSRect(x: x, y: y, width: barWidth, height: height)
            let hue = CGFloat(index) / CGFloat(waveformBars.count) * 0.6
            NSColor(calibratedHue: hue, saturation: 0.8, brightness: 0.9, alpha: 0.8).setFill()
            NSBezierPath(roundedRect: barRect, xRadius: 1.5, yRadius: 1.5).fill()
        }
    }

    private func calculateWaveformRect() -> NSRect {
        // Right 120px of expanded view
        NSRect(
            x: bounds.maxX - 120,
            y: bounds.minY + 8,
            width: 100,
            height: bounds.height - 16
        )
    }
}
```

---

## 5. UI States & Layouts

### 5.1 State Definitions

The island has 4 primary states:

1. **Timer Only (Compact)**: Timer active, no audio
   - Width: 180px, Height: 36px
   - Shows: Timer countdown/stopwatch

2. **Audio Only (Compact)**: Audio playing, no timer
   - Width: 200px, Height: 36px
   - Shows: Small album art + track title + audio icon

3. **Timer + Audio (Compact)**: Both active
   - Width: 240px, Height: 36px
   - Shows: Timer (left) + audio icon (right)

4. **Expanded**: User clicked to expand
   - Width: 600px, Height: 80px
   - Shows: Album art + track info + controls + waveform + timer (if active)

### 5.2 Layout Specifications

#### Compact State Layouts

**Timer Only:**
```
┌─────────────────────┐
│      24:38          │
└─────────────────────┘
```

**Audio Only:**
```
┌──────────────────────────┐
│ 🖼️ One Dance - Drake  🎵 │
└──────────────────────────┘
```

**Timer + Audio:**
```
┌───────────────────────────────┐
│  24:38            🎵          │
└───────────────────────────────┘
```

#### Expanded State Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  🖼️  One Dance                       ⏮  ⏸  ⏭         ║▌│▌║    24:38      │
│     Drake                                              ▌║▌│║              │
└────────────────────────────────────────────────────────────────────────────┘
│←60→│←────200────→│←─────120──→│←────100───→│←─60→│
  ^        ^              ^             ^          ^
  Art   Track Info    Controls      Waveform    Timer
```

**Dimensions:**
- Expanded width: 600px
- Expanded height: 80px
- Album art: 44x44px (8px padding)
- Track info area: 200px
- Controls area: 120px (3 buttons @ 36px each)
- Waveform area: 100px
- Timer area: 60px (only if timer active)

### 5.3 Hover State Visual Feedback

When hovering (not expanded):
- Scale: 1.0 → 1.05 (smooth animation, 150ms)
- Shadow: increase blur radius by 2px
- Cursor: changes to pointer
- Border: subtle glow effect (optional)

### 5.4 Transition Animations

**Compact → Expanded:**
- Duration: 250ms
- Easing: ease-out
- Width: animate from compact width to 600px
- Height: animate from 36px to 80px
- Alpha: fade in controls/waveform (200ms delay)

**Expanded → Compact:**
- Duration: 200ms
- Easing: ease-in
- Trigger: mouse exits bounds + 300ms delay
- Alpha: fade out controls/waveform first (100ms)
- Width/height: animate to compact size

---

## 6. Interaction System

### 6.1 Click-to-Expand Mechanism

```swift
class IslandView: NSView {
    private var isExpanded: Bool = false
    private var collapseTimer: Timer?

    override func mouseDown(with event: NSEvent) {
        toggleExpansion()
    }

    private func toggleExpansion() {
        isExpanded.toggle()

        if isExpanded {
            expandToFullView()
        } else {
            collapseToCompactView()
        }
    }

    private func expandToFullView() {
        // Cancel any pending collapse
        collapseTimer?.invalidate()
        collapseTimer = nil

        // Start waveform animation
        WaveformAnimator.shared.state = .playing
        WaveformAnimator.shared.start()

        // Animate expansion
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.25
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window?.animator().setFrame(expandedFrame, display: true)
        })

        // Fade in controls after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            self.showControls(animated: true)
        }
    }

    override func mouseExited(with event: NSEvent) {
        if isExpanded {
            scheduleCollapse()
        }
        isHovered = false
        needsDisplay = true
    }

    private func scheduleCollapse() {
        collapseTimer?.invalidate()
        collapseTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in
            self?.collapseToCompactView()
        }
    }

    private func collapseToCompactView() {
        isExpanded = false

        // Stop waveform analyzer to save CPU
        WaveformAnimator.shared.stop()

        // Fade out controls first
        hideControls(animated: true)

        // Animate collapse after fade
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = 0.2
                context.timingFunction = CAMediaTimingFunction(name: .easeIn)
                self.window?.animator().setFrame(self.compactFrame, display: true)
            })
        }
    }
}
```

### 6.2 Button Hit Testing

In expanded state, user can click buttons:

```swift
class IslandView: NSView {
    private var playPauseButton: ButtonArea!
    private var previousButton: ButtonArea!
    private var nextButton: ButtonArea!

    private struct ButtonArea {
        let rect: NSRect
        let action: () -> Void
        var isHovered: Bool = false
    }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)

        // Check if clicking a button in expanded state
        if isExpanded {
            if playPauseButton.rect.contains(location) {
                playPauseButton.action()
                return
            }
            if previousButton.rect.contains(location) {
                previousButton.action()
                return
            }
            if nextButton.rect.contains(location) {
                nextButton.action()
                return
            }
        }

        // Otherwise toggle expansion
        toggleExpansion()
    }

    override func mouseMoved(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)

        // Update button hover states
        playPauseButton.isHovered = playPauseButton.rect.contains(location)
        previousButton.isHovered = previousButton.rect.contains(location)
        nextButton.isHovered = nextButton.rect.contains(location)

        needsDisplay = true
    }
}
```

### 6.3 Preventing Click-Through

Ensure expanded island doesn't collapse when clicking buttons:

```swift
override func mouseExited(with event: NSEvent) {
    // Only schedule collapse if mouse truly left bounds
    // Don't collapse if just moving between buttons
    let location = event.locationInWindow
    let bounds = convert(self.bounds, to: nil)

    if !bounds.contains(location) {
        if isExpanded {
            scheduleCollapse()
        }
    }
}
```

---

## 7. Combined Timer + Audio View

### 7.1 Layout Strategy

When both timer and audio are active:

**Compact state:**
- Timer on left (primary focus)
- Audio icon on right (indicates audio is available)
- Click expands to show both

**Expanded state:**
- Timer in top-right corner (compact display)
- Audio controls dominate center (main content)
- Waveform on right side
- All elements visible simultaneously

### 7.2 Visual Hierarchy

Priority in combined view:
1. **Primary**: Audio controls (user expanded to see these)
2. **Secondary**: Waveform (visual interest, passive)
3. **Tertiary**: Timer (still visible but less prominent)

### 7.3 Implementation

```swift
class IslandView: NSView {
    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        if isExpanded {
            drawExpandedView()
        } else {
            drawCompactView()
        }
    }

    private func drawExpandedView() {
        // Background
        drawNotchPath()

        // Left: Album artwork (if audio active)
        if hasAudio {
            drawAlbumArt(in: albumArtRect)
            drawTrackInfo(in: trackInfoRect)
            drawMediaControls(in: controlsRect)
            drawWaveform(in: waveformRect)
        }

        // Top-right: Timer (if timer active)
        if isTimerActive {
            drawCompactTimer(in: timerCompactRect)
        }
    }

    private func drawCompactView() {
        drawNotchPath()

        if isTimerActive && hasAudio {
            // Combined: timer left, audio icon right
            drawTimerText(in: timerLeftRect)
            drawAudioIndicator(in: audioRightRect)
        } else if isTimerActive {
            // Timer only
            drawTimerText(in: timerCenterRect)
        } else if hasAudio {
            // Audio only
            drawMiniTrackInfo(in: bounds)
        }
    }

    private var albumArtRect: NSRect {
        NSRect(x: 8, y: (bounds.height - 44) / 2, width: 44, height: 44)
    }

    private var trackInfoRect: NSRect {
        NSRect(x: 60, y: 0, width: 200, height: bounds.height)
    }

    private var controlsRect: NSRect {
        NSRect(x: 260, y: 0, width: 120, height: bounds.height)
    }

    private var waveformRect: NSRect {
        NSRect(x: 380, y: 0, width: 100, height: bounds.height)
    }

    private var timerCompactRect: NSRect {
        // Top-right corner in expanded view
        NSRect(x: bounds.maxX - 68, y: bounds.height - 28, width: 60, height: 20)
    }
}
```

---

## 7.5. Island Space Manager (CGS Persistence)

### 7.5.1 Problem Statement

macOS Mission Control and full-screen transitions can hide or displace floating windows. The Dynamic Island needs to remain visible across:
- Mission Control gestures (swipe up with 3/4 fingers)
- Desktop switching (swipe left/right)
- Full-screen app transitions
- Dock/menu bar auto-hide

### 7.5.2 Solution: Private CGS API

The implementation uses **private Core Graphics Services (CGS) APIs** to create a dedicated "space" with maximum absolute level. This ensures the island windows persist across all system transitions.

**Key concepts:**
- Create a persistent CGS space with `CGSSpaceCreate()`
- Set space to maximum level with `CGSSpaceSetAbsoluteLevel()`
- Add island windows to this space
- Space persists even when user switches desktops or enters Mission Control

### 7.5.3 Implementation

```swift
final class IslandSpaceManager {
    static let shared = IslandSpaceManager()

    private var spaceIdentifier: CGSSpaceID?
    private let registeredWindows = NSHashTable<NSWindow>.weakObjects()

    func attach(window: NSWindow?) {
        guard let window else { return }
        // Retry logic handles window number not yet assigned
        attach(window: window, retriesRemaining: 5)
    }

    private func attach(window: NSWindow?, retriesRemaining: Int) {
        guard let window else { return }
        assertMainThread()

        if window.windowNumber == -1 {
            guard retriesRemaining > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak window] in
                self?.attach(window: window, retriesRemaining: retriesRemaining - 1)
            }
            return
        }

        registeredWindows.add(window)
        guard let space = ensureSpace(),
              let windowID = windowID(for: window) else { return }
        addWindows([windowID], to: space)
    }

    private func ensureSpace() -> CGSSpaceID? {
        if let existing = spaceIdentifier {
            return existing
        }

        let connection = _CGSDefaultConnection()
        let space = CGSSpaceCreate(connection, 1, nil)
        guard space != 0 else {
            NSLog("IslandSpaceManager: failed to create CGS space")
            return nil
        }

        logIfCGSError(
            CGSSpaceSetAbsoluteLevel(connection, space, Int32.max),
            context: "CGSSpaceSetAbsoluteLevel"
        )
        logIfCGSError(
            CGSShowSpaces(connection, [NSNumber(value: space)] as CFArray),
            context: "CGSShowSpaces"
        )
        spaceIdentifier = space
        return space
    }

    func teardown() {
        guard let space = spaceIdentifier else { return }
        let windows = registeredWindows.allObjects.compactMap { windowID(for: $0) }
        if !windows.isEmpty {
            removeWindows(windows, from: space)
        }
        registeredWindows.removeAllObjects()
        logIfCGSError(
            CGSHideSpaces(_CGSDefaultConnection(), [NSNumber(value: space)] as CFArray),
            context: "CGSHideSpaces"
        )
        logIfCGSError(
            CGSSpaceDestroy(_CGSDefaultConnection(), space),
            context: "CGSSpaceDestroy"
        )
        spaceIdentifier = nil
    }
}
```

**Private API declarations:**
```swift
private typealias CGSConnectionID = UInt32
private typealias CGSSpaceID = UInt64
private typealias CGSWindowID = UInt32

@_silgen_name("_CGSDefaultConnection")
private func _CGSDefaultConnection() -> CGSConnectionID

@_silgen_name("CGSSpaceCreate")
private func CGSSpaceCreate(_ connection: CGSConnectionID, _ options: Int32, _ attributes: CFDictionary?) -> CGSSpaceID

@_silgen_name("CGSSpaceDestroy")
private func CGSSpaceDestroy(_ connection: CGSConnectionID, _ space: CGSSpaceID) -> Int32

@_silgen_name("CGSSpaceSetAbsoluteLevel")
private func CGSSpaceSetAbsoluteLevel(_ connection: CGSConnectionID, _ space: CGSSpaceID, _ level: Int32) -> Int32

@_silgen_name("CGSAddWindowsToSpaces")
private func CGSAddWindowsToSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32

@_silgen_name("CGSRemoveWindowsFromSpaces")
private func CGSRemoveWindowsFromSpaces(_ connection: CGSConnectionID, _ windows: CFArray, _ spaces: CFArray) -> Int32
```

### 7.5.4 Usage Pattern

```swift
// In IslandWindowManager.ensureWindowHierarchy()
if let parentWindow {
    parentWindow.setFrame(screen.frame, display: true)
    parentWindow.orderFrontRegardless()
    IslandSpaceManager.shared.attach(window: parentWindow)
}

if let islandPanel = islandWindow {
    islandPanel.setFrame(islandFrame(for: screen, size: currentIslandSize()), display: true)
    islandPanel.orderFrontRegardless()
    IslandSpaceManager.shared.attach(window: islandPanel)
}
```

### 7.5.5 Risks & Considerations

**⚠️ Warning: These are private APIs**
- Not documented by Apple
- May break in future macOS versions
- App Store rejection risk (if submitted)
- Use `@_silgen_name` declarations to avoid binary dependencies

**Mitigation:**
- Graceful degradation if APIs fail (island still works, just might hide during transitions)
- Error logging for debugging
- Retry logic for window attachment timing issues

---

## 8. Swift Implementation

### 8.1 Actual File Structure

The implementation organizes audio components in a dedicated subfolder for better modularity:

```
src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/
├── IslandController.swift                # Top-level coordinator
├── IslandView.swift                      # UI rendering + interaction
├── IslandWindowManager.swift             # NSPanel hierarchy + sizing
├── IslandTimerPresenter.swift            # Timer logic + 1s render loop
├── IslandSpaceManager.swift              # CGS space persistence
├── IslandFFITypes.swift                  # FFI data structures
└── Audio/                                # Audio subsystem
    ├── IslandAudioController.swift       # Bridges MediaMonitor + WaveformAnimator
    ├── MediaMonitor.swift                # Detection polling + priority waterfall
    ├── MediaControlCoordinator.swift     # AppleScript + media key control
    ├── WaveformAnimator.swift            # CVDisplayLink animation
    └── AudioModels.swift                 # TrackInfo model
```

**Key organizational principles:**
- Audio components isolated in `Audio/` subfolder
- Window/space management separated from business logic
- Timer and audio controllers are independent, coordinated by `IslandController`
- FFI types defined separately for clarity

### 8.2 MediaMonitor.swift

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/MediaMonitor.swift

import Foundation
import MediaPlayer

public struct TrackInfo {
    let title: String
    let artist: String
    let artwork: NSImage?
    let isPlaying: Bool
}

public final class MediaMonitor {
    public static let shared = MediaMonitor()

    private let controlCoordinator = MediaControlCoordinator()
    private let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    private let spotify = SpotifyMonitor()
    private let music = MusicMonitor()

    private var metadataTimer: Timer?

    public var onTrackChange: ((TrackInfo?) -> Void)?
    public var onPlaybackStateChange: ((Bool) -> Void)?

    private(set) var activeBundleID: String?

    private init() {}

    public func startMonitoring() {
        NotificationCenter.default.addObserver(self,
            selector: #selector(handleNowPlayingNotification),
            name: .MPMusicPlayerControllerNowPlayingItemDidChange,
            object: nil)

        spotify.connect()
        music.connect()
        schedulePolling()
        handleNowPlayingNotification()
    }

    public func stopMonitoring() {
        NotificationCenter.default.removeObserver(self)
        metadataTimer?.invalidate()
        metadataTimer = nil
    }

    @objc private func handleNowPlayingNotification() {
        guard let info = nowPlayingCenter.nowPlayingInfo else {
            activeBundleID = nil
            onTrackChange?(nil)
            return
        }

        let track = TrackInfo(
            title: info[MPMediaItemPropertyTitle] as? String ?? "Unknown",
            artist: info[MPMediaItemPropertyArtist] as? String ?? "Unknown",
            artwork: (info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork)?.image(at: CGSize(width: 64, height: 64)),
            isPlaying: (info[MPNowPlayingInfoPropertyPlaybackRate] as? Double ?? 0) > 0
        )

        onTrackChange?(track)
    }

    private func schedulePolling() {
        metadataTimer?.invalidate()
        metadataTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshActivePlayer()
        }
    }

    private func refreshActivePlayer() {
        if let spotifyTrack = spotify.currentTrack() {
            activeBundleID = "com.spotify.client"
            onTrackChange?(spotifyTrack)
            onPlaybackStateChange?(spotifyTrack.isPlaying)
            return
        }

        if let musicTrack = music.currentTrack() {
            activeBundleID = "com.apple.Music"
            onTrackChange?(musicTrack)
            onPlaybackStateChange?(musicTrack.isPlaying)
            return
        }

        onPlaybackStateChange?(false)
    }

    // MARK: - Controls

    public func togglePlayback() {
        controlCoordinator.togglePlayback(for: activeBundleID)
        refreshAfterCommand()
    }

    public func skipToNext() {
        controlCoordinator.nextTrack(for: activeBundleID)
        refreshAfterCommand()
    }

    public func skipToPrevious() {
        controlCoordinator.previousTrack(for: activeBundleID)
        refreshAfterCommand()
    }

    private func refreshAfterCommand() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            self.refreshActivePlayer()
            self.handleNowPlayingNotification()
        }
    }
}
```

### 8.3 WaveformAnimator.swift

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/Island/WaveformAnimator.swift

import Foundation
import QuartzCore

public enum PlaybackVisualState {
    case playing
    case paused
    case stopped
}

public final class WaveformAnimator {
    public static let shared = WaveformAnimator()

    private let barCount: Int = 20
    private var displayLink: CADisplayLink?

    private var currentBars: [CGFloat] = Array(repeating: 0.05, count: 20)
    private var targetBars: [CGFloat] = Array(repeating: 0.05, count: 20)
    private var phase: CGFloat = 0

    public var onFrame: (([CGFloat]) -> Void)?

    public var state: PlaybackVisualState = .stopped {
        didSet { updateTargetsForState() }
    }

    private init() {}

    public func start() {
        guard displayLink == nil else { return }

        let link = CADisplayLink(target: self, selector: #selector(step))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    public func stop() {
        displayLink?.invalidate()
        displayLink = nil
    }

    @objc private func step() {
        phase += 0.12

        for index in 0..<barCount {
            let noise = CGFloat.random(in: -0.15...0.15)
            let wave = sin(phase + CGFloat(index) * 0.4)
            let base = targetBars[index]
            let next = base + wave * 0.1 + noise
            currentBars[index] = currentBars[index] * 0.7 + max(0.05, next) * 0.3
        }

        onFrame?(currentBars)
    }

    private func updateTargetsForState() {
        switch state {
        case .playing:
            targetBars = (0..<barCount).map { index in
                0.4 + 0.25 * sin(CGFloat(index) * 0.3)
            }
        case .paused:
            targetBars = Array(repeating: 0.15, count: barCount)
        case .stopped:
            targetBars = Array(repeating: 0.05, count: barCount)
        }
    }
}
```

### 8.4 Enhanced IslandView.swift

Add to existing `IslandView`:

```swift
// Add to IslandView class

// MARK: - Audio State
private var hasAudio: Bool = false
private var trackInfo: TrackInfo?
private var isAudioPlaying: Bool = false
private var waveformBars: [CGFloat] = Array(repeating: 0.1, count: 20)

// MARK: - Expansion State
private var isExpanded: Bool = false
private var isHovered: Bool = false
private var collapseTimer: Timer?

// MARK: - Audio Update Methods

func updateAudioInfo(_ info: TrackInfo?) {
    self.trackInfo = info
    self.hasAudio = info != nil
    self.isAudioPlaying = info?.isPlaying ?? false
    needsDisplay = true
}

func updateWaveform(_ bars: [CGFloat]) {
    waveformBars = bars
    if isExpanded {
        setNeedsDisplay(calculateWaveformRect())
    }
}

// MARK: - Interaction Overrides

override func mouseDown(with event: NSEvent) {
    let location = convert(event.locationInWindow, from: nil)

    // Check button clicks in expanded state
    if isExpanded {
        if let buttonAction = checkButtonClick(at: location) {
            buttonAction()
            return
        }
    }

    // Toggle expansion
    toggleExpansion()
}

override func mouseEntered(with event: NSEvent) {
    isHovered = true
    if !isExpanded {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            window?.animator().setFrame(hoveredFrame, display: true)
        })
    }
    needsDisplay = true
}

override func mouseExited(with event: NSEvent) {
    isHovered = false
    if isExpanded {
        scheduleCollapse()
    } else {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            window?.animator().setFrame(compactFrame, display: true)
        })
    }
    needsDisplay = true
}

// MARK: - Drawing Audio Elements

private func drawExpandedAudioControls() {
    guard let info = trackInfo else { return }

    // Album art
    if let artwork = info.artwork {
        artwork.draw(in: albumArtRect)
    }

    // Track title
    let titleAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 14, weight: .semibold),
        .foregroundColor: NSColor.white
    ]
    NSAttributedString(string: info.title, attributes: titleAttrs)
        .draw(at: NSPoint(x: 64, y: bounds.height - 30))

    // Artist
    let artistAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 12, weight: .regular),
        .foregroundColor: NSColor.white.withAlphaComponent(0.7)
    ]
    NSAttributedString(string: info.artist, attributes: artistAttrs)
        .draw(at: NSPoint(x: 64, y: bounds.height - 50))

    // Buttons
    drawMediaButton(symbol: "backward.fill", rect: previousButtonRect)
    drawMediaButton(symbol: isAudioPlaying ? "pause.fill" : "play.fill", rect: playPauseButtonRect)
    drawMediaButton(symbol: "forward.fill", rect: nextButtonRect)
}

private func drawWaveform() {
    let rect = calculateWaveformRect()
    let barWidth: CGFloat = 3
    let barSpacing: CGFloat = 2
    let maxHeight = rect.height * 0.7

    for (index, magnitude) in waveformBars.enumerated() {
        let x = rect.minX + CGFloat(index) * (barWidth + barSpacing)
        let barHeight = CGFloat(magnitude) * maxHeight
        let y = rect.midY - barHeight / 2

        let barRect = NSRect(x: x, y: y, width: barWidth, height: barHeight)

        // Gradient color
        let hue = CGFloat(index) / CGFloat(waveformBars.count) * 0.6
        NSColor(hue: hue, saturation: 0.8, brightness: 0.9, alpha: 0.8).setFill()

        NSBezierPath(roundedRect: barRect, xRadius: 1.5, yRadius: 1.5).fill()
    }
}
```

---

## 9. FFI Bridge Layer

### 9.1 New FFI Exports

Add to `FFIExports.swift`:

```swift
// MARK: - Audio Controls

@_cdecl("macos_sensing_swift_audio_start_monitoring")
public func audioStartMonitoringFFI() {
    DispatchQueue.main.async {
        MediaMonitor.shared.startMonitoring()
    }
}

@_cdecl("macos_sensing_swift_audio_toggle_playback")
public func audioTogglePlaybackFFI() {
    DispatchQueue.main.async {
        MediaMonitor.shared.togglePlayback()
    }
}

@_cdecl("macos_sensing_swift_audio_next_track")
public func audioNextTrackFFI() {
    DispatchQueue.main.async {
        MediaMonitor.shared.skipToNext()
    }
}

@_cdecl("macos_sensing_swift_audio_previous_track")
public func audioPreviousTrackFFI() {
    DispatchQueue.main.async {
        MediaMonitor.shared.skipToPrevious()
    }
}
```

### 9.2 C Header Updates

Add to `MacOSSensingFFI.h`:

```c
// Audio monitoring and control
void macos_sensing_audio_start_monitoring(void);
void macos_sensing_audio_toggle_playback(void);
void macos_sensing_audio_next_track(void);
void macos_sensing_audio_previous_track(void);
```

### 9.3 Rust Bindings

Add to `macos_bridge.rs`:

```rust
extern "C" {
    fn macos_sensing_audio_start_monitoring();
    fn macos_sensing_audio_toggle_playback();
    fn macos_sensing_audio_next_track();
    fn macos_sensing_audio_previous_track();
}

pub fn audio_start_monitoring() {
    unsafe {
        macos_sensing_audio_start_monitoring();
    }
}

pub fn audio_toggle_playback() {
    unsafe {
        macos_sensing_audio_toggle_playback();
    }
}

pub fn audio_next_track() {
    unsafe {
        macos_sensing_audio_next_track();
    }
}

pub fn audio_previous_track() {
    unsafe {
        macos_sensing_audio_previous_track();
    }
}
```

---

## 10. Performance & Optimization

### 10.1 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Audio detection latency | ≤500ms | Time from audio start to island update |
| Control response | ≤100ms | Button click to action execution |
| Waveform FPS | 30-60 | Smooth visualization |
| CPU overhead (idle) | ≤1% | When compact, no waveform |
| CPU overhead (expanded) | ≤2% | With DisplayLink-driven waveform |
| Memory overhead | ≤10MB | Additional beyond Phase 5 baseline |

### 10.2 Optimization Strategies

**1. Conditional Waveform Animation:**
```swift
// Only animate waveform when expanded
func expandToFullView() {
    WaveformAnimator.shared.state = .playing
    WaveformAnimator.shared.start()
}

func collapseToCompactView() {
    WaveformAnimator.shared.stop()
}
```

**2. Throttle Display Updates:**
```swift
class IslandView: NSView {
    private var lastWaveformUpdate: Date = Date()
    private let minUpdateInterval: TimeInterval = 1.0 / 60.0  // 60 FPS max

    func updateWaveform(_ bars: [CGFloat]) {
        let now = Date()
        guard now.timeIntervalSince(lastWaveformUpdate) >= minUpdateInterval else {
            return
        }

        waveformBars = bars
        lastWaveformUpdate = now
        setNeedsDisplay(calculateWaveformRect())
    }
}
```

**3. Lightweight Noise Generation:**
- Precompute baseline curves per track energy (e.g., chill vs. upbeat)
- Add small random noise per frame instead of per-bar expensive math
- Clamp amplitudes to avoid overdraw

**4. Use Metal for Rendering (Future):**
- Current approach uses Core Graphics (adequate for 20 bars)
- For more complex visualizations, consider Metal shader

**5. Lazy Album Art Loading:**
```swift
func updateAudioInfo(_ info: TrackInfo?) {
    self.trackInfo = info

    // Load artwork asynchronously
    if let artwork = info?.artwork {
        DispatchQueue.global(qos: .userInitiated).async {
            // Resize artwork to needed size (64x64)
            let resized = self.resizeImage(artwork, to: NSSize(width: 64, height: 64))
            DispatchQueue.main.async {
                self.cachedArtwork = resized
                self.needsDisplay = true
            }
        }
    }
}
```

---

## 11. Testing Strategy

### 11.1 Manual Test Scenarios

**Test 1: Audio Detection**
1. Launch LeFocus
2. Start playing music in Spotify
3. ✅ Island shows audio indicator within 500ms
4. ✅ Compact view displays track title

**Test 2: Expansion & Controls**
1. Click island while audio is playing
2. ✅ Island expands smoothly (250ms animation)
3. ✅ Album art, title, artist, and controls appear
4. ✅ Waveform starts animating
5. Click play/pause button
6. ✅ Audio pauses/resumes correctly

**Test 3: Waveform Visualization**
1. Expand island with music playing
2. ✅ Waveform bars animate with lively motion
3. Pause playback
4. ✅ Bars settle into subtle breathing animation
5. Resume playback
6. ✅ Bars ramp back up without stutter

**Test 4: Combined Timer + Audio**
1. Start a 25-minute timer
2. Start playing music
3. ✅ Compact view shows timer + audio icon
4. Click to expand
5. ✅ Timer appears in top-right corner
6. ✅ Audio controls dominate center
7. ✅ All elements visible and non-overlapping

**Test 5: Multi-Source Priority**
1. Start Spotify
2. Start Apple Music
3. ✅ Island shows most recent source
4. Stop recent source
5. ✅ Island switches to remaining source

**Test 6: Auto-Collapse**
1. Expand island
2. Move mouse outside bounds
3. ✅ Island collapses after 300ms
4. ✅ Waveform stops updating (CPU usage drops)

**Test 7: Hover Feedback**
1. Hover over compact island
2. ✅ Island grows by 5% (smooth animation)
3. ✅ Cursor changes to pointer
4. Move mouse away
5. ✅ Island returns to normal size

**Test 8: Hybrid Control Fallback**
1. Play audio in Chrome (no AppleScript support)
2. ✅ Compact island shows generic audio indicator
3. Expand and click next/previous
4. ✅ CGEvent fallback triggers browser media control without crashes

### 11.2 Performance Testing

```bash
# Monitor CPU usage
open -a "Activity Monitor"
# Filter for LeFocus process
# Observe CPU % during:
# - Compact state: should be ≤1%
# - Expanded state with waveform: should be ≤2%

# Memory profiling
instruments -t Leaks -D trace.trace /path/to/LeFocus.app
# Check for memory leaks while animation runs/halts repeatedly
```

### 11.3 Edge Cases

**No Audio Playing:**
- Island shows only timer (if active)
- Click has no effect (no expansion)

**Audio Stops While Expanded:**
- Island auto-collapses within 500ms
- Returns to timer-only view (if timer active)

**Multiple Rapid Track Changes:**
- Island updates smoothly without flickering
- Album art loads without blocking UI

**System Audio Off / No Playback:**
- Island hides audio elements once playback stops
- Waveform fades out and animation stops

---

## 12. Future Enhancements

### 12.1 Play Button Opens Spotify (Phase 5.6)

**Feature:** When no audio is playing, clicking play button launches Spotify and starts last played track.

**Implementation:**
```swift
func handlePlayButtonClick() {
    if !hasAudio {
        // No audio playing - launch Spotify
        if let spotifyURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.spotify.client") {
            NSWorkspace.shared.open(spotifyURL)

            // Wait for Spotify to launch, then issue playback via hybrid controller
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                MediaMonitor.shared.togglePlayback()
            }
        }
    } else {
        // Audio playing - toggle playback
        MediaMonitor.shared.togglePlayback()
    }
}
```

### 12.2 Volume Control

Add volume slider in expanded view:
- Horizontal slider below track info
- System volume control via `NSSound.systemVolume`

### 12.3 Lyrics Display

Show synchronized lyrics when available:
- Fetch from `MPNowPlayingInfoCenter` (if provided)
- Display in expanded view below controls
- Scroll automatically with playback position

### 12.4 Queue/Playlist Preview

Expand further to show upcoming tracks:
- Height increases to 120px
- Shows next 3 tracks in queue
- Click to skip to specific track

### 12.5 Customizable Visualization Styles

Allow user to choose waveform type:
- Frequency bars (current)
- Circular spectrum
- Waveform (time-domain)
- Particle effects

### 12.6 AirPlay Integration

Detect and control AirPlay devices:
- Show AirPlay icon when devices available
- Click to select output device
- Show current output device name

---

## Implementation Checklist

### ✅ Phase 5.5.1: Media Detection (COMPLETE)
- [x] Create `MediaMonitor.swift` in `Island/Audio/`
- [x] Implement AppleScript probes for Spotify & Apple Music
- [x] Implement `MPNowPlayingInfoCenter` fallback for generic apps
- [x] 1-second polling loop with background queue snapshot capture
- [x] Priority waterfall: Spotify → Apple Music → MPNowPlayingInfoCenter
- [x] `MediaControlCoordinator` with AppleScript + media key fallback
- [x] Tested with Spotify, Apple Music, Chrome, Safari

**Notes:** No ScriptingBridge used—pure AppleScript with string parsing. Simpler and lighter.

### ✅ Phase 5.5.2: Waveform Visualization (COMPLETE)
- [x] Create `WaveformAnimator.swift` in `Island/Audio/`
- [x] Implement **CVDisplayLink**-based animation (not CADisplayLink)
- [x] Playback state-driven targets (playing/paused/stopped)
- [x] Wire callbacks: Animator → IslandAudioController → IslandController → IslandView
- [x] 20 bars with procedural noise + sine wave motion
- [x] Display-synced updates for smooth 60 FPS

**Notes:** CVDisplayLink provides better performance and display sync than CADisplayLink.

### ✅ Phase 5.5.3: Interaction System (COMPLETE)
- [x] Click-to-expand via `IslandViewInteractionDelegate` protocol
- [x] Hover state with `IslandWindowManager` size animation
- [x] Button hit testing with hover feedback in expanded state
- [x] Auto-collapse with 0.3s delay via `DispatchWorkItem`
- [x] Mouse tracking areas with `mouseEntered`/`mouseExited`/`mouseMoved`
- [x] Smooth expansion/collapse animations (0.25s / 0.15s)

### ✅ Phase 5.5.4: Combined View Layout (COMPLETE)
- [x] Compact timer+audio layout (timer left, 🎵 indicator right)
- [x] Expanded combined layout (buttons center, waveform right, timer corner)
- [x] Dynamic sizing: 300px compact → 620px expanded
- [x] `IslandWindowManager` handles all frame calculations
- [x] Tested with timer-only, audio-only, and combined states

### ✅ Phase 5.5.5: Architecture Components (COMPLETE)
- [x] `IslandController` - top-level coordinator with delegation
- [x] `IslandWindowManager` - NSPanel hierarchy + sizing
- [x] `IslandTimerPresenter` - timer clock + render loop
- [x] `IslandAudioController` - bridges audio subsystem
- [x] `IslandSpaceManager` - **CGS space persistence** (not in original design)
- [x] Clean separation of concerns with protocol-based delegation

### ✅ Phase 5.5.6: FFI Integration (COMPLETE)
- [x] Audio detection automatically starts with island initialization
- [x] No explicit FFI calls needed (monitors run automatically)
- [x] Island lifecycle managed via existing FFI: `island_init`, `island_start`, `island_cleanup`
- [x] Audio state updates flow through callbacks, not FFI polling

**Notes:** Simpler than originally designed—audio monitoring is automatic, no Rust → Swift FFI calls needed.

### 🚧 Phase 5.5.7: Polish & Testing (IN PROGRESS)
- [x] Waveform rendering optimized (20 bars, simple rendering)
- [x] Hover/expansion/collapse animations smooth
- [ ] Album art caching (currently not loaded from AppleScript)
- [ ] Formal CPU/memory profiling
- [ ] Comprehensive manual test suite execution
- [ ] Performance optimization if needed
- [ ] Edge case handling (rapid track changes, etc.)

---

## Known Limitations & Future Improvements

### Current Limitations
1. **No album artwork**: AppleScript probes don't fetch artwork (could add MPMediaItemArtwork extraction from MPNowPlayingInfoCenter)
2. **1-second polling latency**: Track changes detected within 1s max (acceptable tradeoff for CPU efficiency)
3. **Private CGS APIs**: IslandSpaceManager uses undocumented APIs (may break in future macOS)
4. **Spotify priority always wins**: No recency-based multi-source logic (intentional for consistency)
5. **No playlist/queue view**: Only current track displayed

### Potential Improvements
- Add artwork from MPNowPlayingInfoCenter when available
- Reduce polling interval to 500ms for faster track change detection
- Add haptic feedback on button clicks (if supported)
- Cache last N track artworks for faster switching
- Add "now playing" notification integration

---

**End of Dynamic Island Audio Controls System Design**

Total: ~1200 lines | Focus: Media integration, real-time audio visualization, combined timer+audio UI
