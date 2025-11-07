# LeFocus: Dynamic Island Audio Controls

**Version:** 1.0
**Date:** January 2025
**Phase:** 5.5 (Audio Enhancement)
**Status:** Design Ready
**Approach:** Swift MediaPlayer + Synthetic Waveform Animation

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
│                   IslandView (Enhanced)                      │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Timer Display│  │ Audio Controls  │  │   Waveform     │ │
│  │  (Phase 5)   │  │  (NEW)          │  │   Visualizer   │ │
│  └──────────────┘  └─────────────────┘  └────────────────┘ │
│                                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│           IslandController (Enhanced)                        │
│                                                              │
│  - Timer state (existing)                                    │
│  - Audio state (NEW)                                         │
│  - Expansion state (NEW)                                     │
│  - Interaction handling (NEW)                                │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ↓                         ↓
┌──────────────────┐    ┌──────────────────────┐
│  MediaMonitor    │    │  WaveformAnimator    │
│                  │    │                      │
│  - Track changes │    │  - Procedural bars  │
│  - Hybrid control│    │  - Playback states  │
│  - App fallbacks │    │  - DisplayLink loop │
└──────────────────┘    └──────────────────────┘
```

### 2.2 Data Flow

**Media Detection:**
1. `MediaMonitor` listens to `MPNowPlayingInfoCenter` for fast metadata hints
2. A 1s poll queries Spotify/Music via AppleScript for authoritative state & bundle ID
3. `MediaMonitor` forwards consolidated track info to `IslandController`
4. View shows audio indicator in compact state

**User Interaction:**
1. User hovers over island → `IslandView` mouseEntered handler fires
2. View grows slightly (visual feedback), cursor changes to pointer
3. User clicks → `IslandController.toggleExpansion()` called
4. View animates to expanded state, showing full controls + waveform
5. `WaveformAnimator` starts the DisplayLink-driven animation loop
6. User moves mouse away → `IslandView` mouseExited handler fires
7. View collapses back to compact state after 300ms delay

**Audio Control:**
1. User clicks play/pause button in expanded view
2. `IslandView` calls `MediaMonitor.togglePlayback()`
3. `MediaMonitor` instructs `MediaControlCoordinator` to perform hybrid control
4. Coordinator targets active player via AppleScript (Spotify/Music) when possible
5. If no app-specific control succeeds, fall back to CGEvent media key injection
6. On success, coordinator notifies `MediaMonitor` to refresh state
7. `MediaMonitor` refreshes metadata (MPNowPlayingInfoCenter or cached info)

**Waveform Rendering:**
1. `WaveformAnimator.start()` spins up `CADisplayLink`
2. Each frame, animator updates target amplitudes based on playback state
3. Procedural noise + easing produce smooth bar motion
4. Animator emits new bar heights via callback
5. `IslandView` renders bars in waveform area (right side) at 30-60 FPS

### 2.3 State Management

**IslandController maintains:**
```swift
struct IslandState {
    // Timer state (existing from Phase 5)
    var timerDisplayMs: Int64
    var timerMode: IslandMode
    var isTimerActive: Bool
    var isTimerIdle: Bool

    // Audio state (NEW)
    var hasAudio: Bool
    var isAudioPlaying: Bool
    var trackTitle: String?
    var trackArtist: String?
    var trackArtwork: NSImage?

    // Interaction state (NEW)
    var isExpanded: Bool
    var isHovered: Bool
}
```

### 2.4 Priority System for Multiple Audio Sources

When multiple apps are playing audio simultaneously:

**Priority order:**
1. **Most recently started** source (if started within last 5 seconds)
2. **Spotify** (if multiple sources have been playing for a while)
3. **Apple Music** (fallback if no Spotify)
4. **First detected source** (any other app)

**Implementation:**
```swift
class MediaMonitor {
    private var audioSources: [AudioSource] = []

    func selectPrimarySource() -> AudioSource? {
        let now = Date()

        // Check for recently started (within 5 seconds)
        if let recent = audioSources.first(where: {
            now.timeIntervalSince($0.startedAt) < 5.0
        }) {
            return recent
        }

        // Prefer Spotify
        if let spotify = audioSources.first(where: {
            $0.bundleID == "com.spotify.client"
        }) {
            return spotify
        }

        // Fallback to Apple Music
        if let appleMusic = audioSources.first(where: {
            $0.bundleID == "com.apple.Music"
        }) {
            return appleMusic
        }

        // Any other source
        return audioSources.first
    }
}
```

---

## 3. Media Detection & Control

### 3.1 System-Wide Media Detection

`MPNowPlayingInfoCenter` is still the lowest-friction way to learn about track metadata, but it only updates reliably for certain players. We combine it with lightweight app-specific probes:

1. Observe `MPNowPlayingInfoCenter` for quick updates (title, artist, artwork). When info appears we treat the publishing process as the active bundle if we can infer it.
2. Poll Spotify and Apple Music via `ScriptingBridge` every 1s while audio is active to confirm metadata and capture playback state/bundle IDs.
3. If neither path provides data, fall back to heuristics (`NSWorkspace.runningApplications`, browser tab sniffing) and surface a generic audio indicator.

```swift
final class MediaMonitor {
    private let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    private let spotify = SpotifyMonitor()
    private let music = MusicMonitor()
    private var metadataTimer: Timer?

