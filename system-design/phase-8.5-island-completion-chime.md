# LeFocus: Dynamic Island Completion Chime

**Version:** 1.0 (Implemented)
**Date:** November 2025
**Phase:** 8.5 – Audio Feedback Enhancements
**Status:** ✅ Completed
**Approach:** Swift-native sound playback with Rust bridge trigger

---

## Document Purpose

Phase 8 introduced timer-focused controls and the neon completion glow for the macOS Dynamic Island. Phase 8.5 extends that UX by adding a subtle “ding” whenever a timer completes while the island is visible. The goal is to match Apple’s Dynamic Island behavior (visual + audible confirmation) without disrupting users who continue working in other apps.

This document captures the requirements, architecture, and validation strategy for shipping the completion chime. It supplements [phase-8-island-control-refresh](./phase-8-island-control-refresh.md) and references the same visual targets:

- `/var/folders/dj/34vxgfn95y19by9q0zhj64qw0000gn/T/TemporaryItems/NSIRD_screencaptureui_Rl8iWU/Screenshot 2025-11-21 at 1.21.44 AM.png`
- `/var/folders/dj/34vxgfn95y19by9q0zhj64qw0000gn/T/TemporaryItems/NSIRD_screencaptureui_pEUWNk/Screenshot 2025-11-21 at 1.22.10 AM.png`

---

## Table of Contents

