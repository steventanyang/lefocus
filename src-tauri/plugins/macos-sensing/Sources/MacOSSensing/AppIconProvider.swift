import AppKit
import Foundation

/// Provides app icons as base64-encoded PNG data URLs
public final class AppIconProvider {
    public static let shared = AppIconProvider()
    private init() {}

    /// Get app icon as a base64-encoded PNG data URL
    /// - Parameter bundleId: The bundle identifier of the app (e.g., "com.apple.Safari")
    /// - Returns: Data URL string like "data:image/png;base64,iVBORw0KGgo..." or nil if not found
    public func getIconData(forBundleId bundleId: String) -> String? {
        guard let appPath = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId)?.path else {
            return nil
        }

        let icon = NSWorkspace.shared.icon(forFile: appPath)
        let targetSize = NSSize(width: 32, height: 32)
        let resizedIcon = resizeImage(icon, to: targetSize)

        guard let tiffData = resizedIcon.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData),
              let pngData = bitmap.representation(using: .png, properties: [:]) else {
            return nil
        }

        let base64String = pngData.base64EncodedString()
        return "data:image/png;base64,\(base64String)"
    }

    /// Resize an NSImage to a target size
    private func resizeImage(_ image: NSImage, to size: NSSize) -> NSImage {
        let resized = NSImage(size: size)
        resized.lockFocus()
        image.draw(in: NSRect(origin: .zero, size: size),
                   from: NSRect(origin: .zero, size: image.size),
                   operation: .copy,
                   fraction: 1.0)
        resized.unlockFocus()
        return resized
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
        guard let appPath = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId)?.path else {
            return nil
        }

        let icon = NSWorkspace.shared.icon(forFile: appPath)
        let targetSize = NSSize(width: 32, height: 32)
        let resizedIcon = resizeImage(icon, to: targetSize)

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
            // If color extraction fails, still return icon but with empty color
            // This can happen for very dark/light or monochrome icons
            return (icon: iconDataURL, color: "")
        }
    }
}

// MARK: - FFI Exports

/// FFI function to get app icon data
/// IMPORTANT: Must run on main thread because NSWorkspace APIs require it
/// Returns a C string that must be freed with macos_sensing_swift_free_string
@_cdecl("macos_sensing_swift_get_app_icon")
public func getAppIconFFI(bundleIdPtr: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let bundleIdStr = String(validatingUTF8: bundleIdPtr) else {
        return nil
    }

    // IMPORTANT: AppKit APIs must run on main thread
    var result: String?
    if Thread.isMainThread {
        result = AppIconProvider.shared.getIconData(forBundleId: bundleIdStr)
    } else {
        DispatchQueue.main.sync {
            result = AppIconProvider.shared.getIconData(forBundleId: bundleIdStr)
        }
    }

    guard let iconDataURL = result else {
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
/// IMPORTANT: Must run on main thread because NSWorkspace APIs require it
/// Returns a JSON string with {"icon": "...", "color": "#AABBCC"} or nil if not found
/// The returned string must be freed with macos_sensing_swift_free_string
@_cdecl("macos_sensing_swift_get_app_icon_and_color")
public func getAppIconAndColorFFI(bundleIdPtr: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>? {
    guard let bundleIdStr = String(validatingUTF8: bundleIdPtr) else {
        return nil
    }

    // IMPORTANT: AppKit APIs must run on main thread
    var result: (icon: String, color: String)?
    if Thread.isMainThread {
        result = AppIconProvider.shared.getIconDataAndColor(forBundleId: bundleIdStr)
    } else {
        DispatchQueue.main.sync {
            result = AppIconProvider.shared.getIconDataAndColor(forBundleId: bundleIdStr)
        }
    }

    guard let iconAndColor = result else {
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
