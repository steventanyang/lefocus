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
    private let albumArtCoordinator = AlbumArtCoordinator.shared

    private var metadataTimer: Timer?
    private var metadataInterval: TimeInterval = 1.0
    private var isPolling = false
    private var currentTrack: TrackInfo?
    private var pendingArtworkTimestamp: Date?

    public private(set) var activeBundleID: String?

    private init() {}

    public func startMonitoring() {
        guard metadataTimer == nil else { return }
        metadataInterval = 1.0
        isPolling = false
        ensureMetadataTimer()
        refreshMetadata()
    }

    public func stopMonitoring() {
        metadataTimer?.invalidate()
        metadataTimer = nil
        metadataInterval = 1.0
        isPolling = false
        currentTrack = nil
        activeBundleID = nil
        pendingArtworkTimestamp = nil
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

    public func seek(to position: TimeInterval, bundleID: String?) {
        controlCoordinator.seek(to: position, bundleID: bundleID)
    }

    // MARK: - Polling

    private func ensureMetadataTimer() {
        guard metadataTimer == nil else { return }
        scheduleMetadataTimer(interval: metadataInterval)
    }

    private func scheduleMetadataTimer(interval: TimeInterval) {
        metadataTimer?.invalidate()
        let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            self?.refreshMetadata()
        }
        RunLoop.main.add(timer, forMode: .common)
        metadataTimer = timer
        metadataInterval = interval
    }

    private func refreshMetadata() {
        guard !isPolling else { return }
        isPolling = true
        pollingQueue.async { [weak self] in
            guard let self else { return }
            let snapshot = self.captureSnapshot()
            DispatchQueue.main.async {
                self.apply(snapshot: snapshot)
                let desiredInterval: TimeInterval = snapshot?.track.isPlaying == true ? 0.5 : 1.0
                if abs(desiredInterval - self.metadataInterval) > 0.01 {
                    self.scheduleMetadataTimer(interval: desiredInterval)
                }
                self.isPolling = false
            }
        }
    }

    private func captureSnapshot() -> MediaSnapshot? {
        if let spotify = spotifyProbe.snapshot() {
            return MediaSnapshot(
                track: spotify.track,
                bundleID: spotify.track.sourceBundleID,
                artworkHint: spotify.hint
            )
        }

        if let music = musicProbe.snapshot() {
            return MediaSnapshot(
                track: music.track,
                bundleID: music.track.sourceBundleID,
                artworkHint: music.hint
            )
        }

        // Fallback to MPNowPlayingInfoCenter for generic sources
        if let nowPlaying = nowPlayingSnapshot() {
            return MediaSnapshot(track: nowPlaying, bundleID: nowPlaying.sourceBundleID, artworkHint: nil)
        }
        return nil
    }

    private func apply(snapshot: MediaSnapshot?) {
        activeBundleID = snapshot?.bundleID

        guard let snapshot else {
            if currentTrack != nil {
                currentTrack = nil
                onTrackChange?(nil)
            }
            pendingArtworkTimestamp = nil
            return
        }

        var track = snapshot.track
        if let current = currentTrack,
           track.artwork == nil,
           let cachedArtwork = current.artwork,
           current.matchesIdentity(with: track) {
            track = track.replacingArtwork(cachedArtwork)
        }
        let baseTrackChanged = track != currentTrack
        if !baseTrackChanged, let existingTimestamp = currentTrack?.timestamp {
            track = TrackInfo(
                title: track.title,
                artist: track.artist,
                artwork: track.artwork,
                isPlaying: track.isPlaying,
                timestamp: existingTimestamp,
                sourceBundleID: track.sourceBundleID,
                position: track.position,
                duration: track.duration,
                canSeek: track.canSeek
            )
        }
        let trackChanged = baseTrackChanged
        let playbackChanged = currentTrack?.position != track.position ||
            currentTrack?.duration != track.duration ||
            currentTrack?.canSeek != track.canSeek
        let currentHasArtwork = currentTrack?.artwork != nil
        let newHasArtwork = track.artwork != nil
        let artworkPresenceChanged = currentHasArtwork != newHasArtwork

        if trackChanged || artworkPresenceChanged || playbackChanged {
            currentTrack = track
            onTrackChange?(track)
            if trackChanged {
                pendingArtworkTimestamp = nil
            }
        }

        requestArtworkIfNeeded(for: track, hint: snapshot.artworkHint, bundleID: snapshot.bundleID)
    }

    private func requestArtworkIfNeeded(for track: TrackInfo, hint: ArtworkHint?, bundleID: String?) {
        guard track.artwork == nil, let hint else {
            return
        }
        if pendingArtworkTimestamp == track.timestamp {
            return
        }
        pendingArtworkTimestamp = track.timestamp

        let request = ArtworkRequest(
            title: track.title,
            artist: track.artist,
            bundleID: bundleID,
            hint: hint,
            timestamp: track.timestamp
        )

        albumArtCoordinator.requestArtwork(for: request) { [weak self] result in
            guard let self else { return }
            guard let current = self.currentTrack else {
                self.pendingArtworkTimestamp = nil
                return
            }
            guard current.timestamp == result.request.timestamp else {
                if result.image == nil {
                    self.pendingArtworkTimestamp = nil
                }
                return
            }
            guard let image = result.image else {
                self.pendingArtworkTimestamp = nil
                return
            }

            let updated = current.replacingArtwork(image)

            self.currentTrack = updated
            self.onTrackChange?(updated)
            self.pendingArtworkTimestamp = nil
        }
    }

    private func nowPlayingSnapshot() -> TrackInfo? {
        if !Thread.isMainThread {
            return DispatchQueue.main.sync { self.nowPlayingSnapshot() }
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

        let position = info[MPNowPlayingInfoPropertyElapsedPlaybackTime] as? TimeInterval
        let duration = info[MPMediaItemPropertyPlaybackDuration] as? TimeInterval

        return TrackInfo(
            title: title?.isEmpty == false ? title! : "Unknown",
            artist: artist?.isEmpty == false ? artist! : "Unknown",
            artwork: artwork,
            isPlaying: isPlaying,
            sourceBundleID: nil,
            position: position,
            duration: duration,
            canSeek: false
        )
    }
}

