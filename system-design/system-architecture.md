# LeFocus System Architecture (Backend P0)

## Purpose

- Concise map of backend systems (Rust/Tauri + Swift dylib) for fast onboarding and LLM context.
- Frontend is in progress and intentionally omitted.

## High-level

```
React UI (omitted)
        │ Tauri IPC
        ▼
Rust Core (Tauri)
  • Commands (timer/audio/tests)
  • Orchestration, FFI bridge
        │ FFI (C ABI via C shim)
        ▼
Swift dylib (MacOSSensing)
  • ScreenCaptureKit (window capture)
  • Vision (OCR)
  • ImageIO (decode)
```

## Responsibilities

- Rust/Tauri
  - Define commands; call FFI; handle memory; (future) sensing/segmentation/storage.
- Swift dylib
  - Resolve frontmost window; capture per-window PNG; run OCR; enforce concurrency; manage buffers.
- Build/Bundle
  - `build.rs` compiles Swift, sets rpaths, copies dylib to `resources/`; Tauri bundles it.

## Data & Flow (test commands)

1. get window → `macos_sensing_get_active_window_metadata()` → returns window id/bundle/title/bounds.
2. capture screenshot → `macos_sensing_capture_screenshot(id)` → PNG bytes.
3. run ocr → `macos_sensing_run_ocr(png)` → { text, confidence, wordCount }.

## Concurrency

- Swift
  - `stateQueue` serializes `windowCache`, `lastCacheUpdate`, `lastActiveWindowId`.
  - Capture serialized via `captureSemaphore`.
  - OCR serialized via `ocrQueue`; request reused; ImageIO decode (no AppKit on background threads).
  - FFI uses `Task.detached` + semaphores (5s timeout) to avoid deadlock.
- Rust
  - Tauri commands are synchronous (for tests); consider `spawn_blocking` when integrating.

## FFI Surface (C ABI via shim)

- Functions
  - `macos_sensing_get_active_window_metadata() -> *mut WindowMetadataFFI`
  - `macos_sensing_capture_screenshot(u32, *mut size_t) -> *mut u8`
  - `macos_sensing_run_ocr(*const u8, size_t) -> *mut OCRResultFFI`
  - Free: `macos_sensing_free_window_metadata`, `macos_sensing_free_screenshot_buffer`, `macos_sensing_free_ocr_result`
- Structs (C)
  - `WindowMetadataFFI { u32 windowId; char* bundleIdPtr; char* titlePtr; char* ownerNamePtr; f64 boundsX/Y/Width/Height; }`
  - `OCRResultFFI { char* textPtr; double confidence; uint64_t wordCount; }`
- Rust mirrors
  - `usize` for `size_t`, `u64` for `wordCount`.

## Build & Packaging

- Dev
  - `src-tauri/build.rs`: builds Swift package; sets rpaths for build dir & bundle; copies dylib to `src-tauri/resources/`.
- Bundle
  - `src-tauri/tauri.conf.json`: includes `resources/libMacOSSensing.dylib` so it ships in app.

## File structure (backend)

```
src-tauri/
  Cargo.toml
  Cargo.lock
  build.rs                         # builds Swift, sets rpaths, copies dylib, runs tauri_build
  tauri.conf.json                  # bundles resources/libMacOSSensing.dylib
  resources/
    libMacOSSensing.dylib          # built artifact (not committed)
  src/
    main.rs                        # Tauri entry
    lib.rs                         # Tauri commands; registers handlers
    macos_bridge.rs                # Safe Rust FFI wrappers -> C shim
    audio/
      mod.rs
      binaural.rs
      brown_noise.rs
      rain.rs
  plugins/macos-sensing/
    Package.swift                  # Swift package (.dynamic library)
    Sources/
      CMacOSSensing/
        include/MacOSSensingFFI.h  # C ABI header (exported)
        MacOSSensingFFI.c          # C shim bridging Swift @_cdecl hooks
      MacOSSensing/
        FFITypes.swift             # typealiases -> C structs
        FFIExports.swift           # @_cdecl hooks + semaphores/timeouts
        MacOSSensing.swift         # Window cache, capture, OCR

system-design/
  system-architecture.md           # this document
  system-design-p0.md
  phase-1-swift-plugin.md
  p0prd.md
  p1-improvements.md
  notes.md
  lefocus.md
```

## Tauri commands (current)

- `test_get_window() -> WindowMetadata`
- `test_capture_screenshot(window_id: u32) -> String`
- `test_run_ocr(image_path: String) -> OCRResult`
- Legacy audio: `start_audio`, `stop_audio`, `toggle_pause`, `set_volume`

## Known decisions

- macOS min: Swift package set to 14 (can lower to 13 if needed).
- No persistent raw images; OCR and hashing consume in-memory PNGs.
- FFI calls have 5s timeout; Rust bails on null/empty results.

## Next wiring (P0)

- Add sensing pipeline + segmentation; move commands to async + `spawn_blocking` for capture/OCR; integrate SQLite WAL.
