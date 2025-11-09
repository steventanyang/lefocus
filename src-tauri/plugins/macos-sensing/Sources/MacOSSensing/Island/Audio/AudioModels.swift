import AppKit

/// Lightweight representation of the currently playing track.
public struct TrackInfo: Equatable {
    public let title: String
    public let artist: String
    public let artwork: NSImage?
    public let isPlaying: Bool
    public let timestamp: Date
    public let sourceBundleID: String?

    public init(
        title: String,
        artist: String,
        artwork: NSImage?,
        isPlaying: Bool,
        timestamp: Date = Date(),
        sourceBundleID: String?
    ) {
        self.title = title
        self.artist = artist
        self.artwork = artwork
        self.isPlaying = isPlaying
        self.timestamp = timestamp
        self.sourceBundleID = sourceBundleID
    }

    public static var empty: TrackInfo {
        TrackInfo(
            title: "Unknown",
            artist: "Unknown",
            artwork: nil,
            isPlaying: false,
            sourceBundleID: nil
        )
    }
}
