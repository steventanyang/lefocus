import AppKit
import Foundation
import MediaPlayer

/// Polls system media sources and exposes the highest-priority track snapshot.
public final class MediaMonitor {
    public static let shared = MediaMonitor()

    public var onTrackChange: ((TrackInfo?) -> Void)?

    private let nowPlayingCenter = MPNowPlayingInfoCenter.default()
    private let controlCoordinator = MediaControlCoordinator()
    private let spotifyProbe = SpotifyMetadataProbe()
    private let musicProbe = MusicMetadataProbe()
    private let pollingQueue = DispatchQueue(label: "MacOSSensing.MediaMonitor.polling", qos: .userInitiated)

    private var metadataTimer: Timer?
    private var currentTrack: TrackInfo?

    public private(set) var activeBundleID: String?

    private init() {}

    public func startMonitoring() {
        guard metadataTimer == nil else { return }
        startMetadataTimer()
        refreshMetadata()
    }

    public func stopMonitoring() {
        metadataTimer?.invalidate()
        metadataTimer = nil
        currentTrack = nil
        activeBundleID = nil
    }

    public func togglePlayback() {
        controlCoordinator.togglePlayback(for: activeBundleID)
    }

    public func skipToNext() {
        controlCoordinator.skipToNext(for: activeBundleID)
    }

    public func skipToPrevious() {
        controlCoordinator.skipToPrevious(for: activeBundleID)
    }

    // MARK: - Polling

    private func startMetadataTimer() {
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshMetadata()
        }
        RunLoop.main.add(timer, forMode: .common)
        metadataTimer = timer
    }

    private func refreshMetadata() {
        pollingQueue.async { [weak self] in
            guard let self else { return }
            let snapshot = self.captureSnapshot()
            DispatchQueue.main.async {
                self.apply(snapshot: snapshot)
            }
        }
    }

    private func captureSnapshot() -> MediaSnapshot? {
        if let spotify = spotifyProbe.snapshot() {
            return MediaSnapshot(track: spotify, bundleID: spotify.sourceBundleID)
        }

        if let music = musicProbe.snapshot() {
            return MediaSnapshot(track: music, bundleID: music.sourceBundleID)
        }

        // Fallback to MPNowPlayingInfoCenter for generic sources (must be on main thread)
        return DispatchQueue.main.sync {
            nowPlayingSnapshot().map { MediaSnapshot(track: $0, bundleID: $0.sourceBundleID) }
        }
    }

    private func apply(snapshot: MediaSnapshot?) {
        activeBundleID = snapshot?.bundleID

        // Check if track metadata changed (title, artist, playing state)
        let trackChanged = snapshot?.track != currentTrack
        
        // Also check if artwork presence changed (nil -> image or image -> nil)
        // This ensures we update even when only artwork is added/removed
        let currentHasArtwork = currentTrack?.artwork != nil
        let newHasArtwork = snapshot?.track.artwork != nil
        let artworkPresenceChanged = currentHasArtwork != newHasArtwork
        
        // If track is the same but artwork was just added, force update
        guard trackChanged || artworkPresenceChanged else { return }

        currentTrack = snapshot?.track
        onTrackChange?(currentTrack)
    }

    private func nowPlayingSnapshot() -> TrackInfo? {
        // Must be called on main thread
        guard Thread.isMainThread else {
            return nil
        }
        
        guard let info = nowPlayingCenter.nowPlayingInfo else { return nil }

        let title = (info[MPMediaItemPropertyTitle] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let artist = (info[MPMediaItemPropertyArtist] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let playbackRate = info[MPNowPlayingInfoPropertyPlaybackRate] as? NSNumber
        let isPlaying = (playbackRate?.doubleValue ?? 0) > 0.01

        let artwork: NSImage?
        if let artworkItem = info[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork {
            artwork = artworkItem.image(at: CGSize(width: 64, height: 64))
        } else {
            artwork = nil
        }

        return TrackInfo(
            title: title?.isEmpty == false ? title! : "Unknown",
            artist: artist?.isEmpty == false ? artist! : "Unknown",
            artwork: artwork,
            isPlaying: isPlaying,
            sourceBundleID: nil
        )
    }
}

// MARK: - Snapshot + probes

private struct MediaSnapshot {
    let track: TrackInfo
    let bundleID: String?
}

private protocol MediaAppProbe {
    func snapshot() -> TrackInfo?
}

private struct SpotifyMetadataProbe: MediaAppProbe {
    private static let separator = "||LEFOCUS_SPOTIFY||"

    func snapshot() -> TrackInfo? {
        guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
        guard !response.isEmpty else { return nil }
        let components = response.components(separatedBy: Self.separator)
        guard components.count >= 3 else { return nil }

        let isPlaying = components[2].lowercased() == "playing"
        guard components[0].isEmpty == false || components[1].isEmpty == false else {
            return nil
        }

        return TrackInfo(
            title: components[0].isEmpty ? "Unknown" : components[0],
            artist: components[1].isEmpty ? "Unknown" : components[1],
            artwork: nil,
            isPlaying: isPlaying,
            sourceBundleID: "com.spotify.client"
        )
    }

    private static let script = """
    set separator to "\(SpotifyMetadataProbe.separator)"
    if application "Spotify" is not running then
        return ""
    end if
    tell application "Spotify"
        if player state is stopped then
            return ""
        end if
        set trackName to name of current track
        set trackArtist to artist of current track
        set trackState to player state as string
        return trackName & separator & trackArtist & separator & trackState
    end tell
    """
}

private struct MusicMetadataProbe: MediaAppProbe {
    private static let separator = "||LEFOCUS_MUSIC||"

    func snapshot() -> TrackInfo? {
        guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
        guard !response.isEmpty else { return nil }
        let components = response.components(separatedBy: Self.separator)
        guard components.count >= 3 else { return nil }

        let isPlaying = components[2].lowercased() == "playing"
        guard components[0].isEmpty == false || components[1].isEmpty == false else {
            return nil
        }

        return TrackInfo(
            title: components[0].isEmpty ? "Unknown" : components[0],
            artist: components[1].isEmpty ? "Unknown" : components[1],
            artwork: nil,
            isPlaying: isPlaying,
            sourceBundleID: "com.apple.Music"
        )
    }

    private static let script = """
    set separator to "\(MusicMetadataProbe.separator)"
    if application "Music" is not running then
        return ""
    end if
    tell application "Music"
        if player state is stopped then
            return ""
        end if
        set trackName to name of current track
        set trackArtist to artist of current track
        set trackState to player state as string
        return trackName & separator & trackArtist & separator & trackState
    end tell
    """
}
