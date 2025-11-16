# LeFocus: Playback Progress Bar — System Design

**Version:** 1.0
**Status:** Design Document
**Scope:** Track progress bar with scrubbing/seek functionality in Dynamic Island

---

## 1. Executive Summary

### 1.1 Overview

Add a playback progress bar to the expanded Dynamic Island view that displays:
- **Current playback position** (e.g., "1:23") on the left
- **Scrubable progress bar** in the center (click to seek)
- **Total track duration** (e.g., "3:45") on the right

Positioned between the song metadata (top) and playback buttons (bottom).

### 1.2 Key Requirements

| Feature | Capability |
|---------|-----------|
| **Position display** | Current time (MM:SS) on left |
| **Duration display** | Total time (MM:SS) on right |
| **Progress bar** | Visual representation of playback progress |
| **Seek functionality** | Click anywhere on bar to jump to that position |
| **Live updates** | Poll position every 0.5s when playing |
| **Multi-app support** | Spotify, Apple Music, MPNowPlayingInfoCenter |

### 1.3 Technical Feasibility

**✅ What Works:**
- Spotify: `player position` (read/write) ✅
- Apple Music: `player position` (read/write) ✅
- MPNowPlayingInfoCenter: `MPNowPlayingInfoPropertyElapsedPlaybackTime` (read-only) ⚠️

**⚠️ Limitations:**
- MPNowPlayingInfoCenter (Chrome, Safari, etc.) is **read-only** - cannot seek
- Will need to handle this gracefully (show progress but disable click)

---

## 2. Current State Analysis

### 2.1 Existing Capabilities

**MediaMonitor** (1-second polling):
- ✅ Track title, artist, artwork
- ✅ Playing/paused state
- ✅ Source bundle ID
- ❌ **Missing:** Player position, track duration

**MediaControlCoordinator:**
- ✅ Play/pause toggle
- ✅ Skip next/previous
- ❌ **Missing:** Seek to position

**AppleScript Probes:**
- Currently fetch: `name`, `artist`, `player state`, `artwork url`
- **Can also fetch:** `player position`, `duration` (Spotify/Music only)

### 2.2 UI Layout (Expanded Island)

**Current Layout (380px × 150px):**

```
┌────────────────────────────────────────────────────────┐
│  [Artwork] Title            Waveform          Timer    │ ← 50px from top
│            Artist                                      │
│                                                        │
│                                                        │
│            [◀]  [▶]  [▶▶]                             │ ← 10px from bottom
└────────────────────────────────────────────────────────┘
```

**Proposed Layout with Progress Bar:**

```
┌────────────────────────────────────────────────────────┐
│  [Artwork] Title            Waveform          Timer    │ ← 50px from top
│            Artist                                      │
│            1:23 ████████░░░░░ 3:45                     │ ← 65px from bottom (new)
│                                                        │
│            [◀]  [▶]  [▶▶]                             │ ← 10px from bottom
└────────────────────────────────────────────────────────┘
```

**Spacing:**
- Song metadata: 50px from top
- Progress bar: 65px from bottom (55px above buttons)
- Playback buttons: 10px from bottom

---

## 3. Architecture

### 3.1 Data Flow

```
MediaMonitor (0.5s polling when playing, 1s when paused)
    │
    ├─ Fetch position + duration via AppleScript
    │
    ▼
TrackInfo {
    title, artist, artwork, isPlaying,
    position: TimeInterval?,    // NEW
    duration: TimeInterval?,    // NEW
    canSeek: Bool               // Capability flag derived per-source
}
    │
    ▼
IslandAudioController → IslandController → IslandView
    │
    ├─ Cache position + duration + `canSeek`
    │
    ▼
drawProgressBarIfNeeded()
    │
    ├─ Format times (MM:SS)
    ├─ Calculate progress (position / duration)
    ├─ Render bar + labels
    │
    └─ Handle click → seekToPosition()
```

### 3.2 Component Modifications

| Component | Changes | Lines |
|-----------|---------|-------|
    | **TrackInfo** | + `position: TimeInterval?`<br>+ `duration: TimeInterval?`<br>+ `canSeek: Bool` | +14 |
