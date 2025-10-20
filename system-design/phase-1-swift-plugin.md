# LeFocus Phase 1: Swift Tauri Plugin

**Version:** 0.1
**Date:** October 2025
**Phase:** 1 of 3 (P0 Implementation)
**Status:** Implementation Ready

---

## Document Purpose

This document specifies **Phase 1** of the LeFocus P0 implementation: building a working Swift Tauri plugin that exposes macOS screen APIs to Rust.

**Phase 1 Goal:** By the end of this phase, we can call Swift functions from Rust to:
1. Get active window metadata (bundle ID, title, window ID)
2. Capture screenshots of specific windows (PNG format)
3. Run OCR on images (Vision.framework)

**Success Criteria:** All three functions work independently and can be tested via a simple Tauri command.

---

## Table of Contents

1. [Phase 1 Overview](#1-phase-1-overview)
2. [What We're Building](#2-what-were-building)
3. [Swift Plugin Architecture](#3-swift-plugin-architecture)
4. [API Specification](#4-api-specification)
5. [Implementation Details](#5-implementation-details)
6. [Rust-Swift Bridge](#6-rust-swift-bridge)
7. [Testing Strategy](#7-testing-strategy)
8. [Acceptance Criteria](#8-acceptance-criteria)
9. [References](#9-references)

---

## 1. Phase 1 Overview

### 1.1 Why Phase 1 First?

Building the Swift plugin first provides:
- **De-risked macOS integration:** Validate ScreenCaptureKit + Vision.framework work as expected
- **Clear API contract:** Establishes interface between Rust and Swift before building sensing pipeline
- **Testability:** Can manually test each function independently
- **Foundation:** Required for Phases 2 (sensing pipeline) and 3 (segmentation + UI)

### 1.2 Out of Scope (Phase 1)

- Timer logic
- Context sensing pipeline
- Segmentation algorithm
- React UI
- Database/persistence
- Performance optimization

---

## 2. What We're Building

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────┐
│         Tauri App (Rust Core)               │
│                                             │
│  User Test → Tauri Command → Plugin Call   │
└──────────────────┬──────────────────────────┘
                   │ FFI / Process spawn
┌──────────────────▼──────────────────────────┐
│     Swift Tauri Plugin (macos-sensing)      │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  getActiveWindowMetadata()           │  │
│  │  → Returns window ID, bundle, title  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  captureActiveWindowScreenshot(id)   │  │
│  │  → Returns PNG Data                  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  runOCR(imageData)                   │  │
│  │  → Returns text + confidence         │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 2.2 Deliverables

1. **Swift Plugin Package** (`src-tauri/scripts/macos_sensing.swift`)
   - Standalone Swift script (using script approach for P0)
   - Implements 3 functions
   - Returns JSON to stdout

2. **Rust Bridge Module** (`src-tauri/src/macos_bridge.rs`)
   - Spawns Swift script
   - Parses JSON output
   - Exposes safe Rust API

3. **Test Tauri Commands** (`src-tauri/src/lib.rs`)
   - `test_get_window` - Prints active window metadata
   - `test_capture_screenshot` - Saves screenshot to disk
   - `test_run_ocr` - Prints OCR results

4. **Simple Test UI** (`src/App.tsx`)
   - Three buttons to test each function
   - Displays results

---

## 3. Swift Plugin Architecture

### 3.1 Implementation Approach

**Decision:** Use **Swift script** approach (not compiled dylib) for Phase 1.

**Rationale:**
- Faster iteration (no build step)
- Easier debugging (just edit .swift file)
- Good enough for P0 performance
- Can migrate to compiled plugin in P1 if needed

### 3.2 File Structure

```
src-tauri/
├── scripts/
│   └── macos_sensing.swift          # Standalone Swift script
├── src/
│   ├── lib.rs                       # Tauri commands
│   └── macos_bridge.rs              # Rust-Swift bridge
└── Cargo.toml
```

### 3.3 Swift Script Structure

```swift
#!/usr/bin/env swift

import Cocoa
import Vision
import ScreenCaptureKit
import Foundation

// Command-line interface
enum Command: String {
    case getWindow = "get-window"
    case captureScreenshot = "capture-screenshot"
    case runOCR = "run-ocr"
}

// Entry point
func main() {
    guard CommandLine.arguments.count > 1,
          let command = Command(rawValue: CommandLine.arguments[1]) else {
        print("{\"error\": \"Invalid command\"}")
        exit(1)
    }

    Task {
        do {
            let result = try await executeCommand(command)
            print(result)
        } catch {
            print("{\"error\": \"\(error.localizedDescription)\"}")
            exit(1)
        }
    }

    RunLoop.main.run()
}

main()
```

---

## 4. API Specification

### 4.1 Function 1: Get Active Window Metadata

**Purpose:** Return metadata of the currently active (frontmost) window.

#### Swift Function Signature
```swift
func getActiveWindowMetadata() async throws -> [String: Any]
```

#### Input
- None (uses `NSWorkspace.shared.frontmostApplication`)

#### Output (JSON)
```json
{
  "windowId": 12345,           // CGWindowID (UInt32)
  "bundleId": "com.microsoft.VSCode",
  "title": "main.rs - lefocus",
  "ownerName": "Visual Studio Code",
  "bounds": {
    "x": 100.0,
    "y": 200.0,
    "width": 1280.0,
    "height": 800.0
  }
}
```

#### Error Cases
```json
{
  "error": "No active window found"
}
```

---

### 4.2 Function 2: Capture Screenshot

**Purpose:** Capture a PNG screenshot of a specific window by ID.

#### Swift Function Signature
```swift
func captureScreenshot(windowId: UInt32) async throws -> Data
```

#### Input
- `windowId`: CGWindowID from `getActiveWindowMetadata()`

#### Output
- PNG image data (binary)
- **Format:** PNG (not TIFF)
- **Max width:** 1280px (downscaled, aspect ratio preserved)
- **Color space:** BGRA (no grayscale conversion in Swift)

#### Output (JSON - Base64 encoded for CLI interface)
```json
{
  "imageData": "iVBORw0KGgoAAAANSUhEUgAA...",  // Base64 PNG
  "width": 1280,
  "height": 800
}
```

#### Error Cases
```json
{
  "error": "Window not found",
  "windowId": 12345
}
```

---

### 4.3 Function 3: Run OCR

**Purpose:** Extract text from an image using Vision.framework.

#### Swift Function Signature
```swift
func runOCR(imageData: Data) async throws -> [String: Any]
```

#### Input
- PNG image data (binary)

#### Output (JSON)
```json
{
  "text": "Hello world\nThis is a test",
  "confidence": 0.92,
  "wordCount": 6
}
```

#### Error Cases
```json
{
  "error": "Failed to decode image"
}
```

---

## 5. Implementation Details

### 5.1 Window Metadata Implementation

**Key Requirements:**
- Use `SCShareableContent` (ScreenCaptureKit) for `CGWindowID`
- Cache window list (refresh every 5s)
- Match window by bundle ID + isOnScreen

```swift
private var windowCache: [CGWindowID: SCWindow] = [:]
private var lastCacheUpdate: Date = .distantPast

func getActiveWindowMetadata() async throws -> [String: Any] {
    // 1. Get frontmost app
    guard let app = NSWorkspace.shared.frontmostApplication else {
        throw NSError(domain: "MacOSSensing", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "No active application"
        ])
    }

    // 2. Refresh cache if stale (> 5s)
    if Date().timeIntervalSince(lastCacheUpdate) > 5.0 {
        try await refreshWindowCache()
    }

    // 3. Find window by bundle ID
    guard let content = try? await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true
    ),
    let window = content.windows.first(where: {
        $0.owningApplication?.bundleIdentifier == app.bundleIdentifier &&
        $0.isOnScreen
    }) else {
        throw NSError(domain: "MacOSSensing", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "No window found for active app"
        ])
    }

    // 4. Return metadata
    return [
        "windowId": window.windowID,
        "bundleId": app.bundleIdentifier ?? "",
        "title": window.title ?? "",
        "ownerName": window.owningApplication?.applicationName ?? "",
        "bounds": [
            "x": window.frame.origin.x,
            "y": window.frame.origin.y,
            "width": window.frame.size.width,
            "height": window.frame.size.height
        ]
    ]
}

private func refreshWindowCache() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true
    )
    windowCache.removeAll()
    for window in content.windows where window.isOnScreen {
        windowCache[window.windowID] = window
    }
    lastCacheUpdate = Date()
}
```

### 5.2 Screenshot Capture Implementation

**Key Requirements:**
- Use cached window reference (avoid frame matching)
- Downscale to max 1280px width
- Return PNG format (smaller than TIFF)

```swift
func captureScreenshot(windowId: UInt32) async throws -> Data {
    // 1. Get window from cache
    if windowCache[windowId] == nil {
        try await refreshWindowCache()
    }

    guard let window = windowCache[windowId] else {
        throw NSError(domain: "MacOSSensing", code: 3, userInfo: [
            NSLocalizedDescriptionKey: "Window not found: \(windowId)"
        ])
    }

    // 2. Configure capture
    let filter = SCContentFilter(desktopIndependentWindow: window)
    let config = SCStreamConfiguration()

    let targetWidth = min(Int(window.frame.width), 1280)
    let scale = CGFloat(targetWidth) / window.frame.width
    config.width = targetWidth
    config.height = Int(window.frame.height * scale)
    config.pixelFormat = kCVPixelFormatType_32BGRA
    config.showsCursor = false

    // 3. Capture
    guard let cgImage = try? await SCScreenshotManager.captureImage(
        contentFilter: filter,
        configuration: config
    ) else {
        throw NSError(domain: "MacOSSensing", code: 4, userInfo: [
            NSLocalizedDescriptionKey: "Screenshot capture failed"
        ])
    }

    // 4. Convert to PNG
    guard let bitmapRep = NSBitmapImageRep(cgImage: cgImage),
          let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "MacOSSensing", code: 5, userInfo: [
            NSLocalizedDescriptionKey: "PNG encoding failed"
        ])
    }

    return pngData
}
```

### 5.3 OCR Implementation

**Key Requirements:**
- Use Vision.framework with `.fast` mode
- Disable language correction (faster)
- Return avg confidence + word count

```swift
func runOCR(imageData: Data) async throws -> [String: Any] {
    // 1. Decode image
    guard let nsImage = NSImage(data: imageData),
          let cgImage = nsImage.cgImage(
            forProposedRect: nil,
            context: nil,
            hints: nil
          ) else {
        throw NSError(domain: "MacOSSensing", code: 6, userInfo: [
            NSLocalizedDescriptionKey: "Failed to decode image"
        ])
    }

    // 2. Configure OCR request
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = false

    // 3. Perform OCR
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return [
            "text": "",
            "confidence": 0.0,
            "wordCount": 0
        ]
    }

    // 4. Extract results
    let recognizedText = observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")

    let confidences = observations.compactMap { $0.topCandidates(1).first?.confidence }
    let avgConfidence = confidences.isEmpty ? 0.0 : confidences.reduce(0, +) / Double(confidences.count)

    return [
        "text": recognizedText,
        "confidence": avgConfidence,
        "wordCount": observations.count
    ]
}
```

---

## 6. Rust-Swift Bridge

### 6.1 Bridge Module (`src-tauri/src/macos_bridge.rs`)

```rust
use std::process::Command;
use serde::{Deserialize, Serialize};
use anyhow::{Result, Context};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowMetadata {
    #[serde(rename = "windowId")]
    pub window_id: u32,
    #[serde(rename = "bundleId")]
    pub bundle_id: String,
    pub title: String,
    #[serde(rename = "ownerName")]
    pub owner_name: String,
    pub bounds: WindowBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    #[serde(rename = "imageData")]
    pub image_data: String,  // Base64 encoded
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCRResult {
    pub text: String,
    pub confidence: f64,
    #[serde(rename = "wordCount")]
    pub word_count: usize,
}

pub async fn get_active_window_metadata() -> Result<WindowMetadata> {
    let output = Command::new("swift")
        .arg("scripts/macos_sensing.swift")
        .arg("get-window")
        .output()
        .context("Failed to execute Swift script")?;

    if !output.status.success() {
        anyhow::bail!("Swift script failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    let json_str = String::from_utf8(output.stdout)
        .context("Invalid UTF-8 in Swift output")?;

    serde_json::from_str(&json_str)
        .context("Failed to parse window metadata JSON")
}

pub async fn capture_screenshot(window_id: u32) -> Result<Vec<u8>> {
    let output = Command::new("swift")
        .arg("scripts/macos_sensing.swift")
        .arg("capture-screenshot")
        .arg(window_id.to_string())
        .output()
        .context("Failed to execute Swift script")?;

    if !output.status.success() {
        anyhow::bail!("Swift script failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    let json_str = String::from_utf8(output.stdout)
        .context("Invalid UTF-8 in Swift output")?;

    let result: ScreenshotResult = serde_json::from_str(&json_str)
        .context("Failed to parse screenshot JSON")?;

    // Decode base64
    let image_data = base64::decode(&result.image_data)
        .context("Failed to decode base64 image data")?;

    Ok(image_data)
}

pub async fn run_ocr(image_data: &[u8]) -> Result<OCRResult> {
    // Encode image data as base64 for CLI passing
    let base64_data = base64::encode(image_data);

    let output = Command::new("swift")
        .arg("scripts/macos_sensing.swift")
        .arg("run-ocr")
        .arg(base64_data)
        .output()
        .context("Failed to execute Swift script")?;

    if !output.status.success() {
        anyhow::bail!("Swift script failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    let json_str = String::from_utf8(output.stdout)
        .context("Invalid UTF-8 in Swift output")?;

    serde_json::from_str(&json_str)
        .context("Failed to parse OCR JSON")
}
```

### 6.2 Tauri Commands (`src-tauri/src/lib.rs`)

```rust
mod macos_bridge;

use macos_bridge::*;

#[tauri::command]
async fn test_get_window() -> Result<WindowMetadata, String> {
    get_active_window_metadata()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_capture_screenshot(window_id: u32) -> Result<String, String> {
    let image_data = capture_screenshot(window_id)
        .await
        .map_err(|e| e.to_string())?;

    // Save to file for testing
    std::fs::write("/tmp/lefocus_test_screenshot.png", &image_data)
        .map_err(|e| e.to_string())?;

    Ok(format!("Screenshot saved: {} bytes", image_data.len()))
}

#[tauri::command]
async fn test_run_ocr(image_path: String) -> Result<OCRResult, String> {
    let image_data = std::fs::read(&image_path)
        .map_err(|e| e.to_string())?;

    run_ocr(&image_data)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            test_get_window,
            test_capture_screenshot,
            test_run_ocr,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 7. Testing Strategy

### 7.1 Manual Testing UI

Add test buttons to `src/App.tsx`:

```typescript
import { invoke } from '@tauri-apps/api/core';

function App() {
  const [windowData, setWindowData] = useState(null);
  const [screenshotStatus, setScreenshotStatus] = useState('');
  const [ocrResult, setOcrResult] = useState(null);

  const testGetWindow = async () => {
    try {
      const result = await invoke('test_get_window');
      setWindowData(result);
      console.log('Window metadata:', result);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const testCaptureScreenshot = async () => {
    if (!windowData) {
      alert('Get window metadata first');
      return;
    }
    try {
      const result = await invoke('test_capture_screenshot', {
        windowId: windowData.windowId
      });
      setScreenshotStatus(result);
      console.log(result);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const testOCR = async () => {
    try {
      const result = await invoke('test_run_ocr', {
        imagePath: '/tmp/lefocus_test_screenshot.png'
      });
      setOcrResult(result);
      console.log('OCR result:', result);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="container">
      <h1>Phase 1: Swift Plugin Test</h1>

      <div className="test-section">
        <h2>1. Get Active Window</h2>
        <button onClick={testGetWindow}>Test Get Window</button>
        {windowData && (
          <pre>{JSON.stringify(windowData, null, 2)}</pre>
        )}
      </div>

      <div className="test-section">
        <h2>2. Capture Screenshot</h2>
        <button onClick={testCaptureScreenshot}>Test Capture</button>
        <p>{screenshotStatus}</p>
      </div>

      <div className="test-section">
        <h2>3. Run OCR</h2>
        <button onClick={testOCR}>Test OCR</button>
        {ocrResult && (
          <pre>{JSON.stringify(ocrResult, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
```

### 7.2 Test Workflow

**Step 1: Test Get Window**
1. Open VS Code (or any app with visible text)
2. Click "Test Get Window"
3. Verify output contains:
   - Valid `windowId` (number)
   - Correct `bundleId` (e.g., `com.microsoft.VSCode`)
   - Correct `title`
   - Non-zero `bounds`

**Step 2: Test Screenshot**
1. Ensure window from Step 1 is visible
2. Click "Test Capture"
3. Verify:
   - Status message shows byte count
   - File exists: `/tmp/lefocus_test_screenshot.png`
   - Open file, verify it shows correct window content
   - Check dimensions ≤ 1280px width

**Step 3: Test OCR**
1. Ensure screenshot from Step 2 exists
2. Click "Test OCR"
3. Verify:
   - `text` contains recognized text from screenshot
   - `confidence` is between 0.0-1.0
   - `wordCount` > 0

---

## 8. Acceptance Criteria

| Criterion | Pass Condition |
|-----------|----------------|
| **Get Window** | Returns valid metadata for frontmost window |
| **Window ID** | `windowId` is non-zero and type `u32` |
| **Bundle ID** | Matches actual frontmost app |
| **Screenshot Format** | PNG file, valid image, opens correctly |
| **Screenshot Size** | Width ≤ 1280px, aspect ratio preserved |
| **Screenshot Content** | Visual content matches active window |
| **OCR Text** | Recognizes visible text from screenshot |
| **OCR Confidence** | Value between 0.0-1.0 |
| **Error Handling** | Graceful errors when no window/invalid input |
| **Performance** | Each function completes in < 2s |

---

## 9. References

### 9.1 Related Documents
- **Main P0 System Design:** `system-design-p0.md`
- **Product Requirements:** `p0.md`
- **Design Notes:** `notes.md`

### 9.2 macOS APIs
- [ScreenCaptureKit Documentation](https://developer.apple.com/documentation/screencapturekit)
- [Vision Framework - Text Recognition](https://developer.apple.com/documentation/vision/recognizing_text_in_images)
- [NSWorkspace - Frontmost Application](https://developer.apple.com/documentation/appkit/nsworkspace)

### 9.3 Next Steps (Phase 2)
After Phase 1 completes:
- Build context sensing pipeline (polling loop)
- Integrate Swift plugin into worker architecture
- Implement bounded channels + backpressure
- Add heartbeat logic

---

**End of Phase 1 System Design**

Total lines: ~650 (focused, testable, actionable) ✓
