import Cocoa
import Foundation

public final class MacOSSensingPlugin {
    public static let shared = MacOSSensingPlugin()

    private init() {}

    // MARK: - Window Metadata

    public func getActiveWindowMetadata() async throws -> WindowMetadataFFI {
        guard let app = NSWorkspace.shared.frontmostApplication else {
            throw NSError(
                domain: "MacOSSensing",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "No active application"]
            )
        }

        let bundleId = app.bundleIdentifier ?? ""
        let ownerName = app.localizedName ?? bundleId

        // App-level tracking only needs the globally frontmost application.
        // Keep neutral window values for the existing Rust/database contract.
        return WindowMetadataFFI(
            windowId: 0,
            bundleIdPtr: bundleId.withCString { strdup($0) },
            titlePtr: "".withCString { strdup($0) },
            ownerNamePtr: ownerName.withCString { strdup($0) },
            boundsX: 0,
            boundsY: 0,
            boundsWidth: 0,
            boundsHeight: 0
        )
    }
}