// MARK: - Snapshot + probes

private struct MediaSnapshot {
    let track: TrackInfo
    let bundleID: String?
    let artworkHint: ArtworkHint?
}

private protocol MediaAppProbe {
    func snapshot() -> ProbeResult?
}

private struct ProbeResult {
    let track: TrackInfo
    let hint: ArtworkHint?
}

private struct SpotifyMetadataProbe: MediaAppProbe {
    private static let separator = "||LEFOCUS_SPOTIFY||"

    func snapshot() -> ProbeResult? {
        guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
        guard !response.isEmpty else { return nil }
        let components = response.components(separatedBy: Self.separator)
        guard components.count >= 3 else { return nil }

        let isPlaying = components[2].lowercased() == "playing"
        guard components[0].isEmpty == false || components[1].isEmpty == false else {
            return nil
        }

        let position: TimeInterval? = components.count >= 6 ? Double(components[4]) : nil
        let durationMs: TimeInterval? = components.count >= 6 ? Double(components[5]) : nil
        let duration = durationMs.map { $0 / 1000.0 }

        let track = TrackInfo(
            title: components[0].isEmpty ? "Unknown" : components[0],
            artist: components[1].isEmpty ? "Unknown" : components[1],
            artwork: nil,
            isPlaying: isPlaying,
            sourceBundleID: "com.spotify.client",
            position: position,
            duration: duration,
            canSeek: true
        )

        let urlString = components.count >= 4 ? components[3].trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let hint: ArtworkHint?
        if !urlString.isEmpty, let url = URL(string: urlString) {
            hint = .spotify(url: url)
        } else {
            hint = nil
        }

        return ProbeResult(track: track, hint: hint)
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
        set artUrl to ""
        try
            set artUrl to artwork url of current track
        end try
        set pos to player position as string
        set dur to duration of current track as string
        return trackName & separator & trackArtist & separator & trackState & separator & artUrl & separator & pos & separator & dur
    end tell
    """
}

private struct MusicMetadataProbe: MediaAppProbe {
    private static let separator = "||LEFOCUS_MUSIC||"

    func snapshot() -> ProbeResult? {
        guard let response = AppleScriptRunner.evaluateString(Self.script) else { return nil }
        guard !response.isEmpty else { return nil }
        let components = response.components(separatedBy: Self.separator)
        guard components.count >= 3 else { return nil }

        let isPlaying = components[2].lowercased() == "playing"
        guard components[0].isEmpty == false || components[1].isEmpty == false else {
            return nil
        }

        let position: TimeInterval? = components.count >= 6 ? Double(components[4]) : nil
        let duration: TimeInterval? = components.count >= 6 ? Double(components[5]) : nil

        let track = TrackInfo(
            title: components[0].isEmpty ? "Unknown" : components[0],
            artist: components[1].isEmpty ? "Unknown" : components[1],
            artwork: nil,
            isPlaying: isPlaying,
            sourceBundleID: "com.apple.Music",
            position: position,
            duration: duration,
            canSeek: true
        )

        let base64Artwork = components.count >= 4 ? components[3].trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let hint: ArtworkHint?
        if !base64Artwork.isEmpty {
            hint = .appleMusicBase64(base64Artwork)
        } else {
            hint = nil
        }

        return ProbeResult(track: track, hint: hint)
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
        set artData to ""
        set tempPath to ""
        try
            set tempPath to POSIX path of (path to temporary items folder) & "lefocus_music_art_" & (random number from 100000 to 999999)
            set rawData to raw data of artwork 1 of current track
            set fileRef to open for access tempPath with write permission
            set eof fileRef to 0
            write rawData to fileRef
            close access fileRef
            set artData to do shell script "/usr/bin/base64 -i " & quoted form of tempPath
            do shell script "rm " & quoted form of tempPath
        on error
            if tempPath is not "" then
                try
                    do shell script "rm " & quoted form of tempPath
                end try
            end if
        end try
        set pos to player position as string
        set dur to duration of current track as string
        return trackName & separator & trackArtist & separator & trackState & separator & artData & separator & pos & separator & dur
    end tell
    """
}
