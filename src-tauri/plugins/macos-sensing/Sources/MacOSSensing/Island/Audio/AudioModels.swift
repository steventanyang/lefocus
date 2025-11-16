import AppKit

/// Lightweight representation of the currently playing track.
public struct TrackInfo: Equatable {
    public let title: String
    public let artist: String
    public let artwork: NSImage?
    public let isPlaying: Bool
    public let timestamp: Date
    public let sourceBundleID: String?
    public let position: TimeInterval?
    public let duration: TimeInterval?
    public let canSeek: Bool

    public init(
        title: String,
        artist: String,
        artwork: NSImage?,
        isPlaying: Bool,
        timestamp: Date = Date(),
        sourceBundleID: String?,
        position: TimeInterval? = nil,
        duration: TimeInterval? = nil,
        canSeek: Bool = false
    ) {
        self.title = title
        self.artist = artist
        self.artwork = artwork
        self.isPlaying = isPlaying
        self.timestamp = timestamp
        self.sourceBundleID = sourceBundleID
        self.position = position
        self.duration = duration
        self.canSeek = canSeek
    }

    public static func == (lhs: TrackInfo, rhs: TrackInfo) -> Bool {
        return lhs.title == rhs.title &&
            lhs.artist == rhs.artist &&
            lhs.isPlaying == rhs.isPlaying &&
            lhs.sourceBundleID == rhs.sourceBundleID &&
            TrackInfo.artwork(lhs.artwork, equals: rhs.artwork)
    }

    public static var empty: TrackInfo {
        TrackInfo(
            title: "Unknown",
            artist: "Unknown",
            artwork: nil,
            isPlaying: false,
            sourceBundleID: nil,
            position: nil,
            duration: nil,
            canSeek: false
        )
    }

    public func replacingArtwork(_ newArtwork: NSImage?) -> TrackInfo {
        TrackInfo(
            title: title,
            artist: artist,
            artwork: newArtwork,
            isPlaying: isPlaying,
            timestamp: timestamp,
            sourceBundleID: sourceBundleID,
            position: position,
            duration: duration,
            canSeek: canSeek
        )
    }

    public func updatingPlayback(
        position newPosition: TimeInterval?,
        duration newDuration: TimeInterval? = nil,
        canSeek newCanSeek: Bool? = nil
    ) -> TrackInfo {
        TrackInfo(
            title: title,
            artist: artist,
            artwork: artwork,
            isPlaying: isPlaying,
            timestamp: timestamp,
            sourceBundleID: sourceBundleID,
            position: newPosition ?? position,
            duration: newDuration ?? duration,
            canSeek: newCanSeek ?? canSeek
        )
    }

    public func matchesIdentity(with other: TrackInfo) -> Bool {
        return normalized(title) == normalized(other.title) &&
            normalized(artist) == normalized(other.artist) &&
            sourceBundleID == other.sourceBundleID
    }

    private func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func artwork(_ lhs: NSImage?, equals rhs: NSImage?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil):
            return true
        case let (l?, r?):
            return l === r
        default:
            return false
        }
    }
}