| **SpotifyMetadataProbe** | Fetch position + duration in AppleScript | +20 |
| **MusicMetadataProbe** | Fetch position + duration in AppleScript | +20 |
| **MediaMonitor** | Faster polling when playing (0.5s) | +5 |
| **MediaControlCoordinator** | + `seek(to: TimeInterval, bundleID: String?)` | +30 |
| **IslandView** | + `drawProgressBarIfNeeded()`<br>+ Click handling for seek | +120 |
| **Total** | | ~205 lines |

---

## 4. Implementation Details

### 4.1 TrackInfo Extension

```swift
// AudioModels.swift
public struct TrackInfo: Equatable {
    public let title: String
    public let artist: String
    public let artwork: NSImage?
    public let isPlaying: Bool
    public let timestamp: Date
    public let sourceBundleID: String?

    // NEW: Playback timing
    public let position: TimeInterval?  // Current position in seconds
    public let duration: TimeInterval?  // Total duration in seconds
    public let canSeek: Bool            // Whether transport supports scrubbing

    public init(
        title: String,
        artist: String,
        artwork: NSImage?,
        isPlaying: Bool,
        timestamp: Date = Date(),
        sourceBundleID: String?,
        position: TimeInterval? = nil,
        duration: TimeInterval? = nil,
        canSeek: Bool = false
    ) {
        self.title = title
        self.artist = artist
        self.artwork = artwork
        self.isPlaying = isPlaying
        self.timestamp = timestamp
        self.sourceBundleID = sourceBundleID
        self.position = position
        self.duration = duration
        self.canSeek = canSeek
    }
}
```

### 4.2 Spotify AppleScript Update

```swift
// MediaMonitor.swift - SpotifyMetadataProbe
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
    set artUrl to ""
    try
        set artUrl to artwork url of current track
    end try

    -- NEW: Fetch position and duration
    set pos to player position as string
    set dur to duration of current track as string

    return trackName & separator & trackArtist & separator & trackState & separator & artUrl & separator & pos & separator & dur
end tell
"""

func snapshot() -> ProbeResult? {
    guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
    guard !response.isEmpty else { return nil }
    let components = response.components(separatedBy: Self.separator)
    guard components.count >= 3 else { return nil }

    let isPlaying = components[2].lowercased() == "playing"

    // Parse position and duration (new)
    let position: TimeInterval? = components.count >= 6 ? Double(components[4]) : nil
    let durationMs: TimeInterval? = components.count >= 6 ? Double(components[5]) : nil
    let duration = durationMs.map { $0 / 1000.0 } // Spotify returns milliseconds

    let track = TrackInfo(
        title: components[0].isEmpty ? "Unknown" : components[0],
        artist: components[1].isEmpty ? "Unknown" : components[1],
        artwork: nil,
        isPlaying: isPlaying,
        sourceBundleID: "com.spotify.client",
        position: position,
        duration: duration,
        canSeek: true  // Spotify AppleScript supports seek
    )

    let urlString = components.count >= 4 ? components[3].trimmingCharacters(in: .whitespacesAndNewlines) : ""
    let hint: ArtworkHint?
    if !urlString.isEmpty, let url = URL(string: urlString) {
        hint = .spotify(url: url)
    } else {
        hint = nil
    }

    return ProbeResult(track: track, hint: hint)
}
```

### 4.3 Apple Music AppleScript Update

```swift
// MediaMonitor.swift - MusicMetadataProbe
private static let script = """
set separator to "\(MusicMetadataProbe.separator)"
if application "Music" is not running then
    return ""
end if
tell application "Music"
    if player state is stopped then
        return ""
    end if
    set trackName to name of current track
    set trackArtist to artist of current track
    set trackState to player state as string

    -- NEW: Fetch position and duration
    set pos to player position as string
    set dur to duration of current track as string

    set artData to ""
    set tempPath to ""
    try
        -- [existing artwork code]
    end try
    return trackName & separator & trackArtist & separator & trackState & separator & artData & separator & pos & separator & dur
end tell
"""

func snapshot() -> ProbeResult? {
    // [similar parsing as Spotify]
    let position: TimeInterval? = components.count >= 6 ? Double(components[4]) : nil
    let duration: TimeInterval? = components.count >= 6 ? Double(components[5]) : nil

    let track = TrackInfo(
        title: components[0].isEmpty ? "Unknown" : components[0],
        artist: components[1].isEmpty ? "Unknown" : components[1],
        artwork: nil,
        isPlaying: isPlaying,
        sourceBundleID: "com.apple.Music",
        position: position,
        duration: duration,
        canSeek: true  // Music supports seek
    )
    // [...]
}
```