1. [Background](#1-background)
2. [Requirements](#2-requirements)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Audio Asset Handling](#4-audio-asset-handling)
5. [Playback Orchestration](#5-playback-orchestration)
6. [Rust ↔ Swift Signaling](#6-rust--swift-signaling)
7. [UX & Accessibility Considerations](#7-ux--accessibility-considerations)
8. [Testing Strategy](#8-testing-strategy)
9. [Open Questions & Future Work](#9-open-questions--future-work)
10. [User Settings & Sound Selection](#10-user-settings--sound-selection)
11. [React Preview Flow](#11-react-preview-flow)

---

## Implementation Status Summary 

**✅ FULLY IMPLEMENTED** - All core requirements delivered and shipped in current build

| Component | Status | Implementation Details |
|-----------|--------|-----------------------|
| **Swift Audio Engine** | ✅ Complete | `IslandChimePlayer.swift` with AVFoundation, caching, main-thread safety |
| **Rust Bridge** | ✅ Complete | FFI functions `macos_sensing_island_update_chime_preferences` and `macos_sensing_island_preview_chime` |
| **Settings Persistence** | ✅ Complete | JSON settings file with `enabled` and `sound_id` fields, default enabled=true |
| **React UI** | ✅ Complete | Profile ▸ Chimes section with toggle, sound selection, instant preview |
| **Audio Assets** | ✅ Complete | Two bundled sounds: `island_default.wav` and `island_soft.wav` |
| **Tauri Commands** | ✅ Complete | `get_island_sound_settings`, `set_island_sound_settings`, `preview_island_chime` |
| **Completion Logic** | ✅ Complete | Guards against duplicate playback, integrates with IslandController |
| **Error Handling** | ✅ Complete | Graceful fallbacks, logging, toast feedback for failed previews |

** shipped sounds:**
- `island_default.wav` (52.9KB) - Bright ding inspired by Apple's Dynamic Island
- `island_soft.wav` (60.3KB) - Gentler 660Hz tone with quick fade-out

---

## 1. Background

Phase 8 ensured the island remains expanded after a timer ends, highlights the pill with an Apple-like neon green, and keeps End/Cancel controls front-and-center. However, silent completions make it easy to miss the moment when heads-down in another space. Users explicitly asked for the same audible confirmation that Apple’s native timers emit, especially when the island stays pinned at 00:00 waiting for acknowledgement.

Two key observations from dogfooding sessions:

- When users enable focus modes or move to another desktop space, they rarely notice the neon glow alone. An ambient “ding” is required to pull attention back.
- The island now stays visible indefinitely after completion (per phase 8), so we must guarantee the chime only plays once during that steady 00:00 state.

Adding a completion chime satisfies three needs:

1. **Attention cue** – immediate notification without requiring the full LeFocus window to steal focus.
2. **State alignment** – matches the React timer’s “ding” (future) and iOS Dynamic Island behavior.
3. **Reinforcement** – the neon glow provides visual feedback; the chime reinforces it through audio.
4. **Parity with Apple references** – our neon color now matches the screenshots listed above; the chime extends that fidelity into the audio domain.

---

## 2. Requirements ✅ COMPLETED

1. Play a short, single “ding” when a countdown/break session hits 00:00 and `hasTimerFinished` flips to `true`.
2. Trigger only on the first frame of completion; do not replay until the timer restarts.
3. Respect the system output volume and mute state (no custom mixers or gain boosts).
4. Fail gracefully if the audio asset cannot be loaded (e.g., missing bundle resource).
5. Keep the sound local to macOS (no Rust/React sound fallback for other platforms yet).
6. Provide a user-facing toggle to enable/disable the chime.
7. Offer a curated set of sound presets selectable from the React profile page, with instant previews.

Non-requirements for this phase:

- Exposing user-selectable sounds (future work).
- Playing sounds for Cancel/End taps; only natural completion is targeted.
- Volume sliders inside LeFocus (defer until broader audio settings exist).

---

## 3. High-Level Architecture

### 3.1 Component diagram

```
┌─────────────────────────┐        ┌─────────────────────────────┐
│  React Profile / Timer  │        │      TimerController        │
│  (Tauri frontend)       │   set  │  (Rust, async runtime)      │
└────────────┬────────────┘   prefs└────────────┬────────────────┘
             │      emit state changes          │
             │                                   ▼ island_sync(authoritativeMs)
             │                         ┌─────────────────────────────┐
             │ settings events         │     macos_bridge.rs         │
             │────────────────────────▶│  (FFI + AppHandle store)    │
             │                         └────────────┬────────────────┘
             │                                      │ C ABI calls
             │                                      ▼
             │                         ┌─────────────────────────────┐
             │ preview invoke          │  IslandController + View    │
             └────────────────────────▶│  (Swift, AppKit)            │
                                       │   └─ IslandChimePlayer     │
                                       └────────────┬────────────────┘
                                                    ▼
                                            macOS Audio Output
```

### 3.2 Key points

1. Rust already keeps the island running until End/Cancel, so Swift owns the completion transition moment and is the ideal place to gate playback.
2. The chime engine lives purely in Swift to avoid extra Rust dependencies; the existing FFI plumbing remains untouched except for a new “update preferences” call.
3. A `playedChime` flag on `IslandController` (or `IslandTimerPresenter`) ensures we play once per cycle. This flag resets when:
   - timers are restarted (new payload from Rust),
   - the user cancels the session, or
   - End is pressed (Deeplinks into React) and the island collapses.
4. React preference changes propagate through Tauri commands. Rust stores the latest values and forwards them to Swift via a lightweight FFI message so the island can respond in real time.

---

## 4. Audio Asset Handling

### 4.1 Bundled files

| Sound ID | Filename | Description | Duration | Notes |
|----------|----------|-------------|----------|-------|
| `default` | `island_default.caf` | Neutral bell similar to Apple timer | ~650 ms | Ships enabled by default |
| `soft` | `island_soft.caf` | Low-key pluck for quiet environments | ~520 ms | Lower amplitude to respect late-night focus |
| `bell` | `island_bell.caf` | Brighter chime reminiscent of Shortcuts | ~720 ms | Optional preset |

### 4.2 Packaging steps

1. Place the CAF assets under `plugins/macos-sensing/Sources/Resources/Sounds/`.
2. Update `plugins/macos-sensing/Package.swift` so the target declaration explicitly processes that folder:

   ```swift
   // Package.swift (excerpt)
   .target(
       name: "MacOSSensing",
       dependencies: [],
       resources: [
           .process("Resources/Sounds")
       ]
   )
   ```

   Using `.process` ensures SwiftPM copies the entire directory, preserves relative paths, and generates the `Bundle.module` accessor.

3. Confirm that `cargo tauri build` (and the dev build script) copy the compiled plugin bundle—including processed resources—into `src-tauri/resources/libMacOSSensing.dylib`. This already happens because build.rs copies the dylib after SwiftPM finishes; we only need to verify that the `.swiftpm` bundle contains the `Resources` folder (observed in `.swift-build/macos-sensing/release/MacOSSensing.package`).
4. At runtime, resolve assets using `Bundle.module.url(forResource: filename, withExtension: nil)`.

### 4.3 Fallback behavior

- Missing file → log `"IslandChimePlayer: asset not found for soundID=..."` once using `os_log(.error, ...)` and skip playback.
- Corrupt file → catch thrown error from `AVAudioPlayer(contentsOf:)`, log it, and mark the player as unavailable.
- When previewing sounds from React, failures should propagate back through the Tauri command so the UI can show a toast.

---

## 5. Playback Orchestration

### 5.1 IslandChimePlayer

- Singleton `IslandChimePlayer.shared` with:
  - `preferences: IslandSoundPreferences` (enabled flag + sound ID).
  - `playerCache: [String: AVAudioPlayer]` to avoid reloading CAF files every time.
  - `loadPlayer(for:)` – **main-thread** method that instantiates `AVAudioPlayer`, sets `numberOfLoops = 0`, `volume = 1.0`, calls `prepareToPlay()`, and stores it in the cache.
  - `bootstrap()` – invoked from `IslandController.initialize()` (which already runs on the main queue) to pre-warm the default sound so the first completion doesn’t incur disk I/O latency.
  - `play(soundID:, reason:)` – main-thread safe function that rewinds and starts playback; if called off the main thread (e.g., from a Tauri preview command), it dispatches back to `DispatchQueue.main` before touching AVFoundation.

Threading requirement:

> AVAudioPlayer must be created and controlled from a run loop that has already started (typically the main run loop). To avoid “silent” failures during login-item auto launch, `IslandController` will call `IslandChimePlayer.shared.bootstrap()` after `island_init()` creates the window. Only after bootstrap completes do we mark the player ready for completion events.

Pseudo-code:

```swift
final class IslandChimePlayer {
    static let shared = IslandChimePlayer()
    private var playerCache: [String: AVAudioPlayer] = [:]
    private var preferences = IslandSoundPreferences(enabled: true, soundID: "default")
    private var isBootstrapped = false

    func bootstrap() {
        guard !isBootstrapped else { return }
        DispatchQueue.main.async { [weak self] in
            _ = self?.loadPlayer(for: "default")
            self?.isBootstrapped = true
        }
    }

    func updatePreferences(_ prefs: IslandSoundPreferences) {
        DispatchQueue.main.async { [weak self] in
            self?.preferences = prefs
            _ = self?.loadPlayer(for: prefs.soundID)
        }
    }

    func playCompletionIfNeeded() {
        guard preferences.enabled else { return }
        play(soundID: preferences.soundID, reason: .completion)
    }

    func playPreview(soundID: String) {
        play(soundID: soundID, reason: .preview)
    }

    private func play(soundID: String, reason: Reason) {
        let work = {
            let player = self.playerCache[soundID] ?? self.loadPlayer(for: soundID)
            guard let player else { return }
            player.currentTime = 0
            player.play()
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }
}
```

### 5.2 Trigger Logic

Flow inside `IslandController`:

1. `IslandTimerPresenter` calls `onDisplayUpdate(DisplayUpdate)` every second.
2. The controller compares the new `hasTimerFinished` value with the last known value.
3. On first `true`, it:
   - sets `playedCompletionChime = true`,
   - calls `IslandChimePlayer.shared.playCompletionIfNeeded()`,
   - emits analytics event `island_timer_completed` (optional future metric).
4. When `displayMs > 0` again (i.e., new session), or when `reset()` is called, set `playedCompletionChime = false`.

Edge cases handled:

- If the island is collapsed when completion occurs, the chime still plays because the controller receives updates regardless of view visibility.
- If Swift receives multiple `island_sync(0)` events (Rust heartbeat), the guard ensures only the first triggers audio.

---

## 6. Rust ↔ Swift Signaling

### 6.1 Existing flow

```
Rust TimerController      IslandController        IslandChimePlayer
        |                         |                       |
        |   island_sync(0 ms)     |                       |
        | ----------------------> | update(displayMs)     |
        |                         | detect finished?      |
        |                         |---- true ------------>|
        |                         |  playCompletion()     |
        |                         |<-- success/fail ------|
```

### 6.2 Preference propagation

```
React Settings  ──invoke set_island_sound_settings────▶  Rust (Tauri cmd)
       ▲                                                     │ persist to DB / JSON
       │                                                     │
preview invoke                                              │ emit event
       │                                                     ▼
       │                                           macos_bridge::notify_island
       │                                                     │
       └────receive completion──── IslandController ◀────────┘
                                   │ update preferences
                                   └──> IslandChimePlayer.updatePreferences
```

Implementation details:

1. Add a new FFI export: `macos_sensing_island_update_chime_preferences(bool enabled, const char *sound_id)`.
2. Rust exposes `island_update_chime_preferences(enabled: bool, sound_id: &str)`.
3. When the Tauri command saves new settings, it calls the above FFI function on the main thread so Swift can update instantly.
4. Swift stores the new preferences and updates the `IslandChimePlayer` singleton.

---

## 7. UX & Accessibility Considerations

1. **Color + sound parity:** The neon outline (3 px) and timer glyph now match Apple’s screenshots; the chime ensures audible parity.
2. **Respect focus:** We do *not* shift focus or open windows when the chime fires; the island stays put until the user clicks End/Cancel or the React UI takes over (per phase 8).
3. **Accessibility:** Because the chime mirrors Apple’s default behavior, it should feel native. The toggle requested by users doubles as an accessibility control—users sensitive to audio cues can disable it entirely.
4. **Preview volume:** The preview action in React should not alter global volume; it simply reuses the same macOS output route. Consider adding visual feedback (e.g., a checkmark) after the preview finishes.
5. **Do Not Disturb awareness (later):** In future iterations, tie into macOS Focus APIs so we skip audio when DND is active, perhaps showing a subtle badge instead.

---

## 8. Testing Strategy

### 8.1 Manual QA matrix

| Scenario | Steps | Expected |
|----------|-------|----------|
| Countdown completion | Start 25s timer, wait | Chime plays once, neon glow + End button remain |
| Break completion | Start 5m break, wait | Same as countdown |
| Cancel before end | Start timer, cancel at 10s | No chime |
| Multiple completions | Finish timer, start another immediately | Second completion also chimes |
| Toggle off | Disable in settings, run timer | No chime, even at completion |
| Sound switch | Change to `soft`, preview, run timer | Preview + completion use new sound |
| System muted | Mute macOS volume, finish timer | No audible sound, no crash |
| Missing asset | Temporarily rename CAF, run preview | UI error + log entry |

### 8.2 Automated / scripted checks

- Future work: add unit tests around `IslandChimePlayer` to verify that `playedCompletionChime` guard works and that invalid sound IDs fall back gracefully.

### 8.3 Build validation

- `cd src-tauri && cargo build`
- `npm run build`
- Optional: `cargo test -p lefocus` once we add unit tests around the new commands.

---

## 9. Open Questions & Future Work

1. ✅ ~~**User preferences:** Should we add a toggle in the React settings page or reuse macOS Notification settings?~~ → **IMPLEMENTED**: Added comprehensive UI in Profile ▸ Chimes section with toggle and sound selection
2. ✅ ~~**Custom sounds:** Allow importing custom chimes or selecting from presets.~~ → **PARTIALLY IMPLEMENTED**: Added curated preset selection; custom import remains future work
3. ⏸️ **Cross-platform parity:** Windows/Linux builds currently lack any island; chime logic is macOS-only for now
4. 📋 **Do Not Disturb awareness:** Respect Focus modes before playing audio (future hook into macOS status APIs)
5. 📋 **Additional sound options:** Expansion of sound library beyond current two presets
6. 📋 **Volume control:** Per-chime volume adjustments (currently relies on system volume)

---

## 10. User Settings & Sound Selection ✅ COMPLETED

### 10.1 Data model ✅ IMPLEMENTED
- ✅ Extended settings store with `IslandSoundSettings { enabled: bool, sound_id: String }` (default: `true` / `"island_default"`)
- ✅ Exposed Tauri commands `get_island_sound_settings`, `set_island_sound_settings`, `preview_island_chime`
- ✅ Settings persist to JSON file in app data directory

### 10.2 Runtime propagation ✅ IMPLEMENTED
- ✅ Settings changes emit `island-sound-settings-updated` event to all React clients
- ✅ `macos_bridge.rs` forwards updates to Swift via FFI call `macos_sensing_island_update_chime_preferences`
- ✅ `IslandController` caches preferences and passes selected `sound_id` to `IslandChimePlayer`

### 10.3 Swift handling ✅ IMPLEMENTED
- ✅ Bundled WAV assets: `island_default.wav` and `island_soft.wav` (WAV format, not CAF)
- ✅ `IslandChimePlayer` maps `sound_id` → asset URL via `Bundle.module.url(forResource:)`
- ✅ Lazy loading with caching, graceful fallback to `island_default` when missing
- ✅ Completion playback respects `preferences.enabled` and plays once per timer completion cycle

---

## 11. React Preview Flow ✅ COMPLETED

1. ✅ **UI Controls** – `IslandSettingsPage.tsx` provides toggle plus sound selection list under Profile ▸ Chimes. List is disabled when toggle is off.
2. ✅ **Preview command** – On selection, calls `invoke("preview_island_chime", { sound_id })` for instant audio preview without waiting for timer completion.
3. ✅ **Optimistic updates** – `useIslandSoundSettings` hook updates UI instantly, persists via `set_island_sound_settings`, backend event keeps all clients synchronized.
4. ✅ **Error handling** – Failed previews show error message in UI, settings revert to previously saved option. Preview buttons disabled during playback to prevent rapid-fire.

**Keyboard shortcuts implemented:**
- `C` key navigates to Chimes section in Profile
- `T` key toggles chime enable/disable  
- `1-8` keys select sound options (when available)
- `P` key previews selected sound

---

## 12. Swift Implementation Checklist ✅ COMPLETED

1. ✅ **Files touched**
   - ✅ `IslandChimePlayer.swift` (completed)
   - ✅ `IslandController.swift` (updated)
   - ✅ `IslandView.swift` (highlight adjustments completed)
   - ✅ `FFIExports.swift` (preference update entry points added)

2. ✅ **Step-by-step COMPLETED**
   1. ✅ Created `IslandSoundPreferences` struct with `enabled` + `soundID`.
   2. ✅ Implemented `IslandChimePlayer` with AVFoundation, caching, main-thread safety.
   3. ✅ Added completion logic to `IslandController` with proper guards.
   4. ✅ Integration with display updates to trigger chime on timer completion.
   5. ✅ Added `updateChimePreferences(enabled:soundID:)` method invoked via FFI export.
   6. ✅ Registered exports in `FFIExports.swift`:

      ```swift
      @_cdecl("macos_sensing_swift_island_update_chime_preferences")
      public func macos_sensing_swift_island_update_chime_preferences(_ enabled: Bool, _ soundPtr: UnsafePointer<CChar>) {
          let soundID = String(cString: soundPtr)
          DispatchQueue.main.async {
              IslandChimePlayer.shared.updatePreferences(IslandSoundPreferences(enabled: enabled, soundID: soundID))
          }
      }
      ```

3. ✅ **Edge cases HANDLED**
   - ✅ Audio playback properly runs on main thread (AVFoundation requirement).
   - ✅ Preview bypasses completion guards, plays immediately.
   - ✅ Asset loading falls back gracefully with logging.
   - ✅ Player cache prevents repeated file I/O.

---

## 13. Rust / Tauri Implementation Checklist ✅ COMPLETED

1. ✅ **Settings persistence**
   - ✅ Extended `SettingsStore` with `IslandSoundSettings` struct storing to JSON file.
   - ✅ Default values provided: `enabled: true`, `sound_id: "island_default"`.

2. ✅ **Commands**
   - ✅ `#[tauri::command] fn get_island_sound_settings(state: State<AppState>) -> Result<IslandSoundSettings, String>`
   - ✅ `#[tauri::command] fn set_island_sound_settings(settings: IslandSoundSettings, state: State<AppState>, app_handle: AppHandle) -> Result<(), String>`
   - ✅ `#[tauri::command] fn preview_island_chime(sound_id: Option<String>, sound_id_camel: Option<String>) -> Result<(), String>`

3. ✅ **Event emission**
   - ✅ After saving, emits `app_handle.emit("island-sound-settings-updated", &settings)`.
   - ✅ Calls `macos_bridge::island_update_chime_preferences(settings.enabled, &settings.sound_id)`.

4. ✅ **Preview command**
   - ✅ Added `preview_island_chime` which calls FFI endpoint `macos_sensing_island_preview_chime`.
   - ✅ Supports both parameter formats for flexibility.

5. ✅ **Data structures**
   ```rust
   #[derive(Serialize, Deserialize, Clone)]
   pub struct IslandSoundSettings {
       pub enabled: bool,
       pub sound_id: String,
   }
   ```

6. ✅ **macos_bridge.rs additions**
   - ✅ Declared extern functions for FFI calls.
   - ✅ Added wrappers `island_update_chime_preferences()` and `island_preview_chime()` with proper string conversion.

---

## 14. React Implementation Outline (Future)

1. **Data fetching** – Use `react-query` hook `useIslandSoundSettings()` that calls `invoke("get_island_sound_settings")` and caches results.
2. **Mutation** – `useMutation` for `set_island_sound_settings`; on success, invalidate query and rely on backend event for push updates.
3. **Preview** – On click, call `invoke("preview_island_chime", { soundId })`; disable button while promise pending.
4. **UI states** – Show inline description (“Plays when the Dynamic Island timer completes”). Display the neon screenshot as reference.
5. **Fallback** – If the command rejects (Windows/Linux), hide the entire section (since Dynamic Island is macOS-only).

---

## 15. Risks & Rollout

| Risk | Mitigation |
|------|------------|
| Audio not playing due to sandbox restrictions | Use `AVAudioPlayer` (works without special entitlements). Keep logging to detect failures. |
| Excessive chime volume complaints | Provide immediate toggle + plan slider in future phase. |
| Preference desync between frontend and Swift | Emit backend event after every change; Swift listens to keep runtime state fresh. |
| Preview spam causing overlapping playback | Debounce at React layer and gate in Swift (stop current preview before starting another). |

Rollout plan:

1. Land Swift + Rust pieces behind default-enabled flag.
2. Ship React toggle UI in a follow-up release; until then, expose CLI / config option for dogfooding.
3. Monitor logs for asset-loading failures during QA builds.

---

*End of document.*
