# LeFocus Phase 1: Swift Tauri Plugin (Compiled)

**Version:** 0.2
**Date:** October 2025
**Phase:** 1 of 3 (P0 Implementation)
**Status:** Implementation Ready
**Approach:** Compiled Swift dylib with FFI bindings

---

## Document Purpose

This document specifies **Phase 1** of the LeFocus P0 implementation: building a compiled Swift plugin (dylib) that exposes macOS screen APIs to Rust via FFI.

**Phase 1 Goal:** By the end of this phase, we have a working `.dylib` that Rust can call directly to:

1. Get active window metadata (bundle ID, title, window ID)
2. Capture screenshots of specific windows (PNG format)
3. Run OCR on images (Vision.framework)

**Success Criteria:** All three functions work via direct FFI calls, testable via Tauri commands. No process spawning overhead.

---

## Table of Contents

1. [Phase 1 Overview](#1-phase-1-overview)
2. [What We're Building](#2-what-were-building)
3. [Project Structure](#3-project-structure)
4. [Build System Setup](#4-build-system-setup)
5. [Swift Plugin Implementation](#5-swift-plugin-implementation)
6. [FFI Bridge Layer](#6-ffi-bridge-layer)
7. [Rust Integration](#7-rust-integration)
8. [Testing Strategy](#8-testing-strategy)
9. [Troubleshooting](#9-troubleshooting)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Phase 1 Overview

### 1.1 Why Compiled Plugin from Start?

Building the compiled plugin upfront provides:

- **Production-ready performance:** < 1ms FFI overhead (vs 50-100ms process spawn)
- **State persistence:** Window cache + reusable OCR request handler
- **No migration work:** 9 days upfront vs 6+4 days (script + migration)
- **Accurate dogfooding:** Real performance characteristics from day 1

### 1.2 What We're Learning

This phase teaches you:

- Swift-Rust FFI (C ABI bridge)
- `build.rs` for compiling Swift code
- Memory management across FFI boundary
- dylib linking on macOS

### 1.3 Out of Scope (Phase 1)

- Timer logic
- Context sensing pipeline
- Segmentation algorithm
- React UI (beyond test buttons)
- Database/persistence

---

## 2. What We're Building

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────┐
│         Tauri App (Rust Core)               │
│                                             │
│  User Test → Tauri Command → FFI Call      │
└──────────────────┬──────────────────────────┘
                   │ FFI (C ABI)
┌──────────────────▼──────────────────────────┐
│   libMacOSSensing.dylib (Swift Compiled)    │
│                                             │
│  macos_sensing_get_active_window_metadata() │
│  macos_sensing_capture_screenshot()         │
│  macos_sensing_run_ocr()                    │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ MacOSSensingPlugin (Swift Class)    │   │
│  │  - windowCache: [CGWindowID: SCWindow] │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 2.2 Communication Flow

1. **Rust** calls `macos_sensing_get_active_window_metadata()` (C function)
2. **Swift** receives call, executes async code
3. **Swift** allocates result buffer, returns pointer to Rust
4. **Rust** reads result, converts to Rust types
5. **Rust** calls the matching `macos_sensing_free_*` to release Swift memory

---

## 3. Project Structure

```
src-tauri/
├── Cargo.toml
├── build.rs                          # Compiles Swift → dylib
├── src/
│   ├── lib.rs                        # Tauri app + commands
│   └── macos_bridge.rs               # Safe Rust wrapper over FFI
└── plugins/
    └── macos-sensing/
        ├── Package.swift             # Swift package manifest
        ├── Sources/
        │   └── MacOSSensing/
        │       ├── MacOSSensing.swift       # Main plugin class
        │       ├── FFIExports.swift         # Swift -> C hooks
        │       └── FFITypes.swift           # Shared data structs
        ├── Sources/
        │   └── CMacOSSensing/
        │       ├── include/
        │       │   └── MacOSSensingFFI.h    # C ABI header (exported)
        │       └── MacOSSensingFFI.c        # C shim wrapping Swift
        └── .swift-build/             # Swift build artifacts (gitignored, at workspace root)
            └── macos-sensing/
                └── release/
                    └── libMacOSSensing.dylib
```

---

## 4. Build System Setup

### 4.1 `build.rs` - Swift Compiler Integration

```rust
// src-tauri/build.rs

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:warning=[BUILD] Starting build process...");

    #[cfg(target_os = "macos")]
    {
        println!("cargo:warning=[BUILD] macOS detected - compiling Swift plugin");
        compile_macos_sensing();
        println!("cargo:warning=[BUILD] Swift plugin compilation complete");
    }

    println!("cargo:warning=[BUILD] Running Tauri build...");
    tauri_build::build();
    println!("cargo:warning=[BUILD] Build process complete!");
}

#[cfg(target_os = "macos")]
fn compile_macos_sensing() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR missing"));
    let plugin_dir = manifest_dir.join("plugins/macos-sensing");
    let workspace_root = manifest_dir.parent().expect("workspace root should exist");
    let swift_build_dir = workspace_root.join(".swift-build/macos-sensing");

    println!("cargo:warning=[SWIFT] Building Swift plugin...");

    let status = Command::new("swift")
        .args([
            "build", "-c", "release",
            "--package-path", plugin_dir.to_str().expect("plugin path invalid UTF-8"),
            "--product", "MacOSSensing",
            "--scratch-path", swift_build_dir.to_str().expect("scratch path invalid UTF-8"),
        ])
        .status()
        .expect("Failed to spawn swift build");

    if !status.success() {
        println!("cargo:warning=[SWIFT] ❌ Build failed!");
        panic!("Swift plugin build failed");
    }

    println!("cargo:warning=[SWIFT] ✅ Swift build successful");

    let build_output = swift_build_dir.join("release");
    let dylib_name = "libMacOSSensing.dylib";
    let dylib_path = build_output.join(dylib_name);

    println!("cargo:warning=[RUST] Configuring Rust linker...");
    println!("cargo:rustc-link-search=native={}", build_output.to_str().expect("link path invalid UTF-8"));
    println!("cargo:rustc-link-lib=dylib=MacOSSensing");
    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", build_output.to_str().expect("link path invalid UTF-8"));
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Frameworks");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Resources");

    println!("cargo:warning=[COPY] Copying dylib to resources...");
    let resources_dir = manifest_dir.join("resources");
    let target_resource = resources_dir.join(dylib_name);
    let _ = fs::create_dir_all(&resources_dir);
    fs::copy(&dylib_path, &target_resource)
        .expect("Failed to copy libMacOSSensing.dylib into resources/");

    println!("cargo:warning=[COPY] ✅ Dylib copied successfully");

    println!("cargo:warning=[WATCH] Registering file watchers for Swift files...");
    println!("cargo:rerun-if-changed={}", plugin_dir.join("Sources/MacOSSensing").to_str().unwrap());
    println!("cargo:rerun-if-changed={}", plugin_dir.join("Sources/CMacOSSensing").to_str().unwrap());
    println!("cargo:rerun-if-changed={}", plugin_dir.join("Package.swift").to_str().unwrap());
    println!("cargo:warning=[WATCH] ✅ File watchers registered");
}
```

### 4.2 `Package.swift` - Swift Build Configuration

```swift
// src-tauri/plugins/macos-sensing/Package.swift

// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MacOSSensing",
    platforms: [
        .macOS(.v13)  // Requires macOS 13+ for ScreenCaptureKit
    ],
    products: [
        .library(
            name: "MacOSSensing",
            type: .dynamic,  // Build as dylib
            targets: ["MacOSSensing"]
        ),
    ],
    targets: [
        .target(
            name: "CMacOSSensing",
            path: "Sources/CMacOSSensing",
            publicHeadersPath: "include"
        ),
        .target(
            name: "MacOSSensing",
            dependencies: ["CMacOSSensing"],
            cSettings: [
                .headerSearchPath("../CMacOSSensing/include")
            ],
            linkerSettings: [
                .linkedFramework("Cocoa"),
                .linkedFramework("Vision"),
                .linkedFramework("ScreenCaptureKit"),
            ]
        ),
    ]
)
```

### 4.3 `.gitignore` Updates

```
# Swift build artifacts
.swift-build/
src-tauri/plugins/macos-sensing/.build/
src-tauri/plugins/macos-sensing/.swiftpm/
```

---

## 5. Swift Plugin Implementation

### 5.1 FFI Types (`FFITypes.swift`)

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/FFITypes.swift

import Foundation
import CMacOSSensing

public typealias WindowMetadataFFI = CMacOSSensing_WindowMetadataFFI
public typealias OCRResultFFI = CMacOSSensing_OCRResultFFI
```

### 5.2 Main Plugin Class (`MacOSSensing.swift`)

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/MacOSSensing.swift

import Cocoa
import Vision
import ScreenCaptureKit
import Foundation
import ImageIO

public class MacOSSensingPlugin {
    public static let shared = MacOSSensingPlugin()

    // Window cache (refreshed every 5s)
    private var windowCache: [CGWindowID: SCWindow] = [:]
    private var lastCacheUpdate: Date = .distantPast
    private var lastActiveWindowId: CGWindowID?
    private let stateQueue = DispatchQueue(label: "MacOSSensing.State")

    // Concurrency caps
    private let captureSemaphore = DispatchSemaphore(value: 1)
    private let ocrQueue = DispatchQueue(label: "MacOSSensing.OCR")

    private init() {}

    // MARK: - Window Metadata

    public func getActiveWindowMetadata() async throws -> WindowMetadataFFI {
    // 1. Get frontmost app
    guard let app = NSWorkspace.shared.frontmostApplication else {
        throw NSError(domain: "MacOSSensing", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "No active application"
        ])
    }

        // 2. Refresh cache if stale (read under stateQueue)
        let cacheAge = stateQueue.sync { Date().timeIntervalSince(lastCacheUpdate) }
        if cacheAge > 5.0 {
        try await refreshWindowCache()
    }

        // 3. Resolve window by stable ID if available, otherwise pick first on-screen for frontmost app
        let cachedFromId: SCWindow? = stateQueue.sync {
            if let last = lastActiveWindowId { return windowCache[last] }
            return nil
        }
        if let cached = cachedFromId {
            let bundleId = app.bundleIdentifier ?? ""
            if cached.owningApplication?.bundleIdentifier == bundleId {
                return WindowMetadataFFI(
                    windowId: cached.windowID,
                    bundleIdPtr: bundleId.withCString { strdup($0) },
                    titlePtr: (cached.title ?? "").withCString { strdup($0) },
                    ownerNamePtr: (cached.owningApplication?.applicationName ?? "").withCString { strdup($0) },
                    boundsX: cached.frame.origin.x,
                    boundsY: cached.frame.origin.y,
                    boundsWidth: cached.frame.size.width,
                    boundsHeight: cached.frame.size.height
                )
            }
        }

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

        // 4. Cache ID and convert to FFI struct
        stateQueue.sync { lastActiveWindowId = window.windowID }
        let bundleId = app.bundleIdentifier ?? ""
        let title = window.title ?? ""
        let ownerName = window.owningApplication?.applicationName ?? ""

        return WindowMetadataFFI(
            windowId: window.windowID,
            bundleIdPtr: bundleId.withCString { strdup($0) },
            titlePtr: title.withCString { strdup($0) },
            ownerNamePtr: ownerName.withCString { strdup($0) },
            boundsX: window.frame.origin.x,
            boundsY: window.frame.origin.y,
            boundsWidth: window.frame.size.width,
            boundsHeight: window.frame.size.height
        )
}

private func refreshWindowCache() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(
        false,
        onScreenWindowsOnly: true
    )
        stateQueue.sync {
    windowCache.removeAll()
    for window in content.windows where window.isOnScreen {
        windowCache[window.windowID] = window
    }
    lastCacheUpdate = Date()
}
    }

    // MARK: - Screenshot Capture

    public func captureScreenshot(windowId: UInt32) async throws -> Data {
        // Serialize captures to avoid overlap
        captureSemaphore.wait()
        defer { captureSemaphore.signal() }

    // 1. Get window from cache
        let hasWindow = stateQueue.sync { windowCache[windowId] != nil }
        if !hasWindow { try await refreshWindowCache() }

        guard let window = stateQueue.sync(execute: { windowCache[windowId] }) else {
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
        let bitmap = NSBitmapImageRep(cgImage: cgImage)
        guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "MacOSSensing", code: 5, userInfo: [
            NSLocalizedDescriptionKey: "PNG encoding failed"
        ])
    }

    return pngData
}

    // MARK: - OCR

    public func runOCR(imageData: Data) async throws -> OCRResultFFI {
    return try await Task {
        try autoreleasepool {
                // 1. Decode image (ImageIO-only; thread-safe on background threads)
                guard let src = CGImageSourceCreateWithData(imageData as CFData, nil),
                      let cgImage = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
                throw NSError(domain: "MacOSSensing", code: 6, userInfo: [
                    NSLocalizedDescriptionKey: "Failed to decode image"
                ])
            }

                // 2. Perform OCR and extract results under serial queue
                // Create new request each time to prevent Vision framework state accumulation
                let (recognizedText, avgConfidence, wordCount): (String, Double, UInt64) = ocrQueue.sync {
                    do {
                        let request = VNRecognizeTextRequest()
                        request.recognitionLevel = .fast
                        request.usesLanguageCorrection = false

                        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                        try handler.perform([request])

                        guard let observations = request.results else {
                            return ("", 0.0, UInt64(0))
                        }

                        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
                        let confidences = observations.compactMap { $0.topCandidates(1).first?.confidence }
                        let text = lines.joined(separator: "\n")
                        let avg = confidences.isEmpty ? 0.0 : confidences.reduce(0.0) { $0 + Double($1) } / Double(confidences.count)
                        return (text, avg, UInt64(observations.count))
                    } catch {
                        return ("", 0.0, UInt64(0))
                    }
                }

                return OCRResultFFI(
                    textPtr: recognizedText.withCString { strdup($0) },
                    confidence: avgConfidence,
                    wordCount: wordCount
                )
        }  // autoreleasepool ends here - Vision objects drained
    }.value
    }
}
```

### 5.3 FFI Exports (`FFIExports.swift`)

```swift
// src-tauri/plugins/macos-sensing/Sources/MacOSSensing/FFIExports.swift

import Foundation

// MARK: - C-Compatible Exports

@_cdecl("macos_sensing_swift_get_window")
public func getActiveWindowMetadataFFI() -> UnsafeMutablePointer<WindowMetadataFFI>? {
    var metadata: WindowMetadataFFI?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached {
        defer { semaphore.signal() }
        do {
            metadata = try await MacOSSensingPlugin.shared.getActiveWindowMetadata()
        } catch {
            metadata = nil
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut { return nil }

    guard let md = metadata else { return nil }
    let ptr = UnsafeMutablePointer<WindowMetadataFFI>.allocate(capacity: 1)
    ptr.pointee = md
    return ptr
}

@_cdecl("macos_sensing_swift_capture_screenshot")
public func captureScreenshotFFI(
    windowId: UInt32,
    outLength: UnsafeMutablePointer<Int>
) -> UnsafeMutablePointer<UInt8>? {
    var resultData: Data?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached {
        do {
            resultData = try await MacOSSensingPlugin.shared.captureScreenshot(windowId: windowId)
        } catch {
            print("Screenshot capture error: \(error)")
        }
        semaphore.signal()
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        outLength.pointee = 0
        return nil
    }

    guard let data = resultData else {
        outLength.pointee = 0
        return nil
    }

    outLength.pointee = data.count
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: data.count)
    data.copyBytes(to: buffer, count: data.count)
    return buffer
}

@_cdecl("macos_sensing_swift_run_ocr")
public func runOCRFFI(
    imageData: UnsafePointer<UInt8>,
    imageLength: Int
) -> UnsafeMutablePointer<OCRResultFFI>? {
    let data = Data(bytes: imageData, count: imageLength)
    let result = UnsafeMutablePointer<OCRResultFFI>.allocate(capacity: 1)
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached {
        do {
            let ocrResult = try await MacOSSensingPlugin.shared.runOCR(imageData: data)
            result.pointee = ocrResult
        } catch {
            print("OCR error: \(error)")
            result.pointee = OCRResultFFI(textPtr: strdup(""), confidence: 0.0, wordCount: 0)
        }
        semaphore.signal()
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        result.pointee = OCRResultFFI(textPtr: strdup(""), confidence: 0.0, wordCount: 0)
        return result
    }
    return result
}

@_cdecl("macos_sensing_swift_free_window_metadata")
public func freeWindowMetadataFFI(_ ptr: UnsafeMutablePointer<WindowMetadataFFI>) {
    if let bundleIdPtr = ptr.pointee.bundleIdPtr {
        free(bundleIdPtr)
    }
    if let titlePtr = ptr.pointee.titlePtr {
        free(titlePtr)
    }
    if let ownerNamePtr = ptr.pointee.ownerNamePtr {
        free(ownerNamePtr)
    }
    ptr.deallocate()
}

@_cdecl("macos_sensing_swift_free_screenshot_buffer")
public func freeScreenshotBufferFFI(_ ptr: UnsafeMutablePointer<UInt8>) {
    ptr.deallocate()
}

@_cdecl("macos_sensing_swift_free_ocr_result")
public func freeOCRResultFFI(_ ptr: UnsafeMutablePointer<OCRResultFFI>) {
    if let textPtr = ptr.pointee.textPtr {
        free(textPtr)
    }
    ptr.deallocate()
}
```

### 5.4 C Shim (`Sources/CMacOSSensing/…`)

Swift cannot expose `@_cdecl` functions whose signatures include Swift-only structs, so the public C ABI lives in a tiny shim target. The shim defines the canonical structs, calls into the Swift implementations, and keeps Rust's interface purely C99.

**Header** — `src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/include/MacOSSensingFFI.h`

```c
#pragma once

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint32_t windowId;
    char *bundleIdPtr;
    char *titlePtr;
    char *ownerNamePtr;
    double boundsX;
    double boundsY;
    double boundsWidth;
    double boundsHeight;
} CMacOSSensing_WindowMetadataFFI;

typedef struct {
    char *textPtr;
    double confidence;
    uint64_t wordCount;
} CMacOSSensing_OCRResultFFI;

CMacOSSensing_WindowMetadataFFI *macos_sensing_get_active_window_metadata(void);
uint8_t *macos_sensing_capture_screenshot(uint32_t window_id, size_t *out_len);
CMacOSSensing_OCRResultFFI *macos_sensing_run_ocr(const uint8_t *image_data, size_t image_len);

void macos_sensing_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);
void macos_sensing_free_screenshot_buffer(uint8_t *ptr);
void macos_sensing_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr);
```

**Implementation** — `src-tauri/plugins/macos-sensing/Sources/CMacOSSensing/MacOSSensingFFI.c`

```c
#include "MacOSSensingFFI.h"

// Swift entry points (see FFIExports.swift)
extern CMacOSSensing_WindowMetadataFFI *macos_sensing_swift_get_window(void);
extern uint8_t *macos_sensing_swift_capture_screenshot(uint32_t window_id, size_t *out_len);
extern CMacOSSensing_OCRResultFFI *macos_sensing_swift_run_ocr(const uint8_t *image_data, size_t image_len);

extern void macos_sensing_swift_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr);
extern void macos_sensing_swift_free_screenshot_buffer(uint8_t *ptr);
extern void macos_sensing_swift_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr);

CMacOSSensing_WindowMetadataFFI *macos_sensing_get_active_window_metadata(void) {
    return macos_sensing_swift_get_window();
}

uint8_t *macos_sensing_capture_screenshot(uint32_t window_id, size_t *out_len) {
    return macos_sensing_swift_capture_screenshot(window_id, out_len);
}

CMacOSSensing_OCRResultFFI *macos_sensing_run_ocr(const uint8_t *image_data, size_t image_len) {
    return macos_sensing_swift_run_ocr(image_data, image_len);
}

void macos_sensing_free_window_metadata(CMacOSSensing_WindowMetadataFFI *ptr) {
    macos_sensing_swift_free_window_metadata(ptr);
}

void macos_sensing_free_screenshot_buffer(uint8_t *ptr) {
    macos_sensing_swift_free_screenshot_buffer(ptr);
}

void macos_sensing_free_ocr_result(CMacOSSensing_OCRResultFFI *ptr) {
    macos_sensing_swift_free_ocr_result(ptr);
}
```

The Rust layer links against the shim symbols (`macos_sensing_*`), while Swift keeps the async logic and memory management internal.

---

## 6. FFI Bridge Layer

### 6.1 Rust FFI Declarations (`src-tauri/src/macos_bridge.rs`)

```rust
use std::ffi::{CStr, c_char};
use std::ptr;
use serde::{Deserialize, Serialize};
use anyhow::{Result, Context};

// FFI struct matching Swift
#[repr(C)]
struct WindowMetadataFFI {
    window_id: u32,
    bundle_id_ptr: *mut c_char,
    title_ptr: *mut c_char,
    owner_name_ptr: *mut c_char,
    bounds_x: f64,
    bounds_y: f64,
    bounds_width: f64,
    bounds_height: f64,
}

#[repr(C)]
struct OCRResultFFI {
    text_ptr: *mut c_char,
    confidence: f64,
    word_count: usize,
}

// External C functions from Swift dylib
extern "C" {
    fn macos_sensing_get_active_window_metadata() -> *mut WindowMetadataFFI;
    fn macos_sensing_capture_screenshot(window_id: u32, out_length: *mut usize) -> *mut u8;
    fn macos_sensing_run_ocr(image_data: *const u8, image_length: usize) -> *mut OCRResultFFI;

    fn macos_sensing_free_window_metadata(ptr: *mut WindowMetadataFFI);
    fn macos_sensing_free_screenshot_buffer(ptr: *mut u8);
    fn macos_sensing_free_ocr_result(ptr: *mut OCRResultFFI);
}

// Safe Rust types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowMetadata {
    pub window_id: u32,
    pub bundle_id: String,
    pub title: String,
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
pub struct OCRResult {
    pub text: String,
    pub confidence: f64,
    pub word_count: usize,
}

// Safe wrapper functions
pub fn get_active_window_metadata() -> Result<WindowMetadata> {
    unsafe {
        let ptr = macos_sensing_get_active_window_metadata();
        if ptr.is_null() {
            anyhow::bail!("Failed to get window metadata");
        }

        let ffi_data = &*ptr;

        // Convert C strings to Rust
        let bundle_id = if ffi_data.bundle_id_ptr.is_null() {
            String::new()
        } else {
            CStr::from_ptr(ffi_data.bundle_id_ptr)
                .to_string_lossy()
                .into_owned()
        };

        let title = if ffi_data.title_ptr.is_null() {
            String::new()
        } else {
            CStr::from_ptr(ffi_data.title_ptr)
                .to_string_lossy()
                .into_owned()
        };

        let owner_name = if ffi_data.owner_name_ptr.is_null() {
            String::new()
        } else {
            CStr::from_ptr(ffi_data.owner_name_ptr)
                .to_string_lossy()
                .into_owned()
        };

        let result = WindowMetadata {
            window_id: ffi_data.window_id,
            bundle_id,
            title,
            owner_name,
            bounds: WindowBounds {
                x: ffi_data.bounds_x,
                y: ffi_data.bounds_y,
                width: ffi_data.bounds_width,
                height: ffi_data.bounds_height,
            },
        };

        // Free FFI memory
        macos_sensing_free_window_metadata(ptr);

        Ok(result)
    }
}

pub fn capture_screenshot(window_id: u32) -> Result<Vec<u8>> {
    unsafe {
        let mut length: usize = 0;
        let ptr = macos_sensing_capture_screenshot(window_id, &mut length as *mut usize);

        if ptr.is_null() || length == 0 {
            anyhow::bail!("Screenshot capture failed");
        }

        // Copy bytes to Rust Vec
        let slice = std::slice::from_raw_parts(ptr, length);
        let result = slice.to_vec();

        // Free FFI memory
        macos_sensing_free_screenshot_buffer(ptr);

        Ok(result)
    }
}

pub fn run_ocr(image_data: &[u8]) -> Result<OCRResult> {
    unsafe {
        let ptr = macos_sensing_run_ocr(image_data.as_ptr(), image_data.len());

        if ptr.is_null() {
            anyhow::bail!("OCR failed");
        }

        let ffi_data = &*ptr;

        let text = if ffi_data.text_ptr.is_null() {
            String::new()
        } else {
            CStr::from_ptr(ffi_data.text_ptr)
                .to_string_lossy()
                .into_owned()
        };

        let result = OCRResult {
            text,
            confidence: ffi_data.confidence,
            word_count: ffi_data.word_count,
        };

        // Free FFI memory
        macos_sensing_free_ocr_result(ptr);

        Ok(result)
    }
}
```

---

## 7. Rust Integration

### 7.1 Tauri Commands (`src-tauri/src/lib.rs`)

```rust
mod macos_bridge;

use macos_bridge::*;

#[tauri::command]
fn test_get_window() -> Result<WindowMetadata, String> {
    get_active_window_metadata()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn test_capture_screenshot(window_id: u32) -> Result<String, String> {
    let image_data = capture_screenshot(window_id)
        .map_err(|e| e.to_string())?;

    // Save to file for testing
    std::fs::write("/tmp/lefocus_test_screenshot.png", &image_data)
        .map_err(|e| e.to_string())?;

    Ok(format!("Screenshot saved: {} bytes", image_data.len()))
}

#[tauri::command]
fn test_run_ocr(image_path: String) -> Result<OCRResult, String> {
    let image_data = std::fs::read(&image_path)
        .map_err(|e| e.to_string())?;

    run_ocr(&image_data)
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

## 8. Testing Strategy

### 8.1 Build and Run

```bash
# Clean build from scratch
cd src-tauri
cargo clean
cargo build

# Should see Swift compilation output with build logs, then Rust compilation
# Check that dylib exists:
ls -lh .swift-build/macos-sensing/release/libMacOSSensing.dylib
```

### 8.2 Test UI

**Note:** Phase 1 test UI archived to `src/components/archived/TestView.tsx` after Phase 2 completion. Main app now uses production timer UI in `src/components/timer/TimerView.tsx`.

### 8.3 Manual Testing Workflow

**Step 1: Test Get Window**

1. Open VS Code (or any app with visible text)
2. Click "Test Get Window"
3. Verify output contains:
   - Valid `window_id` (number)
   - Correct `bundle_id` (e.g., `com.microsoft.VSCode`)
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
   - `word_count` > 0

---

## 9. Troubleshooting

### 9.1 Build Errors

**Error: `dyld: Library not loaded: @rpath/libMacOSSensing.dylib`**

Solution: Add to `build.rs`:

```rust
println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Frameworks");
```

**Error: Swift compilation failed**

Check:

- macOS version ≥ 13.0
- Xcode command line tools installed: `xcode-select --install`
- Swift version ≥ 5.9: `swift --version`

**Error: `ScreenCaptureKit not found`**

Solution: Ensure `Package.swift` has:

```swift
.linkedFramework("ScreenCaptureKit")
```

### 9.2 Runtime Errors

**Error: Window metadata returns null**

Check:

- Screen Recording permission granted
- Active app has visible windows

**Error: Screenshot capture fails**

Debug:

1. Check window ID is valid (from Step 1)
2. Check window is still on screen
3. Add logging to Swift code

**Error: OCR returns empty text**

Check:

- Image data is valid PNG
- Image contains readable text
- Vision framework permission

---

## 10. Acceptance Criteria

| Criterion              | Pass Condition                                     |
| ---------------------- | -------------------------------------------------- |
| **Build Success**      | `cargo build` completes, dylib exists              |
| **FFI Call Works**     | No crashes, returns valid data                     |
| **Get Window**         | Returns valid metadata for frontmost window        |
| **Window ID**          | `window_id` is non-zero and type `u32`             |
| **Bundle ID**          | Matches actual frontmost app                       |
| **Screenshot Format**  | PNG file, valid image, opens correctly             |
| **Screenshot Size**    | Width ≤ 1280px, aspect ratio preserved             |
| **Screenshot Content** | Visual content matches active window               |
| **OCR Text**           | Recognizes visible text from screenshot            |
| **OCR Confidence**     | Value between 0.0-1.0                              |
| **Memory Safety**      | No leaks detected (via Instruments)                |
| **Performance**        | Get window: < 10ms, Screenshot: < 500ms, OCR: < 1s |

---

## 10.1 Memory Leak Check

```bash
# Run with Address Sanitizer
RUSTFLAGS="-Z sanitizer=address" cargo run

# Or use macOS Instruments:
# 1. cargo build --release
# 2. Open Instruments → Leaks template
# 3. Attach to lefocus process
# 4. Run all three test buttons
# 5. Check for leaked malloc/strdup
```

---

**End of Phase 1 System Design**

Total lines: ~750 (focused on FFI compiled plugin approach)

**Next Phase:** Phase 2 - Build context sensing pipeline using this plugin