    private(set) var activeBundleID: String?
    var onTrackChange: ((TrackInfo?) -> Void)?

    func startMonitoring() {
        NotificationCenter.default.addObserver(self,
            selector: #selector(handleNowPlayingChange),
            name: .MPMusicPlayerControllerNowPlayingItemDidChange,
            object: nil)

        spotify.connect()
        music.connect()
        startMetadataPolling()
        handleNowPlayingChange()
    }

    @objc private func handleNowPlayingChange() {
        guard let info = nowPlayingCenter.nowPlayingInfo else {
            activeBundleID = nil
            onTrackChange?(nil)
            return
        }

        let track = TrackInfo(
            title: info[MPMediaItemPropertyTitle] as? String ?? "Unknown",
            artist: info[MPMediaItemPropertyArtist] as? String ?? "Unknown",
            artwork: (info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork)?.image(at: CGSize(width: 64, height: 64)),
            isPlaying: info[MPNowPlayingInfoPropertyPlaybackRate] as? Double == 1.0
        )
        onTrackChange?(track)
    }

    private func startMetadataPolling() {
        metadataTimer?.invalidate()
        metadataTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshAppSpecificMetadata()
        }
    }

    private func refreshAppSpecificMetadata() {
        if let spotifyTrack = spotify.currentTrack() {
            activeBundleID = "com.spotify.client"
            onTrackChange?(spotifyTrack)
            return
        }

        if let musicTrack = music.currentTrack() {
            activeBundleID = "com.apple.Music"
            onTrackChange?(musicTrack)
            return
        }
    }
}
```

### 3.2 Hybrid Media Control

`MPRemoteCommandCenter` cannot control third-party apps from outside their sandbox. Instead we use a two-tier strategy:

1. **AppleScript for supported apps** (Spotify, Apple Music) – direct commands
2. **CGEvent media key injection** – universal fallback

```swift
final class MediaControlCoordinator {
    private let appleScriptController = AppleScriptMediaController()
    private let mediaKeyController = MediaKeyController()

    func togglePlayback(for bundleID: String?) {
        if appleScriptController.perform(.toggle, bundleID: bundleID) { return }
        mediaKeyController.playPause()
    }

    func nextTrack(for bundleID: String?) {
        if appleScriptController.perform(.next, bundleID: bundleID) { return }
        mediaKeyController.nextTrack()
    }

    func previousTrack(for bundleID: String?) {
        if appleScriptController.perform(.previous, bundleID: bundleID) { return }
        mediaKeyController.previousTrack()
    }
}

enum MediaCommand { case toggle, next, previous }
```

```swift
final class AppleScriptMediaController {
    func perform(_ command: MediaCommand, bundleID: String?) -> Bool {
        guard let bundleID else { return false }

        let script: String
        switch (bundleID, command) {
        case ("com.spotify.client", .toggle):
            script = "tell application \"Spotify\" to playpause"
        case ("com.spotify.client", .next):
            script = "tell application \"Spotify\" to next track"
        case ("com.spotify.client", .previous):
            script = "tell application \"Spotify\" to previous track"
        case ("com.apple.Music", .toggle):
            script = "tell application \"Music\" to playpause"
        case ("com.apple.Music", .next):
            script = "tell application \"Music\" to next track"
        case ("com.apple.Music", .previous):
            script = "tell application \"Music\" to previous track"
        default:
            return false
        }

        guard let appleScript = NSAppleScript(source: script) else {
            return false
        }

        var error: NSDictionary?
        appleScript.executeAndReturnError(&error)
        return error == nil
    }
}

final class MediaKeyController {
    private enum MediaKeyCode: CGKeyCode {
        case playPause = 0x7E
        case next = 0x7F
        case previous = 0x80
    }

    func playPause() { send(.playPause) }
    func nextTrack() { send(.next) }
    func previousTrack() { send(.previous) }

    private func send(_ keyCode: MediaKeyCode) {
        let source = CGEventSource(stateID: .hidSystemState)
        let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode.rawValue, keyDown: true)
        let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode.rawValue, keyDown: false)
        down?.flags = .maskNonCoalesced
        up?.flags = .maskNonCoalesced
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
}
```

### 3.3 Detecting Spotify & Apple Music

For richer metadata and precise control we rely on ScriptingBridge/AppleScript:

```swift
import ScriptingBridge

final class SpotifyMonitor {
    private var spotifyApp: SpotifyApplication?