### 4.4 MPNowPlayingInfoCenter Update

```swift
// MediaMonitor.swift - nowPlayingSnapshot()
private func nowPlayingSnapshot() -> TrackInfo? {
    if !Thread.isMainThread {
        return DispatchQueue.main.sync { self.nowPlayingSnapshot() }
    }
    guard let info = nowPlayingCenter.nowPlayingInfo else { return nil }

    let title = (info[MPMediaItemPropertyTitle] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let artist = (info[MPMediaItemPropertyArtist] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    let playbackRate = info[MPNowPlayingInfoPropertyPlaybackRate] as? NSNumber
    let isPlaying = (playbackRate?.doubleValue ?? 0) > 0.01

    let artwork: NSImage?
    if let artworkItem = info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork {
        artwork = artworkItem.image(at: CGSize(width: 64, height: 64))
    } else {
        artwork = nil
    }

    // NEW: Fetch timing info
    let position = info[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? TimeInterval
    let duration = info[MPMediaItemPropertyPlaybackDuration] as? TimeInterval

    return TrackInfo(
        title: title?.isEmpty == false ? title! : "Unknown",
        artist: artist?.isEmpty == false ? artist! : "Unknown",
        artwork: artwork,
        isPlaying: isPlaying,
        sourceBundleID: nil,
        position: position,
        duration: duration,
        canSeek: false  // MPNowPlaying is read-only
    )
}
```

### 4.5 Faster Polling When Playing

```swift
// MediaMonitor.swift
private var metadataTimer: Timer?
private var metadataInterval: TimeInterval = 1.0
private var isPolling = false

private func ensureMetadataTimer() {
    guard metadataTimer == nil else { return }
    scheduleMetadataTimer(interval: metadataInterval)
}

private func scheduleMetadataTimer(interval: TimeInterval) {
    metadataTimer?.invalidate()
    let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
        self?.refreshMetadata()
    }
    RunLoop.main.add(timer, forMode: .common)
    metadataTimer = timer
    metadataInterval = interval
}

// Adjust polling rate without overlapping AppleScript executions
private func refreshMetadata() {
    guard !isPolling else { return }
    isPolling = true

    pollingQueue.async { [weak self] in
        guard let self else { return }
        let snapshot = self.captureSnapshot()
        DispatchQueue.main.async {
            self.apply(snapshot: snapshot)

            let desiredInterval: TimeInterval = snapshot?.track.isPlaying == true ? 0.5 : 1.0
            if abs(desiredInterval - self.metadataInterval) > 0.01 {
                self.scheduleMetadataTimer(interval: desiredInterval)
            }
            self.isPolling = false
        }
    }
}
```

`ensureMetadataTimer()` is invoked when `MediaMonitor` starts (app launch and resume) so only one timer lives at a time; interval changes reuse the same timer instance.

### 4.6 Seek Functionality

```swift
// MediaControlCoordinator.swift
func seek(to position: TimeInterval, bundleID: String?) {
    if appleScriptController.seek(to: position, bundleID: bundleID) { return }
    // No media key fallback for seek
}

// AppleScriptMediaController extension
func seek(to position: TimeInterval, bundleID: String?) -> Bool {
    guard let bundleID, let source = seekScript(for: position, bundleID: bundleID) else {
        return false
    }
    return AppleScriptRunner.execute(source)
}

private func seekScript(for position: TimeInterval, bundleID: String) -> String? {
    switch bundleID {
    case "com.spotify.client":
        return """
        tell application "Spotify"
            set player position to \(position)
        end tell
        """
    case "com.apple.Music":
        return """
        tell application "Music"
            set player position to \(position)
        end tell
        """
    default:
        return nil
    }
}
```

### 4.7 IslandView Progress Bar Drawing

