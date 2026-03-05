import AppKit
import Foundation

/// Provides app icons as base64-encoded PNG data URLs
public final class AppIconProvider {
    public static let shared = AppIconProvider()
    /// Timeout for main-thread dispatch (seconds). Generous for ~1ms AppKit lookups,
    /// but prevents deadlock when the main thread is blocked.
    private let mainThreadTimeout: TimeInterval = 2.0
    private init() {}

    /// Get app icon as a base64-encoded PNG data URL
    /// - Parameter bundleId: The bundle identifier of the app (e.g., "com.apple.Safari")
    /// - Returns: Data URL string like "data:image/png;base64,iVBORw0KGgo..." or nil if not found
    public func getIconData(forBundleId bundleId: String) -> String? {
        // Phase 1: Main thread — only AppKit lookups (~1ms)
        guard let icon = fetchIconFromMainThread(forBundleId: bundleId) else { return nil }

        // Phase 2: Calling thread — resize + encode (thread-safe, no main thread needed)
        let targetSize = NSSize(width: 32, height: 32)
        let resizedIcon = resizeImageOffMainThread(icon, to: targetSize)

        guard let tiffData = resizedIcon.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: .png, properties: [:]) else {
            return nil
        }

        let base64String = pngData.base64EncodedString()
        return "data:image/png;base64,\(base64String)"
    }

    /// Fetch icon on main thread. If already on main, runs directly.
    /// Otherwise uses async + semaphore with timeout to avoid deadlock.
    private func fetchIconFromMainThread(forBundleId bundleId: String) -> NSImage? {
        if Thread.isMainThread {
            return fetchIcon(forBundleId: bundleId)
        }
        let semaphore = DispatchSemaphore(value: 0)
        var result: NSImage?
        DispatchQueue.main.async {
            result = self.fetchIcon(forBundleId: bundleId)
            semaphore.signal()
        }
        let waitResult = semaphore.wait(timeout: .now() + mainThreadTimeout)
        if waitResult == .timedOut {
            return nil
        }
        return result
    }

    /// Fetch the NSImage icon for a bundle ID (must be called on main thread)
    private func fetchIcon(forBundleId bundleId: String) -> NSImage? {
        guard let appPath = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId)?.path else {
            return nil
        }
        return NSWorkspace.shared.icon(forFile: appPath)
    }

    /// Resize an NSImage using CGBitmapContext (thread-safe, no main thread required)
    private func resizeImageOffMainThread(_ image: NSImage, to size: NSSize) -> NSImage {
        let width = Int(size.width)
        let height = Int(size.height)

        guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return image
        }

        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return image
        }

        context.interpolationQuality = .high
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

        guard let resizedCG = context.makeImage() else {
            return image
        }

        return NSImage(cgImage: resizedCG, size: size)
    }

    /// Extract dominant color from an NSImage
    /// Filters out black, white, and transparent pixels, then finds the most common color cluster
    /// - Parameter image: The image to analyze
    /// - Returns: Hex color string like "#AABBCC" or nil if no valid color found
    private func extractDominantColor(from image: NSImage) -> String? {
        guard let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData) else {
            return nil
        }

        let width = bitmap.pixelsWide
        let height = bitmap.pixelsHigh

        // Collect colorful colors (non-black, non-white, non-transparent, with some color)
        var colorfulCounts: [String: (count: Int, r: Int, g: Int, b: Int)] = [:]
        // Also collect all non-transparent colors as fallback
        var allColorCounts: [String: (count: Int, r: Int, g: Int, b: Int)] = [:]

        for y in 0..<height {
            for x in 0..<width {
                guard let color = bitmap.colorAt(x: x, y: y) else { continue }

                // Convert to RGB
                let rgbColor = color.usingColorSpace(.deviceRGB) ?? color
                var r: CGFloat = 0
                var g: CGFloat = 0
                var b: CGFloat = 0
                var a: CGFloat = 0
                rgbColor.getRed(&r, green: &g, blue: &b, alpha: &a)

                // Filter out transparent pixels
                if a < 0.5 { continue }

                let rInt = Int(r * 255)
                let gInt = Int(g * 255)
                let bInt = Int(b * 255)

                // Skip pure black (very dark) and pure white (very light)
                let brightness = (rInt + gInt + bInt) / 3
                if brightness < 20 || brightness > 235 { continue } // Skip very dark/light

                // Check if this is a colorful pixel (not grayscale)
                let maxDiff = max(abs(rInt - gInt), abs(gInt - bInt), abs(rInt - bInt))
                let isColorful = maxDiff >= 15 // More lenient threshold

                // Group similar colors together
                let key = "\(rInt),\(gInt),\(bInt)"

                // Always add to allColorCounts for fallback
                if let existing = allColorCounts[key] {
                    allColorCounts[key] = (
                        count: existing.count + 1,
                        r: existing.r + rInt,
                        g: existing.g + gInt,
                        b: existing.b + bInt
                    )
                } else {
                    allColorCounts[key] = (count: 1, r: rInt, g: gInt, b: bInt)
                }

                // Add to colorfulCounts if it's colorful
                if isColorful {
                    if let existing = colorfulCounts[key] {
                        colorfulCounts[key] = (
                            count: existing.count + 1,
                            r: existing.r + rInt,
                            g: existing.g + gInt,
                            b: existing.b + bInt
                        )
                    } else {
                        colorfulCounts[key] = (count: 1, r: rInt, g: gInt, b: bInt)
                    }
                }
            }
        }

        // Try to find the largest colorful cluster first
        if let largestColorful = colorfulCounts.values.max(by: { $0.count < $1.count }) {
            let avgR = largestColorful.r / largestColorful.count
            let avgG = largestColorful.g / largestColorful.count
            let avgB = largestColorful.b / largestColorful.count
            return String(format: "#%02X%02X%02X", avgR, avgG, avgB)
        }

        // Fallback: use the most common non-black/white color (even if grayscale)
        if let largestFallback = allColorCounts.values.max(by: { $0.count < $1.count }) {
            let avgR = largestFallback.r / largestFallback.count
            let avgG = largestFallback.g / largestFallback.count
            let avgB = largestFallback.b / largestFallback.count
            return String(format: "#%02X%02X%02X", avgR, avgG, avgB)
        }

        return nil
    }

    /// Get app icon data and dominant color
    /// - Parameter bundleId: The bundle identifier of the app
    /// - Returns: Tuple of (icon data URL, color hex string) or nil if not found
    public func getIconDataAndColor(forBundleId bundleId: String) -> (icon: String, color: String)? {
        // Phase 1: Main thread — only AppKit lookups (~1ms)
        guard let icon = fetchIconFromMainThread(forBundleId: bundleId) else { return nil }

        // Phase 2: Calling thread — resize, color extraction, encode (all thread-safe)
        let targetSize = NSSize(width: 32, height: 32)
        let resizedIcon = resizeImageOffMainThread(icon, to: targetSize)

        guard let tiffData = resizedIcon.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: .png, properties: [:]) else {
            return nil
        }

        let base64String = pngData.base64EncodedString()
        let iconDataURL = "data:image/png;base64,\(base64String)"

        // Extract dominant color
        if let color = extractDominantColor(from: resizedIcon) {
            return (icon: iconDataURL, color: color)
        } else {
            return (icon: iconDataURL, color: "")
        }
    }
}

