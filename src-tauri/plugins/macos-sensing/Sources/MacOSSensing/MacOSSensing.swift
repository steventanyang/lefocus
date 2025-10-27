import Cocoa
import Foundation
import ImageIO
import ScreenCaptureKit
import Vision

private actor CaptureGate {
    func run<T>(_ operation: () async throws -> T) async rethrows -> T {
        try await operation()
    }
}

public final class MacOSSensingPlugin {
    public static let shared = MacOSSensingPlugin()

    private var windowCache: [CGWindowID: SCWindow] = [:]
    private var lastCacheUpdate: Date = .distantPast
    private var lastActiveWindowId: CGWindowID?

    private let stateQueue = DispatchQueue(label: "MacOSSensing.State")
    private let captureGate = CaptureGate()
    private let ocrQueue = DispatchQueue(label: "MacOSSensing.OCR")

    private lazy var ocrRequest: VNRecognizeTextRequest = {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        request.usesLanguageCorrection = false
        return request
    }()

    private init() {}

    // MARK: - Lifecycle

    public func clearCache() {
        stateQueue.sync {
            windowCache.removeAll()
            lastActiveWindowId = nil
            lastCacheUpdate = .distantPast
        }
    }

    // MARK: - Window Metadata

    public func getActiveWindowMetadata() async throws -> WindowMetadataFFI {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            throw NSError(
                domain: "MacOSSensing",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No active application"]
            )
        }

        if shouldRefreshCache() {
            try await refreshWindowCache()
        }

        if let cachedWindow = cachedWindow(forBundleId: app.bundleIdentifier) {
            return makeMetadata(from: cachedWindow, bundleId: app.bundleIdentifier)
        }

        try await refreshWindowCache()

        guard let window = cachedWindow(forBundleId: app.bundleIdentifier) else {
            throw NSError(
                domain: "MacOSSensing",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No window found for active app"]
            )
        }

        return makeMetadata(from: window, bundleId: app.bundleIdentifier)
    }

    private func shouldRefreshCache() -> Bool {
        stateQueue.sync {
            Date().timeIntervalSince(lastCacheUpdate) > 5.0
        }
    }

    private func cachedWindow(forBundleId bundleId: String?) -> SCWindow? {
        stateQueue.sync {
            let bundleId = bundleId ?? ""

            if let lastId = lastActiveWindowId, let cached = windowCache[lastId] {
                let matchesBundle = cached.owningApplication?.bundleIdentifier == bundleId
                if matchesBundle && cached.isOnScreen {
                    return cached
                } else {
                    windowCache.removeValue(forKey: lastId)
                    if !cached.isOnScreen {
                        lastActiveWindowId = nil
                    }
                }
            }

            let candidates = windowCache.values.filter {
                $0.owningApplication?.bundleIdentifier == bundleId && $0.isOnScreen
            }

            guard !candidates.isEmpty else {
                return nil
            }

            let best = candidates.max(by: { lhs, rhs in
                let lhsArea = Double(lhs.frame.size.width) * Double(lhs.frame.size.height)
                let rhsArea = Double(rhs.frame.size.width) * Double(rhs.frame.size.height)
                return lhsArea < rhsArea
            })

            if let best = best {
                lastActiveWindowId = best.windowID
            }

            return best
        }
    }

    private func makeMetadata(from window: SCWindow, bundleId: String?) -> WindowMetadataFFI {
        stateQueue.sync {
            windowCache[window.windowID] = window
            lastActiveWindowId = window.windowID
        }

        let bundle = bundleId ?? ""
        let title = window.title ?? ""
        let ownerName = window.owningApplication?.applicationName ?? ""

        return WindowMetadataFFI(
            windowId: window.windowID,
            bundleIdPtr: bundle.withCString { strdup($0) },
            titlePtr: title.withCString { strdup($0) },
            ownerNamePtr: ownerName.withCString { strdup($0) },
            boundsX: window.frame.origin.x,
            boundsY: window.frame.origin.y,
            boundsWidth: window.frame.size.width,
            boundsHeight: window.frame.size.height
        )
    }

    private func refreshWindowCache() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
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
        try await captureGate.run {
            var cached: SCWindow? = stateQueue.sync {
                windowCache[windowId]
            }

            if cached == nil || cached?.isOnScreen == false {
                try await refreshWindowCache()
                cached = stateQueue.sync {
                    windowCache[windowId]
                }
            }

            guard let window = cached else {
                throw NSError(
                    domain: "MacOSSensing",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Window not found: \(windowId)"]
                )
            }

            let filter = SCContentFilter(desktopIndependentWindow: window)
            let configuration = SCStreamConfiguration()

            let targetWidth = min(Int(window.frame.width), 1280)
            let scale = CGFloat(targetWidth) / window.frame.width
            configuration.width = targetWidth
            configuration.height = Int(window.frame.height * scale)
            configuration.pixelFormat = kCVPixelFormatType_32BGRA
            configuration.showsCursor = false

            guard let cgImage = try? await SCScreenshotManager.captureImage(
                contentFilter: filter,
                configuration: configuration
            ) else {
                throw NSError(
                    domain: "MacOSSensing",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Screenshot capture failed"]
                )
            }

            guard cgImage.width > 1, cgImage.height > 1 else {
                throw NSError(
                    domain: "MacOSSensing",
                    code: 7,
                    userInfo: [NSLocalizedDescriptionKey: "Screenshot too small"]
                )
            }

            let bitmap = NSBitmapImageRep(cgImage: cgImage)
            guard let png = bitmap.representation(using: .png, properties: [:]) else {
                throw NSError(
                    domain: "MacOSSensing",
                    code: 5,
                    userInfo: [NSLocalizedDescriptionKey: "PNG encoding failed"]
                )
            }

            return png
        }
    }

    // MARK: - OCR

    public func runOCR(imageData: Data) async throws -> OCRResultFFI {
        try autoreleasepool {
            guard let source = CGImageSourceCreateWithData(imageData as CFData, nil),
                  let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
                throw NSError(
                    domain: "MacOSSensing",
                    code: 6,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to decode image"]
                )
            }

            let metrics: (String, Double, UInt64) = ocrQueue.sync {
                do {
                    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                    try handler.perform([ocrRequest])

                    guard let observations = ocrRequest.results else {
                        return ("", 0.0, 0)
                    }

                    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
                    let confidences = observations.compactMap { $0.topCandidates(1).first?.confidence }

                    let text = lines.joined(separator: "\n")
                    let average = confidences.isEmpty
                        ? 0.0
                        : confidences.reduce(0.0) { $0 + Double($1) } / Double(confidences.count)

                    return (text, average, UInt64(observations.count))
                } catch {
                    return ("", 0.0, 0)
                }
            }

            let (text, confidence, wordCount) = metrics

            return OCRResultFFI(
                textPtr: text.withCString { strdup($0) },
                confidence: confidence,
                wordCount: wordCount
            )
        }
    }
}
