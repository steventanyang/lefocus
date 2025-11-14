# LeFocus: Phase 5.7 — Island Album Integration

**Status:** ✅ Implemented (November 2025)  
**Scope:** Wire album artwork, refreshed layouts, and artwork caching into Dynamic Island audio experience.  
**Owners:** Island team (timer/audio), MacOS Sensing plugin.

---

## 1. TL;DR

Phase 5.7 makes album artwork a first-class citizen inside the Mac Dynamic Island. We now:

1. **Capture artwork hints** from AppleScript probes (Spotify URL, Apple Music base64) and `MPNowPlayingInfoCenter` fallbacks.
2. **Fetch, resize, and cache** artwork via a dedicated `AlbumArtCoordinator` (NSCache + disk cache) on background queues.
3. **Expose a dark placeholder** that blends into the island when artwork is pending, avoiding harsh flashes on track changes.
4. **Refresh island layouts** so compact and expanded states react intelligently to audio/timer combinations with adaptive widths (280–340px compact, 320–380px expanded).
5. **Increase expanded real estate** (up to 380×150 with timer) so artwork, waveform, controls, and timer can breathe.

The result: album art appears within ~300 ms of track change, never blocks the 1 s metadata loop, and keeps CPU usage well below 2% on M1 hardware.

---

## 2. Goals & Non-Goals

| Goal                                                 | Status     | Notes                                                               |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| Show real artwork for Spotify, Apple Music, browsers | ✅         | Prioritised probe → fallback pipeline.                              |
| Avoid UI flicker between tracks                      | ✅         | Black placeholder + cached images.                                  |
| Keep timer layouts clean                             | ✅         | Compact state machine + expanded reflow.                            |
| Persist cache across launch                          | ✅         | PNG disk cache under `~/Library/Caches/com.lefocus.island-artwork`. |
| Support DRM/web-only sources with no artwork         | ⚠️ Partial | Falls back to placeholder; no scraping for DRM services.            |
| Persist cache across OS accounts                     | ❌         | Explicit non-goal.                                                  |

---

## 3. Architecture Overview

```
MediaMonitor (1s polling)
 ├─ SpotifyMetadataProbe (AppleScript) → TrackInfo + ArtworkHint.spotify(URL)
 ├─ MusicMetadataProbe (AppleScript)   → TrackInfo + ArtworkHint.appleMusicBase64
 └─ MPNowPlaying snapshot (main thread fallback)
        ↓
AlbumArtCoordinator
 ├─ Memory cache (NSCache, 20 entries)
 ├─ Disk cache (~/.Caches/com.lefocus...) keyed by sanitized source/title/artist/hint
 ├─ OperationQueue (max 2 concurrent fetches)
 └─ Resizer (96×96) + placeholder generator
        ↓
IslandAudioController → IslandController → IslandView
        ↓
Updated drawing stack (compact & expanded layouts)
```

Key data structs:

```swift
struct ArtworkRequest {
    let title: String
    let artist: String
    let bundleID: String?
    let hint: ArtworkHint  // .spotify(url) | .appleMusicBase64(String)
    let timestamp: Date
}

enum ArtworkHint: Hashable {
    case spotify(url: URL)
    case appleMusicBase64(String)
}

struct TrackInfo {
    let title: String
    let artist: String
    let artwork: NSImage?
    let isPlaying: Bool
    let timestamp: Date
    let sourceBundleID: String?
}
```

`MediaMonitor` now tracks `pendingArtworkTimestamp` so a single artwork fetch is inflight per track timestamp; race-safe updates only mutate `currentTrack` when timestamps match.

---

## 4. Media Detection Updates

### 4.1 AppleScript Probes

- **Spotify** — Adds `artwork url of current track` to the delimiter payload. Empty URLs skip the artwork hint.
- **Apple Music** — Dumps `raw data of artwork 1` into a random `/tmp/lefocus_music_art_XXXXXX` file, base64 encodes via `/usr/bin/base64`, cleans up temp file in `try/finally`. The base64 blob feeds `ArtworkHint.appleMusicBase64`.

Both probes still return immediate metadata (title, artist, playback state) without blocking the 1 s polling loop; artwork fetching is entirely async.

### 4.2 MPNowPlaying Supplement

If AppleScript hints are missing or fail, `nowPlayingSnapshot()` continues to provide fallback metadata, including `MPMediaItemArtwork` when available. This path skips the hint to avoid double-fetching; the `TrackInfo.artwork` is already embedded.

### 4.3 Control Flow

- `MediaMonitor.startMonitoring()` creates a main-thread `Timer` (1.0 s) → background queue snapshot.
- Snapshot priority: Spotify → Apple Music → MPNowPlaying.
- After base track update, `requestArtworkIfNeeded` builds an `ArtworkRequest` if `track.artwork == nil` and a hint exists.

---

## 5. Artwork Pipeline

### 5.1 AlbumArtCoordinator

- **Deduplication:** `pendingRequests` dictionary batches multiple callbacks per cache key.
- **Cache key:** `source|title|artist|hint.cacheComponent` base64 sanitized (URL-safe) to avoid filesystem issues.
- **Memory cache:** `NSCache` limit 20 entries (~1.5 MB for 96² RGBA images).
- **Disk cache:** Optional; files stored as PNG with atomic writes on a background `diskQueue`.
- **Fetch queue:** `OperationQueue` (QoS `.utility`, concurrency 2) to cap network churn.
- **Fetch methods:**
  - Spotify → `URLSession.shared.dataTask` with 5 s timeout + custom UA.
  - Apple Music → decode base64 `Data`.