```swift
// IslandView.swift
struct ProgressBarArea {
    var barRect: NSRect = .zero
    var isHovered: Bool = false
}

var progressBarArea = ProgressBarArea()

func drawProgressBarIfNeeded() {
    guard isExpanded,
          let track = trackInfo,
          let position = track.position,
          let duration = track.duration,
          duration > 0 else {
        progressBarArea.barRect = .zero
        return
    }

    let barY: CGFloat = 65.0  // 65px from bottom
    let leftX: CGFloat = expandedArtworkRect().minX  // Align with artwork
    let rightMargin: CGFloat = 16.0
    let barWidth = bounds.width - leftX - rightMargin

    // Time labels
    let currentTimeStr = formatTime(position)
    let durationStr = formatTime(duration)

    let timeFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
    let timeAttrs: [NSAttributedString.Key: Any] = [
        .font: timeFont,
        .foregroundColor: NSColor.white.withAlphaComponent(0.7 * expandedContentOpacity)
    ]

    let currentTimeSize = NSString(string: currentTimeStr).size(withAttributes: timeAttrs)
    let durationSize = NSString(string: durationStr).size(withAttributes: timeAttrs)

    // Draw current time (left)
    let currentTimeRect = NSRect(
        x: leftX,
        y: barY - currentTimeSize.height / 2.0,
        width: currentTimeSize.width,
        height: currentTimeSize.height
    )
    NSString(string: currentTimeStr).draw(with: currentTimeRect, attributes: timeAttrs)

    // Draw duration (right)
    let durationX = leftX + barWidth - durationSize.width
    let durationRect = NSRect(
        x: durationX,
        y: barY - durationSize.height / 2.0,
        width: durationSize.width,
        height: durationSize.height
    )
    NSString(string: durationStr).draw(with: durationRect, attributes: timeAttrs)

    // Progress bar in center
    let barStartX = currentTimeRect.maxX + 12.0
    let barEndX = durationRect.minX - 12.0
    let barActualWidth = barEndX - barStartX

    let barHeight: CGFloat = 3.0
    let barBackgroundRect = NSRect(
        x: barStartX,
        y: barY - barHeight / 2.0,
        width: barActualWidth,
        height: barHeight
    )

    progressBarArea.barRect = track.canSeek ? barBackgroundRect : .zero

    // Draw background track
    let backgroundPath = NSBezierPath(roundedRect: barBackgroundRect, xRadius: barHeight / 2.0, yRadius: barHeight / 2.0)
    let backgroundOpacity: CGFloat = track.canSeek ? 0.2 : 0.1
    NSColor.white.withAlphaComponent(backgroundOpacity * expandedContentOpacity).setFill()
    backgroundPath.fill()

    // Draw progress fill
    let rawProgress = CGFloat(position / duration)
    let progress = min(max(rawProgress, 0), 1)
    let fillWidth = barActualWidth * progress
    let fillRect = NSRect(
        x: barStartX,
        y: barY - barHeight / 2.0,
        width: fillWidth,
        height: barHeight
    )
    let fillPath = NSBezierPath(roundedRect: fillRect, xRadius: barHeight / 2.0, yRadius: barHeight / 2.0)
    let fillOpacity: CGFloat = track.canSeek ? 0.8 : 0.35
    NSColor.white.withAlphaComponent(fillOpacity * expandedContentOpacity).setFill()
    fillPath.fill()

    // Draw hover indicator
    if track.canSeek && progressBarArea.isHovered {
        let scrubberRadius: CGFloat = 6.0
        let scrubberX = barStartX + fillWidth
        let scrubberRect = NSRect(
            x: scrubberX - scrubberRadius,
            y: barY - scrubberRadius,
            width: scrubberRadius * 2.0,
            height: scrubberRadius * 2.0
        )
        let scrubberPath = NSBezierPath(ovalIn: scrubberRect)
        NSColor.white.withAlphaComponent(expandedContentOpacity).setFill()
        scrubberPath.fill()
    }
}

private func formatTime(_ seconds: TimeInterval) -> String {
    let totalSeconds = Int(seconds)
    let minutes = totalSeconds / 60
    let secs = totalSeconds % 60
    return String(format: "%d:%02d", minutes, secs)
}
```

### 4.8 Click Handling for Seek

