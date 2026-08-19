# Sensing Pipeline Evolution: Metadata-Only Tracking

**Status:** Implemented  
**Last updated:** August 9, 2026

## Current design

LeFocus tracks the application that is currently frontmost during an active focus session. It does not capture the screen, inspect pixels, or run OCR.

Every five seconds:

1. Rust calls the macOS Swift plugin through the C FFI bridge.
2. Swift reads `NSWorkspace.shared.frontmostApplication`.
3. Swift returns the bundle identifier and localized application name.
4. Rust caches the application icon and writes a `context_readings` row.
5. Rust emits metadata/database timing and process CPU/RAM metrics to the diagnostics UI.

```text
TimerView
  -> useTimer.startTimer()
  -> Tauri start_timer command
  -> TimerController
  -> SensingController
  -> sensing_loop (every 5 seconds)
  -> NSWorkspace.frontmostApplication
  -> context_readings
  -> segmentation when the session ends
```

Timer startup does not preflight or request Screen Recording permission. The only permission management remaining in Settings is optional Spotify Automation access for media controls.

## Metadata contract

The Swift-to-Rust `WindowMetadata` shape is preserved:

- `bundle_id`: bundle identifier of the frontmost application.
- `owner_name`: `localizedName`, falling back to the bundle identifier.
- `window_id`: `0` because individual windows are no longer enumerated.
- `title`: empty because reading a specific window title would require a separate API and is not needed for app-level tracking.
- `bounds`: zeroed because monitor/window geometry is not used by sensing.

Multi-monitor selection is not part of the sensing pipeline. `NSWorkspace.frontmostApplication` identifies the globally active application regardless of which display contains its window. Dynamic Island display placement remains a separate subsystem.

## Removed pipeline

The original implementation enumerated windows with ScreenCaptureKit, selected a window near the cursor, captured a screenshot, computed a perceptual hash, and conditionally ran Vision OCR. That path was removed because its output was not used by the product and it introduced Screen Recording permission friction.

Removed components include:

- ScreenCaptureKit and Vision framework links.
- Screenshot and OCR Swift implementations and FFI exports.
- Screen Recording and unused Accessibility permission commands.
- Rust screenshot/OCR bridge functions and the pHash module.
- `image` and `image_hasher` Rust dependencies.
- Screenshot, pHash, and OCR diagnostics fields.
- Screen Recording Settings UI and frontend permission hook.

## Database compatibility

The following nullable columns and model properties remain so existing user databases and historical sessions can still be read:

- `context_readings.phash`
- `context_readings.ocr_text`
- `context_readings.ocr_confidence`
- `context_readings.ocr_word_count`
- `segments.visual_clarity_score`
- `segments.ocr_quality_score`
- `segments.unique_phash_count`

New context readings write `NULL` for the pHash/OCR fields. New segments likewise leave visual clarity, OCR quality, and unique-pHash aggregates `NULL`. Historical values remain readable and are never rewritten merely because the app upgraded.

No destructive migration should remove these columns unless an explicit database compatibility and migration plan is introduced.

## Segmentation confidence

App-level segmentation groups consecutive readings by bundle identifier and applies the existing short-interruption sandwich merge. Confidence now uses only signals produced by the current pipeline:

- duration score: weight `3/7`;
- bundle stability score: weight `4/7`.

These weights preserve the relative 3:4 weighting those signals had before visual and OCR scoring were removed. Legacy visual/OCR score columns do not contribute a synthetic default to new segment confidence.

## Diagnostics

The metrics dashboard now reports only active work:

- metadata lookup time;
- database write time;
- total capture time;
- CPU and memory usage;
- capture count and recent capture history.

## Validation checklist

- Start a countdown or stopwatch without Screen Recording permission.
- Switch between applications, including applications on different monitors.
- Confirm session results show the correct app names and icons.
- Confirm no Screen Recording prompt appears.
- Confirm Settings only shows Spotify Automation permission management.
- Confirm the diagnostics breakdown contains only Metadata and DB Write stages.