// MARK: - FFI Exports

/// FFI function to get app icon data
/// Returns a C string that must be freed with macos_sensing_swift_free_string
@_cdecl("macos_sensing_swift_get_app_icon")
public func getAppIconFFI(bundleIdPtr: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let bundleIdStr = String(validatingUTF8: bundleIdPtr) else {
        return nil
    }

    // Methods handle their own minimal main-thread dispatch internally
    guard let iconDataURL = AppIconProvider.shared.getIconData(forBundleId: bundleIdStr) else {
        return nil
    }

    return strdup(iconDataURL)
}

/// FFI function to free strings allocated by Swift
@_cdecl("macos_sensing_swift_free_string")
public func freeStringFFI(ptr: UnsafeMutablePointer<CChar>) {
    free(ptr)
}

/// FFI function to get app icon data and dominant color
/// Returns a JSON string with {"icon": "...", "color": "#AABBCC"} or nil if not found
/// The returned string must be freed with macos_sensing_swift_free_string
@_cdecl("macos_sensing_swift_get_app_icon_and_color")
public func getAppIconAndColorFFI(bundleIdPtr: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let bundleIdStr = String(validatingUTF8: bundleIdPtr) else {
        return nil
    }

    // Methods handle their own minimal main-thread dispatch internally
    guard let iconAndColor = AppIconProvider.shared.getIconDataAndColor(forBundleId: bundleIdStr) else {
        return nil
    }

    // Create JSON string
    let jsonDict: [String: String] = [
        "icon": iconAndColor.icon,
        "color": iconAndColor.color.isEmpty ? "" : iconAndColor.color
    ]

    guard let jsonData = try? JSONSerialization.data(withJSONObject: jsonDict),
          let jsonString = String(data: jsonData, encoding: .utf8) else {
        return nil
    }

    return strdup(jsonString)
}