    func connect() {
        spotifyApp = SBApplication(bundleIdentifier: "com.spotify.client")
    }

    func currentTrack() -> TrackInfo? {
        guard let spotify = spotifyApp,
              spotify.isRunning,
              let track = spotify.currentTrack else {
            return nil
        }

        return TrackInfo(
            title: track.name ?? "Unknown",
            artist: track.artist ?? "Unknown",
            artwork: track.artwork,
            isPlaying: spotify.playerState == .playing
        )
    }
}

final class MusicMonitor {
    private var musicApp: MusicApplication?

    func connect() {
        musicApp = SBApplication(bundleIdentifier: "com.apple.Music")
    }

    func currentTrack() -> TrackInfo? {
        guard let music = musicApp,
              music.isRunning,
              let track = music.currentTrack else {
            return nil
        }

        return TrackInfo(
            title: track.name ?? "Unknown",
            artist: track.artist ?? "Unknown",
            artwork: track.artwork,
            isPlaying: music.playerState == .playing
        )
    }
}

```

**Permissions:** Add `NSAppleEventsUsageDescription` to Info.plist and instruct the user to enable Automation access for LeFocus → Spotify/Music on first use.
```

**Note:** Requires entitlement for app scripting.

### 3.4 Fallback Detection Strategy

If `MPNowPlayingInfoCenter` doesn't provide info (some apps don't report properly):

1. Poll Spotify and Apple Music via ScriptingBridge (fast path)
2. Inspect `NSWorkspace.shared.runningApplications` for other media players
3. For browsers, optionally inspect tab titles via Accessibility APIs (opt-in)
4. When no metadata can be resolved, fall back to generic waveform + CGEvent controls only

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

## 8. Swift Implementation

### 8.1 New Files to Create

```
src-tauri/plugins/macos-sensing/Sources/MacOSSensing/
├── Island/
│   ├── IslandController.swift        # Enhanced from Phase 5
│   ├── IslandView.swift               # Enhanced from Phase 5
│   ├── MediaMonitor.swift             # NEW: Audio detection & state sync
│   ├── MediaControlCoordinator.swift  # NEW: Hybrid AppleScript + media keys
│   ├── AppleScriptMediaController.swift
│   ├── MediaKeyController.swift
│   ├── SpotifyMonitor.swift           # NEW: ScriptingBridge helpers
│   ├── MusicMonitor.swift             # NEW: ScriptingBridge helpers
│   ├── WaveformAnimator.swift         # NEW: Synthetic waveform animation
│   └── IslandTypes.swift              # NEW: Audio-related types
```

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

### Phase 5.5.1: Media Detection
- [ ] Create `MediaMonitor.swift`
- [ ] Implement `MPNowPlayingInfoCenter` integration (metadata only)
- [ ] Generate ScriptingBridge headers for Spotify & Music
- [ ] Poll Spotify/Music for track state + bundle IDs
- [ ] Handle Automation permission prompt copy + Info.plist entry
- [ ] Implement playback state detection fallback heuristics
- [ ] Test with Spotify, Apple Music, Chrome, Safari

### Phase 5.5.2: Waveform Visualization
- [ ] Create `WaveformAnimator.swift`
- [ ] Implement DisplayLink-based bar animation
- [ ] Expose playback-state-driven targets (playing/paused/stopped)
- [ ] Wire animator callbacks into `IslandController` / `IslandView`
- [ ] Ensure 30-60 FPS without exceeding 2% CPU

### Phase 5.5.3: Interaction System
- [ ] Add click-to-expand logic to `IslandView`
- [ ] Implement hover state with scale animation
- [ ] Add button hit testing in expanded state
- [ ] Implement auto-collapse with delay timer
- [ ] Add mouse tracking areas
- [ ] Test interaction flow

### Phase 5.5.4: Combined View Layout
- [ ] Design compact timer+audio layout
- [ ] Design expanded combined layout
- [ ] Implement dynamic sizing based on active state
- [ ] Add smooth transitions between layouts
- [ ] Test with timer-only, audio-only, and combined states

### Phase 5.5.5: FFI Integration
- [ ] Add audio FFI exports to `FFIExports.swift`
- [ ] Update C header with audio functions
- [ ] Add Rust bindings in `macos_bridge.rs`
- [ ] Wire up Swift → Rust callbacks for track changes / active bundle updates
- [ ] Test FFI calls from Rust

### Phase 5.5.6: Polish & Testing
- [ ] Add album art caching
- [ ] Optimize waveform rendering
- [ ] Test CPU usage (target ≤2% expanded)
- [ ] Test memory usage (target ≤10MB overhead)
- [ ] Test all manual scenarios
- [ ] Fix any visual glitches
- [ ] Document any known limitations

---

**End of Dynamic Island Audio Controls System Design**

Total: ~1200 lines | Focus: Media integration, real-time audio visualization, combined timer+audio UI