```swift
// IslandView.swift - mouseMoved
override func mouseMoved(with event: NSEvent) {
    guard isExpanded else { return }
    let point = convert(event.locationInWindow, from: nil)

    // [existing button hover logic]

    // Check progress bar hover (seekable only)
    let wasHoveringBar = progressBarArea.isHovered
    let canSeek = trackInfo?.canSeek == true
    progressBarArea.isHovered = canSeek && progressBarArea.barRect.contains(point)

    if wasHoveringBar != progressBarArea.isHovered {
        needsDisplay = true
    }
}

// IslandView.swift - mouseDown
override func mouseDown(with event: NSEvent) {
    let location = convert(event.locationInWindow, from: nil)
    if isExpanded {
        // [existing button click logic]

        // Check progress bar click
        if let track = trackInfo,
           track.canSeek,
           progressBarArea.barRect.contains(location),
           let duration = track.duration,
           duration > 0 {
            let clickX = location.x - progressBarArea.barRect.minX
            let progress = min(max(clickX / progressBarArea.barRect.width, 0), 1)
            let newPosition = Double(progress) * duration

            updateProgressBarOptimistically(to: newPosition)
            interactionDelegate?.islandView(self, didRequestSeek: newPosition)
            return
        }
    }
    // [existing expansion toggle]
}

// IslandViewInteractionDelegate extension
protocol IslandViewInteractionDelegate: AnyObject {
    // [existing methods]
    func islandView(_ view: IslandView, didRequestSeek position: TimeInterval)
}

// IslandController implementation
extension IslandController: IslandViewInteractionDelegate {
    func islandView(_ view: IslandView, didRequestSeek position: TimeInterval) {
        guard view.trackInfo?.canSeek == true,
              let bundleID = audioController.activeBundleID else { return }
        audioController.seek(to: position, bundleID: bundleID)
    }
}

// IslandAudioController
func seek(to position: TimeInterval, bundleID: String) {
    mediaMonitor.seek(to: position, bundleID: bundleID)
}

// MediaMonitor
func seek(to position: TimeInterval, bundleID: String) {
    controlCoordinator.seek(to: position, bundleID: bundleID)
}
```

---

## 5. UI Design Specifications

### 5.1 Visual Styling

| Element | Style |
|---------|-------|
| **Time labels** | 11pt monospace, 70% opacity |
| **Background track** | 3px height, 20% white, rounded |
| **Progress fill** | 3px height, 80% white, rounded |
| **Scrubber (hover)** | 12px diameter circle, 100% white |

### 5.2 Interaction States

**Idle (not hovering):**
- Background track + progress fill visible
- No scrubber indicator

**Hovering (seekable tracks only):**
- Scrubber circle appears at current position
- Cursor changes to pointer

**Read-only sources (`canSeek == false`):**
- Background/fill use lower opacity
- No scrubber or hover feedback; cursor stays default

**Clicking:**
- Calculate progress from click X position
- Send seek command immediately
- Progress bar updates on next poll (0.5s)

### 5.3 Layout Constraints

```
Expanded Island: 380px × 150px

Vertical Layout:
  - Song metadata: 50px from top
  - Progress bar: 65px from bottom (55px spacing above buttons)
  - Playback buttons: 10px from bottom

Horizontal Layout:
  - Left align: Match album artwork X (28px)
  - Right margin: 16px
  - Label spacing: 12px between time and bar
  - Total bar width: ~280px (dynamic based on label widths)
```

---

## 6. Performance Considerations

### 6.1 Polling Frequency

