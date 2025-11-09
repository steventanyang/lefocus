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