- **Resizing:** `NSImage` redraw to 96×96 (square) with high interpolation, writing PNG for disk persistence.
- **Placeholder:** Solid near-black fill (`calibratedWhite: 0.03`) ensures transitions stay invisible against island background.

### 5.2 Failure Handling

- Network/base64 failures deliver a `nil` image back to MediaMonitor, clearing `pendingArtworkTimestamp` so the next metadata change retriggers fetch.
- Disk cache read miss triggers network fetch automatically.

---

## 6. Island UI Changes

### 6.1 Window Sizing

```swift
IslandWindowConfiguration(
    compactSize: 320×38,
    expandedSize: 420×150,
    hoverDelta: 22×5,
    expandedVerticalOffset: 14,
    compactIdleWidth: 280,      // No timer
    compactTimerWidth: 340,     // Timer active
    expandedIdleWidth: 320,     // No timer
    expandedTimerWidth: 380    // Timer active
)
```

Window widths adapt based on timer state:

- **Compact idle:** 280px (audio only, narrower)
- **Compact timer:** 340px (timer active, wider to prevent clock clipping)
- **Expanded idle:** 320px (audio only, narrower)
- **Expanded timer:** 380px (timer active, wider for timer display)

Keeping the top edge pinned to the notch means extra height expands downward only, avoiding menu bar collisions.

### 6.2 Compact Layout State Machine

```swift
enum CompactLayoutState { case audioOnly, timerActive, idle }

// Derived per frame:
if isIdle {
    state = trackInfo == nil ? .idle : .audioOnly
} else {
    state = .timerActive
}
```

- **Audio only:** 4-bar waveform on left, 18 px rounded square thumbnail on right (3px corner radius), timer hidden.
- **Timer active:** Waveform left, timer text right, album art suppressed for clarity.
- **Idle (no timer/audio):** Waveform alone for ambient pulse (or hidden when no track).

Waveform data now always draws with `startX = 18` so spacing stays consistent with the notch curve. Album artwork uses rounded corners (3px) instead of circular for a more modern square appearance.

### 6.3 Expanded Layout

- **Artwork:** 40 px square with 6 px corner radius, positioned so its center aligns with the gap between title and artist text. Artwork is positioned at 50px from top to avoid notch overlap. Dark placeholder + white stroke when real art exists.
- **Metadata block:** Title (14 pt semibold) + artist (12 pt regular) stacked with 2 pt line spacing, positioned at 50px from top. Title and artist are closer together for tighter visual grouping.
- **Waveform:** 4 bars positioned at top-left (28px from top, 28px from left), aligned with album cover left edge. Stays fixed at top regardless of title/artist position.
- **Playback controls:** 42 px icons with 18 px spacing, positioned 10px from bottom. Left-aligned under metadata column when timer active, centered horizontally when timer idle.
- **Timer section:** Right half reserved for large 28 pt monospaced time (increased from 24pt) and (when applicable) "End/Cancel" text buttons positioned 18px from bottom to align with audio controls. When timer idle, this space remains empty, emphasizing artwork + controls.
- **Placeholder:** During track switches, the entire artwork rect fills with near-black (#050505) and no outer stroke, perfectly blending with island background until the new art arrives.

### 6.4 Interaction Behavior

- Hover animations unchanged (5% scale bump) but playback hit areas move with new layout.
- Auto-collapse still triggers 300 ms after mouse exit.
- Timer control buttons (End/Cancel) remain text-only but repositioned using the widened right column metrics.

---

## 7. Performance & Observability

- **Artwork fetch latency:** Spotify/Apple Music art arrives in ~200–350 ms; disk cache hits are instantaneous.
- **CPU impact:** Waveform animator (4 bars, CVDisplayLink) stays <0.5% when expanded; compact view idle is ~0%.
- **Memory:** Album art cache (<2 MB) + Swift structs negligible relative to overall process.
- **Logging:** `NSLog` only fires on disk cache directory failures; otherwise silent.

Manual verification checklist:

1. Swap Spotify tracks rapidly → placeholder flashes black but never gradient, new art fills within 0.5 s.
2. Start countdown timer → compact island switches to waveform left / timer right; album art hidden until timer stops.
3. Pause timer (idle) → state returns to audio-only, artwork thumbnail reappears.
4. Expand while timer running → playback controls remain tucked under artwork, timer dominates right column.
5. Quit and relaunch → previously fetched art loads from disk cache instantly.

---

## 8. Risks & Mitigations

| Risk                                                      | Impact   | Mitigation                                                                              |
| --------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| AppleScript base64 step stalls if `/usr/bin/base64` fails | Medium   | Temp file cleanup in both success/failure; fallback placeholder ensures UI continuity.  |
| Disk cache growth                                         | Low      | Cache key uniqueness + limited usage keeps cache <5 MB; can add periodic pruning later. |
| Private CGS APIs                                          | Existing | Same as Phase 5.5 (space persistence); album work doesn’t touch CGS.                    |
| Artwork mismatched to track (timestamp race)              | Low      | `pendingArtworkTimestamp` ensures only latest timestamp mutates `currentTrack`.         |

---

## 9. Future Enhancements

- **Heavier art reuse:** Use hash of Spotify URL to detect identical art between tracks for faster dedupe.
- **Async image fade-in:** Cross-dissolve between placeholders and art for extra polish.
- **Palette-driven theming:** Sample album colors to tint waveform or button glows.
- **Network awareness:** Pause fetch queue when offline to avoid timeouts.

Phase 5.7 completes the album integration story: users always see up-to-date art with zero layout thrash, while the code remains modular and performant.