| State | Interval | Reason |
|-------|----------|--------|
| Playing | 0.5s | Smooth progress updates |
| Paused | 1.0s | Save CPU (position doesn't change) |
| Stopped | 1.0s | No track active |

**CPU Impact:**
- AppleScript overhead: ~0.5% (existing)
- Additional position/duration parsing: <0.1%
- **Total:** ~0.6% (negligible increase)

### 6.2 Seek Responsiveness

**Latency breakdown:**
```
User click → seek command: <1ms
AppleScript execution: 50-100ms
Player responds: 100-200ms
Next poll captures new position: 0-500ms
UI updates: <1ms
──────────────────────────────────────
Total perceived latency: 150-800ms
```

**Optimization:** Optimistically update progress bar immediately on click (predicted position), then sync on next poll. The click handler calls `updateProgressBarOptimistically` before dispatching the seek command, so users see instant feedback even while AppleScript completes.

```swift
// IslandView - optimistic update
func updateProgressBarOptimistically(to position: TimeInterval) {
    guard let track = trackInfo, track.canSeek else { return }

    // Create temporary updated track
    let optimisticTrack = TrackInfo(
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        isPlaying: track.isPlaying,
        timestamp: track.timestamp,
        sourceBundleID: track.sourceBundleID,
        position: position,  // NEW position
        duration: track.duration,
        canSeek: track.canSeek
    )

    trackInfo = optimisticTrack
    needsDisplay = true
}
```

---

## 7. Edge Cases & Error Handling

### 7.1 Missing Data Scenarios

| Scenario | Behavior |
|----------|----------|
| `position == nil` | Hide progress bar |
| `duration == nil` | Hide progress bar |
| `duration == 0` | Hide progress bar (avoid division by zero) |
| `position > duration` | Clamp display to 100% |
| `canSeek == false` | Render dimmed progress track, suppress hover/click |
| MPNowPlayingInfoCenter (no seek) | Same as above; `canSeek = false` |

### 7.2 App-Specific Limitations

**Spotify:**
- ✅ Full support (read + seek)
- Position in seconds, duration in milliseconds (handle conversion)

**Apple Music:**
- ✅ Full support (read + seek)
- Position and duration in seconds

**MPNowPlayingInfoCenter (Chrome, Safari, etc.):**
- ⚠️ Read-only (cannot seek)
- `TrackInfo.canSeek = false` so UI dims the bar, removes scrubber hover, and never fires delegate callbacks
- Cursor remains default arrow; optional tooltip "Seek not supported"

---

## 8. Testing Plan

### 8.1 Unit Tests

```swift
class TimeFormattingTests: XCTestCase {
    func testFormatTime() {
        XCTAssertEqual(formatTime(0), "0:00")
        XCTAssertEqual(formatTime(65), "1:05")
        XCTAssertEqual(formatTime(3723), "62:03")  // Edge case: >60 minutes
    }
}

class ProgressCalculationTests: XCTestCase {
    func testProgressClamping() {
        let position: TimeInterval = 250
        let duration: TimeInterval = 200
        let progress = min(1.0, position / duration)
        XCTAssertEqual(progress, 1.0)  // Clamp to 100%
    }
}
```

### 8.2 Manual Test Cases

**Spotify:**
1. ✅ Play track → progress bar appears with correct times
2. ✅ Click at 50% → playback jumps to middle
3. ✅ Pause → progress bar shows but doesn't advance
4. ✅ Resume → progress bar continues from paused position

**Apple Music:**
5. ✅ Same test cases as Spotify

**Chrome (YouTube Music via MPNowPlayingInfoCenter):**
6. ✅ Progress bar shows
7. ✅ Click on bar → nothing happens (read-only)
8. ✅ No errors or crashes

**Edge Cases:**
9. ✅ Track with no duration metadata → no progress bar
10. ✅ Very long track (>60 min) → time displays correctly (e.g., "62:03")

---

## 9. Implementation Phases

### Phase 1: Data Fetching (Day 1)
- Update `TrackInfo` struct
- Modify Spotify/Music AppleScript probes
- Update MPNowPlayingInfoCenter parsing
- **Deliverable:** Position + duration flowing to `IslandView`

### Phase 2: UI Rendering (Day 1-2)
- Implement `drawProgressBarIfNeeded()`
- Time formatting helper
- Layout constraints
- **Deliverable:** Visual progress bar displaying

### Phase 3: Seek Functionality (Day 2)
- Add seek methods to `MediaControlCoordinator`
- Click detection in `IslandView`
- Delegate chain to trigger seek
- **Deliverable:** Click-to-seek working for Spotify/Music

### Phase 4: Polish & Testing (Day 2-3)
- Optimistic UI updates
- Hover effects
- Disable seek for unsupported sources
- Manual testing
- **Deliverable:** Production-ready feature

**Total Effort:** 2-3 days

---

## 10. Future Enhancements (Out of Scope)

- ❌ Drag scrubber for fine-grained control (complex gesture handling)
- ❌ Display remaining time instead of duration (e.g., "-2:22")
- ❌ Smooth animation when seeking (requires interpolation)
- ❌ Keyboard shortcuts for seek (← → keys)

---

## Appendix: File Manifest

**Modified Files:**

```
Island/Audio/
├── AudioModels.swift                  (+10 lines: position, duration fields)
├── MediaMonitor.swift                 (+50 lines: AppleScript updates, faster polling)
└── MediaControlCoordinator.swift      (+30 lines: seek functionality)

Island/
├── IslandController.swift             (+10 lines: seek delegate)
└── IslandView.swift                   (+120 lines: progress bar drawing + click handling)

Island/Drawing/
└── IslandAudioDrawing.swift           (no changes, layout adjusts automatically)
```

**Total Impact:** ~220 lines added/modified

---

**Document End**
